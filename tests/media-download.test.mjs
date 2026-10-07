import assert from 'node:assert/strict';
import { createCipheriv, createHmac, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import {
    downloadContentFromMessage,
    downloadEncryptedContent,
    encryptedStream,
    getMediaKeys,
    toBuffer
} from '../lib/Utils/messages-media.js';

async function fixture(plaintext = Buffer.from('media payload '.repeat(20))) {
    const mediaKey = randomBytes(32);
    const keys = await getMediaKeys(mediaKey, 'image');
    const cipher = createCipheriv('aes-256-cbc', keys.cipherKey, keys.iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const mac = createHmac('sha256', keys.macKey).update(keys.iv).update(ciphertext).digest().subarray(0, 10);
    return { plaintext, mediaKey, keys, encrypted: Buffer.concat([ciphertext, mac]) };
}

function body(bytes, chunkSize = 17) {
    return Readable.from((function* () {
        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
            yield bytes.subarray(offset, offset + chunkSize);
        }
    })());
}

function captureTemporaryDirectories(t) {
    const directories = [];
    const original = fs.mkdtemp;
    t.mock.method(fs, 'mkdtemp', async (...args) => {
        const directory = await original(...args);
        directories.push(directory);
        return directory;
    });
    return directories;
}

async function assertRemoved(paths) {
    for (let attempt = 0; attempt < 100; attempt++) {
        const present = await Promise.all(paths.map(path => fs.stat(path).then(() => true, error => {
            if (error.code === 'ENOENT') return false;
            throw error;
        })));
        if (present.every(value => !value)) return;
        await delay(10);
    }
    assert.fail(`Temporary media paths were not removed: ${paths.join(', ')}`);
}

test('authenticated downloads round-trip across network chunk boundaries and remove temporary files', async t => {
    const sample = await fixture(Buffer.from('chunk boundaries '.repeat(10000)));
    for (const chunkSize of [1, 7, 16, 17, 65536]) {
        await t.test(`chunks of ${chunkSize} bytes`, async t => {
            t.mock.method(globalThis, 'fetch', async () => ({ ok: true, body: body(sample.encrypted, chunkSize) }));
            const stream = await downloadContentFromMessage({
                mediaKey: sample.mediaKey, url: 'https://offline.invalid/media'
            }, 'image');
            const temporaryPath = stream.path;
            assert.deepEqual(await toBuffer(stream), sample.plaintext);
            await assertRemoved([temporaryPath, dirname(temporaryPath)]);
        });
    }
});

test('no plaintext stream is returned until its trailing MAC is verified', async t => {
    const sample = await fixture();
    const source = new PassThrough();
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, body: source }));
    let returned = false;
    const pending = downloadEncryptedContent('https://offline.invalid/media', sample.keys);
    void pending.then(() => { returned = true; });
    source.write(sample.encrypted.subarray(0, -10));
    await delay(20);
    assert.equal(returned, false);
    source.end(sample.encrypted.subarray(-10));
    const stream = await pending;
    const temporaryPath = stream.path;
    assert.deepEqual(await toBuffer(stream), sample.plaintext);
    await assertRemoved([dirname(temporaryPath)]);
});

test('tampered and truncated encrypted payloads reject and clean their temporary files', async t => {
    const sample = await fixture();
    const badCiphertext = Buffer.from(sample.encrypted);
    badCiphertext[0] ^= 1;
    const badMac = Buffer.from(sample.encrypted);
    badMac[badMac.length - 1] ^= 1;
    const cases = [
        ['ciphertext changed', badCiphertext],
        ['MAC changed', badMac],
        ['MAC truncated', sample.encrypted.subarray(0, -1)],
        ['MAC removed', sample.encrypted.subarray(0, -10)],
        ['ciphertext truncated', sample.encrypted.subarray(0, 19)],
        ['empty response', Buffer.alloc(0)]
    ];
    for (const [name, bytes] of cases) {
        await t.test(name, async t => {
            const directories = captureTemporaryDirectories(t);
            t.mock.method(globalThis, 'fetch', async () => ({ ok: true, body: body(bytes) }));
            await assert.rejects(downloadEncryptedContent('https://offline.invalid/media', sample.keys),
                /MAC verification failed|Invalid or truncated media payload/);
            assert.equal(directories.length, 1);
            await assertRemoved(directories);
        });
    }
});

test('empty authenticated plaintext is accepted', async t => {
    const sample = await fixture(Buffer.alloc(0));
    const directories = captureTemporaryDirectories(t);
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, body: body(sample.encrypted, 1) }));
    assert.deepEqual(await toBuffer(await downloadEncryptedContent('https://offline.invalid/media', sample.keys)),
        Buffer.alloc(0));
    await assertRemoved(directories);
});

test('byte ranges are exclusive at the end and always authenticate the complete payload', async t => {
    const sample = await fixture(Buffer.from(Array.from({ length: 129 }, (_, index) => index)));
    const ranges = [
        { startByte: 20 },
        { startByte: 0 },
        { endByte: 0 },
        { endByte: 1 },
        { startByte: 16, endByte: 32 },
        { startByte: 128, endByte: 999 },
        { startByte: 999 },
        { startByte: 129, endByte: 129 },
        { startByte: 1, endByte: 1 }
    ];
    for (const range of ranges) {
        await t.test(JSON.stringify(range), async t => {
            const directories = captureTemporaryDirectories(t);
            t.mock.method(globalThis, 'fetch', async (_, options) => {
                assert.equal(new Headers(options.headers).has('range'), false);
                assert.equal(new Headers(options.headers).get('x-test'), 'preserved');
                return { ok: true, body: body(sample.encrypted, 1) };
            });
            const stream = await downloadEncryptedContent('https://offline.invalid/media', sample.keys, {
                ...range, options: { headers: new Headers({ range: 'bytes=1-3', 'x-test': 'preserved' }) }
            });
            assert.deepEqual(await toBuffer(stream),
                sample.plaintext.subarray(range.startByte ?? 0, range.endByte));
            await assertRemoved(directories);
        });
    }
    await t.test('tampering outside the requested range still rejects', async t => {
        const changed = Buffer.from(sample.encrypted);
        changed[changed.length - 11] ^= 1;
        t.mock.method(globalThis, 'fetch', async () => ({ ok: true, body: body(changed) }));
        await assert.rejects(downloadEncryptedContent('https://offline.invalid/media', sample.keys, { endByte: 1 }),
            /MAC verification failed/);
    });
});

test('invalid ranges and a missing MAC key fail before fetching', async t => {
    const sample = await fixture();
    const fetch = t.mock.method(globalThis, 'fetch', async () => assert.fail('must not fetch'));
    for (const range of [{ startByte: -1 }, { endByte: -1 }, { startByte: 1.5 },
        { endByte: Infinity }, { startByte: NaN }, { startByte: 5, endByte: 4 }]) {
        await assert.rejects(downloadEncryptedContent('https://offline.invalid/media', sample.keys, range),
            /Invalid media byte range/);
    }
    await assert.rejects(downloadEncryptedContent('https://offline.invalid/media', {
        cipherKey: sample.keys.cipherKey, iv: sample.keys.iv
    }), /Media MAC key is required/);
    assert.equal(fetch.mock.callCount(), 0);
});

test('a source connection error rejects the download without escaping the promise', async t => {
    const sample = await fixture();
    const directories = captureTemporaryDirectories(t);
    const source = new Readable({
        read() {
            if (this.started) return;
            this.started = true;
            this.push(sample.encrypted.subarray(0, 16));
            setImmediate(() => this.destroy(new Error('synthetic connection reset')));
        }
    });
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, body: source }));
    await assert.rejects(downloadEncryptedContent('https://offline.invalid/media', sample.keys),
        /synthetic connection reset/);
    assert.equal(source.destroyed, true);
    await assertRemoved(directories);
});

test('aborting an in-progress download destroys the source and removes temporary files', async t => {
    const sample = await fixture();
    const directories = captureTemporaryDirectories(t);
    const controller = new AbortController();
    const source = new PassThrough();
    let requested;
    const requestStarted = new Promise(resolve => { requested = resolve; });
    t.mock.method(globalThis, 'fetch', async (_, options) => {
        assert.equal(options.signal, controller.signal);
        requested();
        return { ok: true, body: source };
    });
    const pending = downloadEncryptedContent('https://offline.invalid/media', sample.keys, {
        options: { signal: controller.signal }
    });
    const rejection = assert.rejects(pending, { name: 'AbortError' });
    await requestStarted;
    controller.abort();
    await rejection;
    assert.equal(source.destroyed, true);
    await assertRemoved(directories);
});

test('destroying or aborting a returned stream without consuming it removes its temporary file', async t => {
    for (const abort of [false, true]) {
        await t.test(abort ? 'abort' : 'destroy', async t => {
            const sample = await fixture();
            const controller = new AbortController();
            t.mock.method(globalThis, 'fetch', async () => ({ ok: true, body: body(sample.encrypted) }));
            const stream = await downloadEncryptedContent('https://offline.invalid/media', sample.keys, {
                options: { signal: controller.signal }
            });
            const temporaryPath = stream.path;
            if (abort) {
                const rejection = assert.rejects(finished(stream), { name: 'AbortError' });
                controller.abort();
                await rejection;
            }
            else {
                const closed = once(stream, 'close');
                stream.destroy();
                await closed;
            }
            await assertRemoved([dirname(temporaryPath)]);
        });
    }
});

test('media encrypted by the upload path is compatible with authenticated download', async t => {
    const plaintext = randomBytes(128 * 1024);
    const uploaded = await encryptedStream(plaintext, 'image');
    try {
        const bytes = await fs.readFile(uploaded.encFilePath);
        t.mock.method(globalThis, 'fetch', async () => ({ ok: true, body: body(bytes, 65536) }));
        const stream = await downloadContentFromMessage({
            mediaKey: uploaded.mediaKey, url: 'https://offline.invalid/media'
        }, 'image');
        const temporaryPath = stream.path;
        assert.deepEqual(await toBuffer(stream), plaintext);
        await assertRemoved([dirname(temporaryPath)]);
    }
    finally {
        await fs.rm(uploaded.encFilePath, { force: true });
    }
});

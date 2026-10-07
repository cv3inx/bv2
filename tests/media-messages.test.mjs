import assert from 'node:assert/strict';
import { createCipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import test from 'node:test';
import { proto } from '../WAProto/index.js';
import { encryptedStream, getMediaKeys } from '../lib/Utils/messages-media.js';
import {
    downloadMediaMessage,
    generateWAMessageContent,
    getAggregateResponsesInEventMessage,
    getAggregateVotesInPollMessage,
    prepareWAMessageMedia
} from '../lib/Utils/messages.js';

test('newsletter and private media caches keep separate uploads while same-mode cache hits are reused', async t => {
    for (const firstNewsletter of [true, false]) {
        await t.test(firstNewsletter ? 'newsletter then private' : 'private then newsletter', async t => {
            t.mock.method(globalThis, 'fetch', async () => ({
                ok: true, body: Readable.from([Buffer.from('document contents')])
            }));
            const uploads = [];
            const options = {
                mediaCache: new Map(),
                upload: async (path, metadata) => {
                    uploads.push({ bytes: await fs.readFile(path), metadata });
                    return { mediaUrl: `https://offline.invalid/${uploads.length}`, directPath: `/media/${uploads.length}` };
                }
            };
            const message = { document: { url: 'https://offline.invalid/input.pdf' } };
            const send = newsletter => prepareWAMessageMedia(message, {
                ...options, jid: newsletter ? '123@newsletter' : '123@s.whatsapp.net'
            });
            const first = await send(firstNewsletter);
            const second = await send(!firstNewsletter);
            const again = await send(!firstNewsletter);
            assert.equal(uploads.length, 2);
            const raw = firstNewsletter ? first : second;
            const encrypted = firstNewsletter ? second : first;
            assert.equal(raw.documentMessage.mediaKey, null);
            assert.equal(encrypted.documentMessage.mediaKey.length, 32);
            assert.notEqual(raw.documentMessage.url, encrypted.documentMessage.url);
            assert.equal(again.documentMessage.url, second.documentMessage.url);
            assert.deepEqual(uploads.find(item => item.metadata.newsletter).bytes, Buffer.from('document contents'));
            await prepareWAMessageMedia(message, {
                ...options, jid: '123@s.whatsapp.net', mediaTypeOverride: 'thumbnail-link'
            });
            assert.equal(uploads.length, 3, 'a different key derivation must not reuse cached media');
        });
    }
});

test('remote media limits use actual byte count, independent of network chunking', async t => {
    for (const chunks of [[60], [30, 30], [100]]) {
        await t.test(`accept ${chunks.join('+')} bytes with limit 100`, async t => {
            t.mock.method(globalThis, 'fetch', async () => ({
                ok: true, body: Readable.from(chunks.map(length => Buffer.alloc(length)))
            }));
            const result = await encryptedStream({ url: 'https://offline.invalid/media' }, 'document', {
                opts: { maxContentLength: 100 }
            });
            try {
                assert.equal(result.fileLength, chunks.reduce((sum, length) => sum + length, 0));
            }
            finally {
                await fs.rm(result.encFilePath, { force: true });
            }
        });
    }
    await t.test('reject 101 bytes', async t => {
        t.mock.method(globalThis, 'fetch', async () => ({
            ok: true, body: Readable.from([Buffer.alloc(50), Buffer.alloc(51)])
        }));
        await assert.rejects(encryptedStream({ url: 'https://offline.invalid/media' }, 'document', {
            opts: { maxContentLength: 100 }
        }), /content length exceeded/);
    });
});

test('404 and 410 trigger one reupload, while other HTTP errors do not', async t => {
    const mediaKey = randomBytes(32);
    const keys = await getMediaKeys(mediaKey, 'image');
    const plaintext = Buffer.from('reuploaded media');
    const cipher = createCipheriv('aes-256-cbc', keys.cipherKey, keys.iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const mac = createHmac('sha256', keys.macKey).update(keys.iv).update(ciphertext).digest().subarray(0, 10);
    for (const status of [404, 410, 500]) {
        await t.test(`HTTP ${status}`, async t => {
            let requests = 0;
            let reuploads = 0;
            let failedBody;
            t.mock.method(globalThis, 'fetch', async () => {
                if (++requests === 1) {
                    failedBody = Readable.from([Buffer.from('error response')]);
                    return { ok: false, status, body: failedBody };
                }
                return { ok: true, body: Readable.from([Buffer.concat([ciphertext, mac])]) };
            });
            const pending = downloadMediaMessage({
                message: { imageMessage: { url: 'https://offline.invalid/media', mediaKey } }
            }, 'buffer', {}, {
                logger: { info() {} },
                reuploadRequest: async message => { reuploads++; return message; }
            });
            if (status === 500) {
                await assert.rejects(pending, error => error.output.statusCode === status);
                assert.equal(reuploads, 0);
            }
            else {
                assert.deepEqual(await pending, plaintext);
                assert.equal(reuploads, 1);
                assert.equal(requests, 2);
            }
            assert.equal(failedBody.destroyed, true);
        });
    }
});

test('numeric, signed, zero and hexadecimal text colors survive message generation', async () => {
    for (const [color, expected] of [[0xff0000ff, 0xff0000ff], [-1, 0xffffffff], [0, 0], ['#123456', 0xff123456]]) {
        const message = await generateWAMessageContent({ text: 'status' }, {
            backgroundColor: color, textColorArgb: color
        });
        assert.equal(message.extendedTextMessage.backgroundArgb, expected);
        assert.equal(message.extendedTextMessage.textArgb, expected);
    }
});

test('code messages use JavaScript by default and preserve an explicit language', async () => {
    for (const language of [undefined, 'python']) {
        const message = await generateWAMessageContent({ code: 'x = 1', ...(language ? { language } : {}) }, {});
        const code = message.botForwardedMessage.message.richResponseMessage.submessages[0].codeMetadata;
        assert.equal(code.codeLanguage, language ?? 'javascript');
        assert.equal(code.codeBlocks.map(block => block.codeContent).join(''), 'x = 1');
    }
});

test('poll aggregation supports V1, V2, V3, V5, V6 and future-proof V4 wrappers', () => {
    const options = [{ optionName: 'A' }, { optionName: 'B' }];
    const pollUpdates = [{
        pollUpdateMessageKey: { remoteJid: '123@s.whatsapp.net' },
        vote: { selectedOptions: [createHash('sha256').update('B').digest()] }
    }];
    for (const key of ['pollCreationMessage', 'pollCreationMessageV2', 'pollCreationMessageV3',
        'pollCreationMessageV5', 'pollCreationMessageV6', 'pollCreationMessageV4']) {
        const message = key === 'pollCreationMessageV4'
            ? { [key]: { message: { pollCreationMessageV6: { options } } } }
            : { [key]: { options } };
        assert.deepEqual(getAggregateVotesInPollMessage({ message, pollUpdates }), [
            { name: 'A', voters: [] },
            { name: 'B', voters: ['123@s.whatsapp.net'] }
        ]);
    }
});

test('event aggregation reads decoded response enums and preserves legacy string updates', () => {
    const eventResponses = [
        { eventResponseMessageKey: { remoteJid: 'one@s.whatsapp.net' }, response: proto.Message.EventResponseMessage.create({ response: 1 }) },
        { eventResponseMessageKey: { remoteJid: 'two@s.whatsapp.net' }, response: proto.Message.EventResponseMessage.create({ response: 2 }) },
        { eventResponseMessageKey: { fromMe: true }, response: proto.Message.EventResponseMessage.create({ response: 3 }) },
        { eventResponseMessageKey: { remoteJid: 'legacy@s.whatsapp.net' }, eventResponse: 'GOING' },
        { eventResponseMessageKey: { remoteJid: 'unknown@s.whatsapp.net' }, response: { response: 0 } }
    ];
    assert.deepEqual(getAggregateResponsesInEventMessage({ eventResponses }, 'me@s.whatsapp.net'), [
        { response: 'GOING', responders: ['one@s.whatsapp.net', 'legacy@s.whatsapp.net'] },
        { response: 'NOT_GOING', responders: ['two@s.whatsapp.net'] },
        { response: 'MAYBE', responders: ['me@s.whatsapp.net'] }
    ]);
});

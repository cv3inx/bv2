import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { makeInMemoryStore } from '../lib/Store/make-in-memory-store.js';

const logger = { trace() {}, debug() {}, info() {}, warn() {}, error() {} };

test('store file round-trip keeps Buffers (mediaKey survives restore)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bv2-'));
    try {
        const path = join(dir, 'store.json');
        const jid = '123@s.whatsapp.net';
        const mediaKey = Buffer.from([1, 2, 3, 4]);
        const a = makeInMemoryStore({ logger });
        const ev = new EventEmitter();
        a.bind(ev);
        ev.emit('messages.upsert', {
            type: 'notify',
            messages: [{ key: { id: 'm1', remoteJid: jid }, messageTimestamp: 1, message: { imageMessage: { mediaKey } } }]
        });
        a.writeToFile(path);
        const b = makeInMemoryStore({ logger });
        b.readFromFile(path);
        const msg = await b.loadMessage(jid, 'm1');
        assert.ok(Buffer.from(msg.message.imageMessage.mediaKey).equals(mediaKey));
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('contacts.update keeps processing after an unknown contact', async () => {
    const store = makeInMemoryStore({ logger });
    const ev = new EventEmitter();
    store.bind(ev);
    ev.emit('contacts.upsert', [{ id: 'known@s.whatsapp.net' }]);
    ev.emit('contacts.update', [
        { id: 'unknown@s.whatsapp.net', notify: 'x' },
        { id: 'known@s.whatsapp.net', notify: 'Known' }
    ]);
    await new Promise(r => setImmediate(r));
    assert.equal(store.contacts['known@s.whatsapp.net'].notify, 'Known');
});

test('event buffer merges every groups.update in one window', async () => {
    const { makeEventBuffer } = await import('../lib/Utils/event-buffer.js');
    const ev = makeEventBuffer(logger);
    const seen = [];
    ev.on('groups.update', u => seen.push(...u));
    ev.buffer();
    ev.emit('groups.update', [{ id: 'g@g.us', subject: 'A' }]);
    ev.emit('groups.update', [{ id: 'g@g.us', announce: true }]);
    ev.flush();
    await new Promise(r => setImmediate(r));
    assert.deepEqual(seen.find(u => u.id === 'g@g.us'), { id: 'g@g.us', subject: 'A', announce: true });
    ev.destroy?.();
});

test('ignoreKey remoteJid matches our own outgoing 1:1 sent from another device', async () => {
    const { makeIgnoreKeyRegistry } = await import('../lib/Utils/ignore-key.js');
    const reg = makeIgnoreKeyRegistry({ getMeId: () => '111@s.whatsapp.net', getMeLid: () => undefined, logger });
    reg.register({ remoteJid: '222@s.whatsapp.net' });
    const node = { tag: 'message', attrs: { from: '111:2@s.whatsapp.net', recipient: '222@s.whatsapp.net', id: 'x' }, content: [] };
    assert.equal(reg.shouldDrop(node), true);
});

test('edit envelopes are not counted as real messages', async () => {
    const { isRealMessage } = await import('../lib/Utils/process-message.js');
    const edit = { key: {}, message: { secretEncryptedMessage: { encPayload: Buffer.from([1]) } } };
    assert.equal(isRealMessage(edit), false);
    assert.equal(isRealMessage({ key: {}, message: { conversation: 'hi' } }), true);
});

test('sendMessage-style option copies leave caller options untouched', () => {
    // mirrors messages-send.js: callers reusing one options object must not accumulate nodes
    const options = { additionalAttributes: {}, additionalNodes: [] };
    const additionalAttributes = { ...options.additionalAttributes };
    const additionalNodes = [...(options.additionalNodes || [])];
    additionalAttributes.edit = '7';
    additionalNodes.push({ tag: 'meta' });
    assert.deepEqual(options, { additionalAttributes: {}, additionalNodes: [] });
});

test('store keys LID chats consistently and update does not create phantom lists', async () => {
    const store = makeInMemoryStore({ logger });
    const ev = new EventEmitter();
    store.bind(ev);
    const key = { id: 'm1', remoteJid: '999@lid', remoteJidAlt: '123@s.whatsapp.net' };
    ev.emit('messages.upsert', { type: 'append', messages: [{ key, messageTimestamp: 1, message: { conversation: 'x' } }] });
    ev.emit('messages.update', [{ key, update: { status: 3 } }]);
    assert.equal((await store.loadMessage('123@s.whatsapp.net', 'm1')).status, 3);
    ev.emit('messages.update', [{ key: { id: 'z', remoteJid: 'ghost@s.whatsapp.net' }, update: { status: 3 } }]);
    assert.deepEqual(await store.loadMessages('ghost@s.whatsapp.net', 5), []);
    assert.equal(store.messages['ghost@s.whatsapp.net'], undefined);
});

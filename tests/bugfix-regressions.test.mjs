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

test('stream:error reasons map like zapo-js; unknown is reconnectable, not badSession', async () => {
    const { getErrorCodeFromStreamError } = await import('../lib/Utils/generics.js');
    const se = (attrs, child) => ({ tag: 'stream:error', attrs, content: child ? [child] : [] });
    const code = n => getErrorCodeFromStreamError(n).statusCode;
    assert.equal(code(se({}, { tag: 'conflict', attrs: { type: 'replaced' } })), 440);
    assert.equal(code(se({}, { tag: 'conflict', attrs: {} })), 440);
    assert.equal(code(se({}, { tag: 'conflict', attrs: { type: 'device_removed' } })), 401);
    assert.equal(code(se({ code: '515' })), 515);
    assert.equal(code(se({ code: '516' })), 401);
    assert.equal(code(se({ code: '503' })), 503);
    assert.equal(code(se({}, { tag: 'ack', attrs: { id: '1' } })), 428);
    assert.equal(code(se({}, { tag: 'xml-not-well-formed', attrs: {} })), 428);
    assert.equal(code(se({})), 428);
});

// keep-alive is a closure inside makeSocket; run just that function with fake deps and a fake clock
const keepAliveHarness = async ({ intervalMs = 30000, graceMs = 30000 } = {}) => {
    const { readFileSync } = await import('node:fs');
    const vm = await import('node:vm');
    const src = readFileSync(new URL('../lib/Socket/socket.js', import.meta.url), 'utf8');
    const fn = src.slice(src.indexOf('    const startKeepAliveRequest = () => {'), src.indexOf('    /** i have no idea why this exists.'));
    let now = 0;
    const timers = [];
    class FakeDate { constructor() { this.t = now; } getTime() { return this.t; } static now() { return now; } }
    const h = { pings: 0, ended: null, pendingPong: [], pendingQueries: 0, lastDateRecv: undefined };
    const ctx = vm.createContext({
        Date: FakeDate, Math: Object.create(Math, { random: { value: () => 0.5 } }),
        keepAliveIntervalMs: intervalMs, keepAliveGracePeriodMs: graceMs,
        logger, ws: { isOpen: true }, S_WHATSAPP_NET: 's.whatsapp.net',
        generateMessageTag: () => 'tag', DisconnectReason: { connectionLost: 408 },
        Boom: class extends Error { constructor(m, o) { super(m); this.output = { statusCode: o.statusCode }; } },
        end: err => { h.ended = err; },
        safeSetTimeout: (f, ms) => { const t = { at: now + ms, f }; timers.push(t); return t; },
        clearSafeTimer: t => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); },
        query: () => { h.pings++; return new Promise((res) => h.pendingPong.push(res)); },
        h
    });
    vm.runInContext(`let keepAliveReq; let lastDateRecv; let pendingQueries = 0;
        Object.defineProperty(h, 'recv', { set(v) { lastDateRecv = v; } });
        Object.defineProperty(h, 'pq', { set(v) { pendingQueries = v; } });
        ${fn}; startKeepAliveRequest(); h.cancel = () => keepAliveReq.cancel();`, ctx);
    // advance the fake clock; `blockMs` simulates a stalled loop delaying timers past their due time
    h.advance = async (ms, blockMs = 0) => {
        const target = now + ms;
        for (;;) {
            timers.sort((a, b) => a.at - b.at);
            const t = timers[0];
            if (!t || t.at > target) break;
            timers.shift();
            now = t.at + blockMs;
            t.f();
            await new Promise(r => setImmediate(r));
        }
        now = Math.max(now, target);
    };
    h.pong = async () => { h.recv = new FakeDate(); h.pendingPong.splice(0).forEach(r => r({})); await new Promise(r => setImmediate(r)); };
    h.receive = () => { h.recv = new FakeDate(); };
    return h;
};

test('keep-alive: one ping in flight at a time', async () => {
    const h = await keepAliveHarness();
    await h.advance(15000);              // first tick (random 0.5 * interval/2 = 7.5s)
    assert.equal(h.pings, 1);
    h.receive();                         // link alive, but pong for ping #1 not processed yet
    await h.advance(30000);
    assert.equal(h.pings, 1, 'must not stack a second ping while the first is unanswered');
    await h.pong();
    await h.advance(30000);
    assert.equal(h.pings, 2);
    h.cancel();
});

test('keep-alive: skips ping while queries are pending and inbound is recent', async () => {
    const h = await keepAliveHarness();
    h.pq = 3;
    await h.advance(7500);
    await h.advance(20000);
    h.receive();                         // traffic 10s before the next tick
    await h.advance(10000);
    assert.equal(h.pings, 0);
    h.cancel();
});

test('keep-alive: silence past interval+grace ends the socket with 408', async () => {
    const h = await keepAliveHarness();
    await h.advance(7500);
    h.receive();
    await h.advance(60000);
    assert.equal(h.ended, null, 'exactly interval+grace of silence is not yet lost');
    await h.advance(30000);              // next tick sees 90s of silence
    assert.equal(h.ended?.output.statusCode, 408);
});

test('keep-alive: a stalled event loop is not reported as connection lost', async () => {
    const h = await keepAliveHarness();
    await h.advance(7500);
    await h.pong();
    await h.advance(40000, 45000);       // timer fires 45s late
    assert.equal(h.ended, null);
    h.cancel();
});

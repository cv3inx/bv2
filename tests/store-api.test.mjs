import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { makeInMemoryStore } from '../lib/Store/make-in-memory-store.js';
import { makeGraphQLSocket } from '../lib/Socket/graphql.js';
import { QueryIds } from '../lib/Types/index.js';

const logger = { trace() {}, debug() {}, info() {}, warn() {}, error() {} };
const jid = '123@s.whatsapp.net';
const message = (id, timestamp = 1) => ({
    key: { id, remoteJid: jid },
    messageTimestamp: timestamp,
    message: { conversation: id }
});

test('F02/F19: store receives messages and retains only the newest entries', async () => {
    const store = makeInMemoryStore({ logger, maxMessagesPerChat: 2 });
    const ev = new EventEmitter();
    const unbind = store.bind(ev);
    ev.emit('messages.upsert', {
        type: 'notify',
        messages: [message('a'), message('b'), message('c')]
    });
    assert.equal(store.chats.length, 1);
    assert.deepEqual((await store.loadMessages(jid, 10)).map(m => m.key.id), ['b', 'c']);
    assert.equal(await store.loadMessage(jid, 'a'), undefined);
    assert.equal((await store.loadMessage(jid, 'b')).message.conversation, 'b');
    unbind();
    assert.equal(ev.listenerCount('messages.upsert'), 0);
});

test('F19: store evicts oldest chats and enforces limits on restored snapshots', () => {
    const store = makeInMemoryStore({ logger, maxChats: 2, maxMessagesPerChat: 2 });
    const ev = new EventEmitter();
    store.bind(ev);
    ev.emit('chats.upsert', [
        { id: 'old', conversationTimestamp: 1 },
        { id: 'middle', conversationTimestamp: 2 },
        { id: 'new', conversationTimestamp: 3 }
    ]);
    assert.deepEqual(store.chats.all().map(c => c.id), ['new', 'middle']);
    store.fromJSON({
        chats: [],
        contacts: {},
        messages: { [jid]: [message('a'), message('b'), message('c')] }
    });
    assert.deepEqual(store.messages[jid].array.map(m => m.key.id), ['b', 'c']);
});

test('F02/F19: history sync keeps the newest messages in chronological order', () => {
    const store = makeInMemoryStore({ logger, maxMessagesPerChat: 2 });
    const ev = new EventEmitter();
    store.bind(ev);
    ev.emit('messaging-history.set', {
        chats: [{ id: jid, conversationTimestamp: 3 }],
        contacts: [],
        messages: [message('new', 3), message('middle', 2), message('old', 1)],
        isLatest: true
    });
    assert.deepEqual(store.messages[jid].array.map(m => m.key.id), ['middle', 'new']);
});

test('F20: participant promotion never matches missing identifiers', () => {
    const store = makeInMemoryStore({ logger });
    const ev = new EventEmitter();
    store.bind(ev);
    store.groupMetadata.group = {
        participants: [{ id: 'one@lid' }, { id: 'two@lid' }, { id: 'three@lid', phoneNumber: 'three@pn' }]
    };
    ev.emit('group-participants.update', { id: 'group', action: 'promote', participants: [{ id: 'one@lid' }] });
    assert.equal(store.groupMetadata.group.participants[0].admin, 'admin');
    assert.equal(store.groupMetadata.group.participants[1].admin, undefined);
    ev.emit('group-participants.update', { id: 'group', action: 'promote', participants: [{ phoneNumber: 'three@pn' }] });
    assert.equal(store.groupMetadata.group.participants[2].admin, 'admin');
});

test('F28: token acquisition retries after transient failure and shares concurrent requests', async () => {
    let calls = 0;
    const sock = makeGraphQLSocket({
        wwwGetNonce: async () => {
            if (++calls === 1) throw new Error('transient');
            return { nonce: 'nonce' };
        },
        wwwExchangeNonce: async () => ({ access_token: 'token' })
    });
    await assert.rejects(sock.acquireAccessToken(), /transient/);
    assert.deepEqual(await Promise.all([sock.acquireAccessToken(), sock.acquireAccessToken()]), ['token', 'token']);
    assert.equal(calls, 2);
    assert.equal(await sock.acquireAccessToken(), 'token');
});

test('F28: a stale token request cannot overwrite an explicitly replaced token', async () => {
    let release;
    const sock = makeGraphQLSocket({
        wwwGetNonce: () => new Promise(resolve => { release = resolve; }),
        wwwExchangeNonce: async () => ({ access_token: 'old' })
    });
    const pending = sock.acquireAccessToken();
    sock.setAccessToken('new');
    release({ nonce: 'nonce' });
    await pending;
    assert.equal(await sock.acquireAccessToken(), 'new');
});

test('F29: opening a connection follows the owner channel and handles follow failures', async () => {
    const ev = new EventEmitter();
    const calls = [];
    const warnings = [];
    let failFollow = false;
    const url = new URL('../lib/Socket/newsletter.js', import.meta.url);
    const module = new vm.SourceTextModule(await readFile(url, 'utf8'), { identifier: url.href });
    await module.link(async specifier => {
        const exports = specifier === './groups.js'
            ? { makeGroupsSocket: () => ({
                ev, generateMessageTag: () => 'test',
                query: async node => {
                    calls.push(node);
                    if (failFollow) throw new Error('newsletter temporarily unavailable');
                    return { content: [{ tag: 'result', content: Buffer.from('{"data":{"xwa2_newsletter_join_v2":{}}}') }] };
                }
            }) }
            : await import(new URL(specifier, url));
        return new vm.SyntheticModule(Object.keys(exports), function () {
            for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
        });
    });
    await module.evaluate();
    const sock = module.namespace.makeNewsletterSocket({
        logger: { ...logger, warn: (...args) => warnings.push(args) }
    });
    ev.emit('connection.update', { connection: 'connecting' });
    ev.emit('connection.update', { qr: 'pairing' });
    ev.emit('connection.update', { connection: 'close' });
    assert.equal(calls.length, 0);
    ev.emit('connection.update', { connection: 'open' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].content[0].attrs.query_id, QueryIds.FOLLOW);
    assert.equal(JSON.parse(calls[0].content[0].content).variables.newsletter_id, '120363417337256584@newsletter');

    ev.emit('connection.update', { connection: 'close' });
    ev.emit('connection.update', { connection: 'open' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 2);
    assert.equal(JSON.parse(calls[1].content[0].content).variables.newsletter_id, '120363417337256584@newsletter');

    await sock.newsletterFollow('explicit@newsletter');
    assert.equal(calls.length, 3);
    assert.equal(JSON.parse(calls[2].content[0].content).variables.newsletter_id, 'explicit@newsletter');

    failFollow = true;
    ev.emit('connection.update', { connection: 'open' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 4);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0][0].err.message, 'newsletter temporarily unavailable');
});

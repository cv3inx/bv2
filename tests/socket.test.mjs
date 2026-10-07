import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { Boom } from '@hapi/boom';
import * as binary from '../lib/WABinary/index.js';
import { makeKeyedMutex, makeMutex } from '../lib/Utils/make-mutex.js';

const logger = Object.fromEntries(['trace', 'debug', 'info', 'warn', 'error'].map(name => [name, () => {}]));
const nextTurn = () => new Promise(resolve => setImmediate(resolve));
const sendSource = readFileSync(new URL('../lib/Socket/messages-send.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace('export const makeMessagesSocket', 'const makeMessagesSocket');

// Evaluate the real socket factory with transport, crypto and storage boundaries replaced.
// No connection or real credentials are used by these regression tests.
function makeSendHarness() {
    const controls = {
        sendError: undefined, failedRecipients: new Set(), missingSessions: false,
        mappings: [], sent: [], queries: [], echoes: [], deviceFetches: 0,
        cacheReads: 0, inTransaction: false, issueTokens: false, tokenStartedInside: undefined
    };
    const stored = {};
    const deviceCache = new Map();
    const endHandlers = [];
    const authState = {
        creds: { me: { id: '100:1@s.whatsapp.net', lid: '200:1@lid' } },
        keys: {
            get: async (type, ids) => Object.fromEntries(ids
                .filter(id => stored[type]?.[id] !== undefined)
                .map(id => [id, stored[type][id]])),
            set: async update => {
                for (const [type, values] of Object.entries(update)) {
                    Object.assign(stored[type] ??= {}, values);
                }
            },
            transaction: async work => {
                controls.inTransaction = true;
                try {
                    return await work();
                } finally {
                    controls.inTransaction = false;
                }
            }
        }
    };
    const signalRepository = {
        lidMapping: {
            getLIDForPN: async () => null,
            getPNForLID: async () => null,
            getLIDsForPNs: async () => controls.mappings
        },
        validateSession: async () => ({ exists: !controls.missingSessions }),
        encryptMessage: async ({ jid }) => {
            if (controls.failedRecipients.has(jid)) throw new Error('encryption failed');
            return { type: 'msg', ciphertext: Buffer.from('encrypted') };
        },
        encryptGroupMessage: async () => ({
            ciphertext: Buffer.from('group ciphertext'),
            senderKeyDistributionMessage: Buffer.from('sender key')
        })
    };
    const sock = {
        authState, signalRepository, ev: {}, serverProps: {},
        registerSocketEndHandler: handler => endHandlers.push(handler),
        query: async node => {
            controls.queries.push(node);
            return { tag: 'iq', attrs: {}, content: [] };
        },
        groupMetadata: async () => ({
            participants: [{ id: '300:1@lid' }, { id: '400:1@lid' }]
        }),
        executeUSyncQuery: async query => {
            controls.deviceFetches++;
            return { list: query.users.map(({ id }) => ({ ...binary.jidDecode(id), device: 0 })) };
        },
        sendNode: async node => {
            if (controls.sendError) throw controls.sendError;
            controls.sent.push(node);
        },
        messageMutex: makeMutex(),
        upsertMessage: async message => controls.echoes.push(message)
    };
    class USyncQuery {
        users = [];
        withContext() { return this; }
        withDeviceProtocol() { return this; }
        withLIDProtocol() { return this; }
        withUser(user) { this.users.push(user); return this; }
    }
    class USyncUser {
        withId(id) { this.id = id; return this; }
    }
    const context = vm.createContext({
        Buffer, console, process, setImmediate, setTimeout, clearTimeout, Boom,
        ...binary, makeMutex, makeKeyedMutex, USyncQuery, USyncUser,
        makeNewsletterSocket: () => sock,
        DEFAULT_CACHE_TTLS: {}, getWAUploadToServer: () => {}, bindWaitForEvent: () => {},
        assertMeId: creds => creds.me.id,
        normalizeMessageContent: message => message,
        encodeNewsletterMessage: () => Buffer.from('newsletter'),
        encodeWAMessage: () => Buffer.from('message'),
        generateMessageIDV2: () => 'test-message',
        generateParticipantHashV2: () => 'participant-hash',
        generateWAMessage: async (jid, content) => ({
            key: { id: 'test-message', remoteJid: jid, fromMe: true },
            message: { conversation: content.text }
        }),
        shouldIncludeBizBinaryNode: () => false,
        parseAndInjectE2ESessions: async () => {},
        extractDeviceJids: list => list,
        resolveTcTokenJid: async jid => jid,
        shouldSendNewTcToken: () => controls.issueTokens,
        unixTimestampSeconds: () => 123,
        resolveIssuanceJid: async jid => {
            controls.tokenStartedInside = controls.inTransaction;
            return jid;
        },
        storeTcTokensFromIqResult: async () => {},
        buildMergedTcTokenIndexWrite: async () => ({}),
        DEF_MEDIA_HOST: 'example.invalid'
    });
    vm.runInContext(`${sendSource}\nglobalThis.make = makeMessagesSocket;`, context, {
        filename: 'lib/Socket/messages-send.js'
    });
    const socket = context.make({
        logger, emitOwnEvents: true, patchMessageBeforeSending: async message => message,
        userDevicesCache: {
            mget: async users => {
                controls.cacheReads++;
                return Object.fromEntries(users.filter(user => deviceCache.has(user))
                    .map(user => [user, deviceCache.get(user)]));
            },
            mset: async entries => {
                for (const { key, value } of entries) deviceCache.set(key, value);
            }
        }
    });
    return { socket, controls, stored, deviceCache };
}

test('send failures reject and do not emit own-message success events', async () => {
    const { socket, controls } = makeSendHarness();
    controls.sendError = new Error('Connection Closed');
    await assert.rejects(socket.sendMessage('123@newsletter', { text: 'hello' }), /Connection Closed/);
    assert.equal(controls.sent.length, 0);
    await nextTurn();
    assert.equal(controls.echoes.length, 0);
    controls.sendError = undefined;
    const message = await socket.sendMessage('123@newsletter', { text: 'hello' });
    await nextTurn();
    assert.equal(controls.echoes[0].key.id, message.key.id);
    assert.equal(controls.sent.length, 1);
});

test('group sender-key memory only records successful recipients and retries missing keys', async () => {
    const { socket, controls, stored } = makeSendHarness();
    controls.failedRecipients.add('400:1@lid');
    await socket.relayMessage('123@g.us', { conversation: 'first' }, {});
    assert.equal(stored['sender-key-memory']['123@g.us']['300:1@lid'], true);
    assert.equal(stored['sender-key-memory']['123@g.us']['400:1@lid'], undefined);
    controls.failedRecipients.clear();
    await socket.relayMessage('123@g.us', { conversation: 'second' }, {});
    const participants = controls.sent.at(-1).content.find(node => node.tag === 'participants').content;
    assert.deepEqual(Array.from(participants, node => node.attrs.jid), ['400:1@lid']);
    assert.equal(stored['sender-key-memory']['123@g.us']['400:1@lid'], true);
});

test('failed group transport or all-recipient encryption does not mutate cached sender-key state', async () => {
    const { socket, controls, stored } = makeSendHarness();
    const existing = {};
    stored['sender-key-memory'] = { '123@g.us': existing };
    controls.sendError = new Error('transport failed');
    await assert.rejects(socket.relayMessage('123@g.us', { conversation: 'first' }, {}), /transport failed/);
    assert.deepEqual(existing, {});
    controls.sendError = undefined;
    controls.failedRecipients = new Set(['300:1@lid', '400:1@lid']);
    await assert.rejects(socket.relayMessage('123@g.us', { conversation: 'first' }, {}), /All encryptions failed/);
    assert.deepEqual(existing, {});
    assert.equal(controls.sent.length, 0);
});

test('session queries preserve unmapped PNs and map device-zero aliases correctly', async () => {
    const { socket, controls } = makeSendHarness();
    controls.missingSessions = true;
    controls.mappings = [{ pn: '300@s.whatsapp.net', lid: '600@lid' }];
    assert.equal(await socket.assertSessions(['300:0@s.whatsapp.net', '400@s.whatsapp.net', '500:2@lid']), true);
    const recipients = controls.queries.at(-1).content[0].content;
    assert.deepEqual(Array.from(recipients, node => node.attrs.jid), [
        '600@lid', '400@s.whatsapp.net', '500:2@lid'
    ]);
});

test('private message cache bypass performs USync even with cached devices', async () => {
    const { socket, controls, deviceCache } = makeSendHarness();
    deviceCache.set('100', [{ user: '100', server: 's.whatsapp.net', device: 0 }]);
    deviceCache.set('300', [{ user: '300', server: 's.whatsapp.net', device: 0 }]);
    await socket.relayMessage('300@s.whatsapp.net', { conversation: 'cached' }, {});
    assert.equal(controls.deviceFetches, 0);
    const reads = controls.cacheReads;
    await socket.relayMessage('300@s.whatsapp.net', { conversation: 'refresh' }, { useUserDevicesCache: false });
    assert.equal(controls.deviceFetches, 1);
    assert.equal(controls.cacheReads, reads);
});

test('privacy-token issuance starts outside the completed message-key transaction', async () => {
    const { socket, controls, stored } = makeSendHarness();
    controls.issueTokens = true;
    await socket.relayMessage('300@s.whatsapp.net', { conversation: 'hello' }, {});
    await nextTurn();
    assert.equal(controls.tokenStartedInside, false);
    assert.equal(stored.tctoken['300@s.whatsapp.net'].senderTimestamp, 123);
});

const recvSource = readFileSync(new URL('../lib/Socket/messages-recv.js', import.meta.url), 'utf8');
const retrySource = recvSource.slice(
    recvSource.indexOf('    const willSendMessageAgain ='),
    recvSource.indexOf('    const recoverAltFromLidStore =')
);

for (const limit of [1, 3]) {
    test(`retry receipts allow exactly ${limit} resend attempts`, async () => {
        const cache = new Map();
        let resends = 0;
        let acked = 0;
        const context = vm.createContext({
            ...binary, logger, maxMsgRetryCount: limit,
            msgRetryCache: { get: async key => cache.get(key), set: async (key, value) => cache.set(key, value) },
            authState: { creds: { me: { id: '100:1@s.whatsapp.net' } } },
            messageRetryManager: null, getMessage: async () => ({ conversation: 'stored' }),
            signalRepository: { jidToSignalProtocolAddress: jid => jid, injectE2ESession: async () => {} },
            extractE2ESessionFromRetryReceipt: () => ({}), enableAutoSessionRecreation: false,
            relayMessage: async () => { resends++; }, getStatusFromReceiptType: () => undefined,
            receiptMutex: makeMutex(), sendMessageAck: async () => { acked++; }
        });
        vm.runInContext(`${retrySource}\nglobalThis.handleReceipt = handleReceipt;`, context);
        for (let count = 1; count <= limit + 2; count++) {
            await context.handleReceipt({
                tag: 'receipt',
                attrs: { id: 'm1', type: 'retry', from: '300:1@s.whatsapp.net' },
                content: [{ tag: 'retry', attrs: { count: String(count) } }]
            });
        }
        assert.equal(resends, limit);
        assert.equal(cache.get('m1:300:1@s.whatsapp.net'), limit);
        assert.equal(acked, limit + 2);
    });
}

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { Boom } from '@hapi/boom';
import * as binary from '../lib/WABinary/index.js';
import { makeKeyedMutex, makeMutex } from '../lib/Utils/make-mutex.js';
import { generateWAMessageContent, hashImagePollOption } from '../lib/Utils/messages.js';
import { proto } from '../WAProto/index.js';

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
        cacheReads: 0, inTransaction: false, issueTokens: false, tokenStartedInside: undefined,
        hasSenderKey: false, extraDevices: [], uploads: [], reportingToken: false, nextMessageId: 1
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
        }),
        hasSenderKey: async () => controls.hasSenderKey,
        getSenderKeyDistributionMessage: async () => Buffer.from('sender key')
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
            return {
                list: query.users.flatMap(({ id }) => [0, ...controls.extraDevices]
                    .map(device => ({ ...binary.jidDecode(id), device })))
            };
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
        Buffer, console, process, setImmediate, setTimeout, clearTimeout, Boom, proto,
        ...binary, makeMutex, makeKeyedMutex, USyncQuery, USyncUser,
        makeNewsletterSocket: () => sock,
        DEFAULT_CACHE_TTLS: {}, getWAUploadToServer: () => {}, bindWaitForEvent: () => {},
        assertMeId: creds => creds.me.id,
        normalizeMessageContent: message => message,
        encodeNewsletterMessage: () => Buffer.from('newsletter'),
        encodeWAMessage: () => Buffer.from('message'),
        encodeSignedDeviceIdentity: () => Buffer.from('device identity'),
        // unique per call, like the real generator: a child message must not reuse its parent's id
        generateMessageIDV2: () => `test-message-${controls.nextMessageId++}`,
        generateParticipantHashV2: () => 'participant-hash',
        // Text sends keep the cheap stub; an image poll goes through the real content builder so
        // the poll proto this fork emits is what the assertions see.
        generateWAMessage: async (jid, content, options) => ({
            key: { id: options?.messageId || 'test-message-0', remoteJid: jid, fromMe: true },
            message: content.imagePoll
                ? await generateWAMessageContent(content, { logger, ...options })
                : { conversation: content.text }
        }),
        generateWAMessageFromContent: (jid, message, options) => ({
            key: { id: options?.messageId || 'test-message-0', remoteJid: jid, fromMe: true },
            message
        }),
        prepareWAMessageMedia: async ({ image }) => {
            controls.uploads.push(image.url);
            return { imageMessage: { url: image.url, fileSha256: Buffer.from(`sha-${image.url}`) } };
        },
        hashImagePollOption,
        AssociationType: proto.MessageAssociation.AssociationType,
        // a messageSecret (polls, events) opens the reporting-token path
        shouldIncludeReportingToken: () => controls.reportingToken,
        getMessageReportingToken: async () => ({ tag: 'reporting', attrs: {} }),
        setBotMessageSecret: () => {},
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

test('event responses and EVENT_EDIT secrets are sent as type=event', async () => {
    const { socket, controls } = makeSendHarness();
    const sentType = async content => {
        await socket.relayMessage('300@s.whatsapp.net', content, {});
        return controls.sent.at(-1).attrs.type;
    };

    // the case that always worked
    assert.equal(await sentType({ eventMessage: { name: 'Standup' } }), 'event');
    // an event response carries no eventMessage, so it used to fall through to text
    assert.equal(await sentType({ encEventResponseMessage: { eventCreationMessageKey: { id: 'E1' } } }), 'event');
    // an edit secret is only an event when the enc type says so
    const { EVENT_EDIT } = proto.Message.SecretEncryptedMessage.SecretEncType;
    assert.equal(await sentType({ secretEncryptedMessage: { secretEncType: EVENT_EDIT } }), 'event');
    assert.equal(await sentType({ secretEncryptedMessage: { secretEncType: 0 } }), 'text');
    assert.equal(await sentType({ secretEncryptedMessage: {} }), 'text');
    // unrelated content is unaffected
    assert.equal(await sentType({ conversation: 'hi' }), 'text');
    assert.equal(await sentType({ pollCreationMessageV3: { name: 'p' } }), 'poll');
});

test('a group history bundle is sent as mediatype=group_history', async () => {
    const { socket, controls } = makeSendHarness();
    // mediatype rides on the <enc> node, the stanza type on the <message> attrs
    const encAttrs = () => {
        const findEnc = nodes => nodes?.flatMap(node => node.tag === 'enc' ? [node] : findEnc(node.content) || []) || [];
        return findEnc(controls.sent.at(-1).content)[0]?.attrs;
    };

    await socket.relayMessage('123@g.us', { messageHistoryBundle: { fileSha256: Buffer.from('x') } }, {});
    assert.equal(encAttrs().mediatype, 'group_history');
    assert.equal(controls.sent.at(-1).attrs.type, 'media');

    // a plain group message carries no mediatype at all
    await socket.relayMessage('123@g.us', { conversation: 'hi' }, {});
    assert.equal(encAttrs().mediatype, undefined);
    assert.equal(controls.sent.at(-1).attrs.type, 'text');
});

test('an exclusive group message is addressed to one member only', async () => {
    const { socket, controls } = makeSendHarness();
    const quoted = { key: { remoteJid: '123@g.us', id: 'Q1', participant: '300:0@lid', fromMe: false } };

    await socket.sendMessage('123@g.us', { text: 'only you' }, { quoted, exclusive: true });

    const stanza = controls.sent.at(-1);
    assert.equal(stanza.attrs.to, '123@g.us');
    // the participant attribute is what makes the server route to that member alone
    assert.match(stanza.attrs.participant, /^300[:@]/);
    // per-device encryption, not the group sender key every member can decrypt
    const encTypes = stanza.content.filter(node => node.tag === 'enc').map(node => node.attrs.type);
    assert.ok(!encTypes.includes('skmsg'), `expected no skmsg, got ${encTypes.join()}`);
    // nobody else was addressed
    assert.equal(controls.sent.filter(node => node.attrs.id === stanza.attrs.id).length, 1);
});

test('an exclusive message reaches every device of the recipient and nobody else', async () => {
    const { socket, controls } = makeSendHarness();
    controls.extraDevices = [13, 42];
    const quoted = { key: { remoteJid: '123@g.us', id: 'Q1', participant: '300@lid' } };

    await socket.sendMessage('123@g.us', { text: 'only you' }, { quoted, exclusive: true });

    // one stanza per recipient device, all sharing the message id
    assert.equal(controls.sent.length, 3);
    assert.equal(new Set(controls.sent.map(node => node.attrs.id)).size, 1);
    assert.deepEqual(controls.sent.map(node => node.attrs.participant).sort(), ['300:13@lid', '300:42@lid', '300@lid']);
    // every one is still addressed to the group, and the other member (400) is never touched
    assert.ok(controls.sent.every(node => node.attrs.to === '123@g.us'));
    assert.ok(controls.sent.every(node => !node.attrs.participant.startsWith('400')));
});

test('exclusive accepts an explicit jid and still refuses an unresolvable target', async () => {
    const { socket, controls } = makeSendHarness();
    await socket.sendMessage('123@g.us', { text: 'hi' }, { exclusive: '400:0@lid' });
    assert.match(controls.sent.at(-1).attrs.participant, /^400[:@]/);

    // no quote and no explicit jid: there is nobody to address
    await assert.rejects(
        socket.sendMessage('123@g.us', { text: 'hi' }, { exclusive: true }),
        /exclusive requires a quoted message/
    );
    // a quote without a participant (a 1:1 quote) cannot name a group member either
    await assert.rejects(
        socket.sendMessage('123@g.us', { text: 'hi' }, { exclusive: true, quoted: { key: { remoteJid: '300@s.whatsapp.net', id: 'Q' } } }),
        /exclusive requires a quoted message/
    );
});

test('exclusive is rejected outside groups', async () => {
    const { socket } = makeSendHarness();
    const quoted = { key: { remoteJid: '300@s.whatsapp.net', id: 'Q1', participant: '300:0@lid' } };
    await assert.rejects(
        socket.sendMessage('300@s.whatsapp.net', { text: 'hi' }, { quoted, exclusive: true }),
        /only supported in groups/
    );
});

test('a plain group send is unchanged by the exclusive path', async () => {
    const { socket, controls } = makeSendHarness();
    await socket.sendMessage('123@g.us', { text: 'everyone' }, {});
    const stanza = controls.sent.at(-1);
    assert.equal(stanza.attrs.to, '123@g.us');
    assert.equal(stanza.attrs.participant, undefined);
    assert.ok(stanza.content.some(node => node.tag === 'enc' && node.attrs.type === 'skmsg'));
});

test('an image poll sends the parent plus one child per option, associated by MEDIA_POLL', async () => {
    const { socket, controls } = makeSendHarness();
    const sentMessages = [];
    controls.echoes = sentMessages; // emitOwnUpsert pushes the full message objects

    const parent = await socket.sendMessage('300@s.whatsapp.net', {
        imagePoll: {
            name: 'Pilih gambar favorit',
            options: [
                { name: 'Gambar 1', image: { url: 'https://example.invalid/1.jpg' } },
                { name: 'Gambar 2', image: { url: 'https://example.invalid/2.jpg' } }
            ]
        }
    });

    // every option image is uploaded before the parent exists — the hash covers its fileSha256
    assert.deepEqual(controls.uploads, ['https://example.invalid/1.jpg', 'https://example.invalid/2.jpg']);

    const poll = parent.message.pollCreationMessageV3;
    assert.equal(poll.pollContentType, proto.Message.PollContentType.IMAGE);
    assert.equal(poll.selectableOptionsCount, 1);
    // Array.from: the poll content is built inside the vm realm, so its arrays have a different
    // prototype and deepEqual would reject them on identity alone.
    assert.deepEqual(Array.from(poll.options, option => option.optionName), ['Gambar 1', 'Gambar 2']);
    assert.deepEqual(
        Array.from(poll.options, option => option.optionHash),
        ['Gambar 1', 'Gambar 2'].map((name, i) => hashImagePollOption(name, Buffer.from(`sha-https://example.invalid/${i + 1}.jpg`)))
    );
    assert.ok(parent.message.messageContextInfo.messageSecret, 'poll needs a messageSecret');

    // one parent stanza + one per option
    assert.equal(controls.sent.length, 3);
    // the parent carries the poll-creation meta node, without which it does not render
    const meta = controls.sent[0].content.find(node => node.tag === 'meta');
    assert.equal(meta?.attrs.polltype, 'creation');

    await nextTurn();
    const children = sentMessages.filter(message => message.message.pollCreationOptionImageMessage);
    assert.equal(children.length, 2);
    for (const child of children) {
        const association = child.message.messageContextInfo.messageAssociation;
        assert.equal(association.associationType, proto.MessageAssociation.AssociationType.MEDIA_POLL);
        assert.equal(association.parentMessageKey.id, parent.key.id);
        // children are separate messages, so they need their own ids
        assert.notEqual(child.key.id, parent.key.id);
    }
    assert.deepEqual(
        children.map(child => child.message.pollCreationOptionImageMessage.message.imageMessage.url),
        ['https://example.invalid/1.jpg', 'https://example.invalid/2.jpg']
    );
});

test('image poll input is validated before anything is uploaded', async () => {
    const { socket, controls } = makeSendHarness();
    const send = imagePoll => socket.sendMessage('300@s.whatsapp.net', { imagePoll });

    await assert.rejects(send({ name: 'p', options: [] }), /Invalid imagePoll options/);
    await assert.rejects(send({ name: 'p', options: [{ name: 'a' }] }), /every imagePoll option needs an image/);
    assert.deepEqual(controls.uploads, [], 'nothing should be uploaded for a rejected poll');

    await assert.rejects(
        send({ name: 'p', selectableCount: 3, options: [{ name: 'a', image: { url: 'u' } }] }),
        /selectableCount should be >= 0 and <= 1/
    );
    // selectableCount is honoured when it fits
    const ok = await socket.sendMessage('300@s.whatsapp.net', {
        imagePoll: { name: 'p', selectableCount: 2, options: [{ name: 'a', image: { url: 'u1' } }, { name: 'b', image: { url: 'u2' } }] }
    });
    assert.equal(ok.message.pollCreationMessageV3.selectableOptionsCount, 2);
});

test('building image poll content by hand without hashes is refused', async () => {
    await assert.rejects(
        generateWAMessageContent({ imagePoll: { name: 'p', options: [{ optionName: 'a' }] } }, { logger }),
        /must be prepared with hashImagePollOption/
    );
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { ANCHORGUARD_DEFAULTS, createAnchorGuard, detectBug } from '../lib/Utils/anchor-guard.js';

const reason = (message, options) => detectBug(message, options).reasons.join(' | ');

test('a normal message is not flagged', () => {
    const result = detectBug({
        extendedTextMessage: {
            text: 'hello there',
            contextInfo: { mentionedJid: ['5511111111@s.whatsapp.net'] }
        }
    });
    assert.deepEqual(result, { flagged: false, reasons: [] });
});

test('non-object input is handled without throwing', () => {
    for (const input of [null, undefined, 'text', 42]) {
        assert.deepEqual(detectBug(input), { flagged: false, reasons: [] });
    }
});

test('invisible and combining char floods are flagged', () => {
    const invisible = { conversation: 'a' + '​'.repeat(600) + 'b' };
    assert.match(reason(invisible), /invisible-char run 600/);

    const combining = { conversation: 'a' + '́'.repeat(150) };
    assert.match(reason(combining), /combining-char run 150/);

    // runs below the limit stay clean, and a broken run resets the count
    assert.equal(detectBug({ conversation: '​'.repeat(500) }).flagged, false);
    assert.equal(detectBug({ conversation: ('​'.repeat(400) + 'x').repeat(3) }).flagged, false);
});

test('mention bombs are flagged at both mention types', () => {
    const mentions = { extendedTextMessage: { contextInfo: { mentionedJid: new Array(1501).fill('1@s.whatsapp.net') } } };
    assert.match(reason(mentions), /mentionedJid 1501 > 1500/);

    const groupMentions = { extendedTextMessage: { contextInfo: { groupMentions: new Array(201).fill({ groupJid: '1@g.us' }) } } };
    assert.match(reason(groupMentions), /groupMentions 201 > 200/);
});

test('mentions nested below the top level are still found', () => {
    const nested = { viewOnceMessageV2: { message: { imageMessage: { contextInfo: { mentionedJid: new Array(2000).fill('1@s.whatsapp.net') } } } } };
    assert.match(reason(nested), /mentionedJid 2000/);
});

test('oversized interactive payloads are flagged', () => {
    const buttons = { interactiveMessage: { nativeFlowMessage: { buttons: new Array(101).fill({ name: 'x' }) } } };
    assert.match(reason(buttons), /nativeFlow buttons 101 > 100/);

    const sections = { listMessage: { sections: new Array(101).fill({ rows: [] }) } };
    assert.match(reason(sections), /list sections 101 > 100/);

    const rows = { listMessage: { sections: new Array(10).fill({ rows: new Array(31).fill({ title: 'r' }) }) } };
    assert.match(reason(rows), /list rows 310 > 300/);

    const cards = { interactiveMessage: { carouselMessage: { cards: new Array(61).fill({}) } } };
    assert.match(reason(cards), /carousel cards 61 > 60/);
});

test('broken and oversized buttonParamsJson are flagged', () => {
    const invalid = { nativeFlowMessage: { buttons: [{ name: 'cta_url', buttonParamsJson: '{not json' }] } };
    assert.match(reason(invalid), /buttonParamsJson invalid/);

    const huge = { nativeFlowMessage: { buttons: [{ name: 'cta_url', buttonParamsJson: 'x'.repeat(262145) }] } };
    assert.match(reason(huge), /buttonParamsJson length 262145/);

    // valid JSON of a sane size is left alone
    assert.equal(detectBug({ nativeFlowMessage: { buttons: [{ name: 'cta_url', buttonParamsJson: '{"url":"https://x.dev"}' }] } }).flagged, false);
});

test('structural attacks are flagged: depth, circular, wrapper nesting', () => {
    let deep = { conversation: 'x' };
    for (let i = 0; i < 20; i += 1) {
        deep = { nested: deep };
    }
    assert.match(reason(deep), /structure depth > 12/);

    const circular = { imageMessage: { caption: 'x' } };
    circular.imageMessage.self = circular.imageMessage;
    assert.match(reason(circular), /circular structure/);

    let wrapped = { conversation: 'x' };
    for (let i = 0; i < 7; i += 1) {
        wrapped = { ephemeralMessage: { message: wrapped } };
    }
    assert.match(reason(wrapped), /wrapper nesting 7/);
});

test('oversized text, newline floods and byte limits are flagged', () => {
    assert.match(reason({ conversation: 'x'.repeat(65537) }), /string length 65537 > 65536/);
    assert.match(reason({ conversation: '\n'.repeat(20001) }), /excessive newlines/);
    assert.match(reason({ conversation: 'x' }, { byteLength: ANCHORGUARD_DEFAULTS.maxBytes + 1 }), /encoded size/);
    assert.equal(detectBug({ conversation: 'x' }, { byteLength: 10 }).flagged, false);
});

test('thresholds can be overridden per call', () => {
    const message = { conversation: 'x'.repeat(100) };
    assert.equal(detectBug(message).flagged, false);
    assert.match(reason(message, { maxText: 50 }), /string length 100 > 50/);
});

// --- guard wiring ---

const makeSock = () => {
    const handlers = new Map();
    const calls = { sent: [], chatModify: [], blocked: [], removed: [] };
    return {
        calls,
        handlers,
        user: { id: '5511111111@s.whatsapp.net' },
        ev: {
            on: (e, h) => handlers.set(e, h),
            off: (e, h) => {
                if (handlers.get(e) === h) {
                    handlers.delete(e);
                }
            },
            emit: (e, payload) => handlers.get(e)?.(payload)
        },
        sendMessage: async (jid, content) => {
            calls.sent.push({ jid, content });
            return { key: { id: 'sent' } };
        },
        chatModify: async (mod, jid) => calls.chatModify.push({ mod, jid }),
        updateBlockStatus: async (jid, action) => calls.blocked.push({ jid, action }),
        groupParticipantsUpdate: async (jid, jids, action) => calls.removed.push({ jid, jids, action })
    };
};

const bugMessage = { conversation: '​'.repeat(600) };

test('a flagged inbound message is deleted locally and reported', async () => {
    const sock = makeSock();
    const seen = [];
    const guard = createAnchorGuard(sock, { onDetect: d => seen.push(d) });

    await sock.ev.emit('messages.upsert', {
        messages: [{ key: { remoteJid: '5522222222@s.whatsapp.net', id: 'A', fromMe: false }, message: bugMessage }]
    });

    assert.equal(sock.calls.chatModify.length, 1);
    assert.equal(sock.calls.chatModify[0].mod.deleteForMe.key.id, 'A');
    assert.equal(seen.length, 1);
    assert.equal(seen[0].direction, 'incoming');
    assert.match(seen[0].reasons.join(), /invisible-char run/);
    // no block unless asked
    assert.equal(sock.calls.blocked.length, 0);
    guard.stop();
    assert.equal(sock.handlers.size, 0);
});

test('a clean inbound message is left alone', async () => {
    const sock = makeSock();
    createAnchorGuard(sock, { blockOnBug: true });
    await sock.ev.emit('messages.upsert', {
        messages: [{ key: { remoteJid: '5522222222@s.whatsapp.net', id: 'A' }, message: { conversation: 'hi' } }]
    });
    assert.deepEqual(sock.calls.chatModify, []);
    assert.deepEqual(sock.calls.blocked, []);
});

test('own messages are revoked rather than deleted locally, and blockOnBug skips self', async () => {
    const sock = makeSock();
    createAnchorGuard(sock, { blockOnBug: true });
    await sock.ev.emit('messages.upsert', {
        messages: [{ key: { remoteJid: '5522222222@s.whatsapp.net', id: 'A', fromMe: true }, message: bugMessage }]
    });
    assert.equal(sock.calls.sent.length, 1);
    assert.deepEqual(sock.calls.sent[0].content, { delete: { remoteJid: '5522222222@s.whatsapp.net', id: 'A', fromMe: true } });
    assert.deepEqual(sock.calls.blocked, []);
});

test('Meta AI is exempt unless metaAiNumbers is set', async () => {
    const metaMsg = { messages: [{ key: { remoteJid: '13135550002@s.whatsapp.net', id: 'A' }, message: bugMessage }] };

    const exempt = makeSock();
    createAnchorGuard(exempt);
    await exempt.ev.emit('messages.upsert', metaMsg);
    assert.deepEqual(exempt.calls.chatModify, []);

    const guarded = makeSock();
    createAnchorGuard(guarded, { metaAiNumbers: true });
    await guarded.ev.emit('messages.upsert', metaMsg);
    assert.equal(guarded.calls.chatModify.length, 1);
});

test('outgoing guard is opt-in, rejects crash payloads, and unwinds cleanly', async () => {
    const unguarded = makeSock();
    const original = unguarded.sendMessage;
    createAnchorGuard(unguarded);
    assert.equal(unguarded.sendMessage, original, 'guardOutgoing must default to off');

    const sock = makeSock();
    const before = sock.sendMessage;
    const guard = createAnchorGuard(sock, { guardOutgoing: true, guardIncoming: false });
    await assert.rejects(() => sock.sendMessage('5522222222@s.whatsapp.net', bugMessage), /anchorguard blocked outgoing message/);
    await sock.sendMessage('5522222222@s.whatsapp.net', { conversation: 'fine' });
    assert.equal(sock.calls.sent.length, 1);
    guard.stop();
    assert.equal(sock.sendMessage, before);
});

test('stop() keeps a wrapper the host installed after the guard', () => {
    const sock = makeSock();
    const guard = createAnchorGuard(sock, { guardOutgoing: true, guardIncoming: false });
    const hostWrapper = async () => 'host';
    sock.sendMessage = hostWrapper;
    guard.stop();
    assert.equal(sock.sendMessage, hostWrapper);
});

test('burst detection fires past the threshold and can kick from a group', async () => {
    const sock = makeSock();
    const seen = [];
    createAnchorGuard(sock, { burstThreshold: 2, burstWindowMs: 10000, kickOnBurst: true, onDetect: d => seen.push(d) });
    const send = async i => sock.ev.emit('messages.upsert', {
        messages: [{ key: { remoteJid: '12345-1@g.us', participant: '5522222222@s.whatsapp.net', id: `m${i}` }, message: { conversation: 'hi' } }]
    });

    await send(1);
    await send(2);
    assert.equal(seen.length, 0, 'at the threshold is not a burst yet');
    await send(3);
    assert.equal(seen.length, 1);
    assert.match(seen[0].reasons.join(), /burst > 2\/10000ms/);
    assert.deepEqual(sock.calls.removed, [{ jid: '12345-1@g.us', jids: ['5522222222@s.whatsapp.net'], action: 'remove' }]);
    // a clean burst is not deleted, only reported
    assert.deepEqual(sock.calls.chatModify, []);
});

test('burst detection is off by default', async () => {
    const sock = makeSock();
    const seen = [];
    createAnchorGuard(sock, { onDetect: d => seen.push(d) });
    for (let i = 0; i < 20; i += 1) {
        await sock.ev.emit('messages.upsert', {
            messages: [{ key: { remoteJid: '12345-1@g.us', participant: '5522222222@s.whatsapp.net', id: `m${i}` }, message: { conversation: 'hi' } }]
        });
    }
    assert.deepEqual(seen, []);
});

test('guard survives a socket whose delete calls reject', async () => {
    const sock = makeSock();
    sock.chatModify = async () => {
        throw new Error('offline');
    };
    const warns = [];
    createAnchorGuard(sock, { logger: { warn: (ctx, msg) => warns.push(msg) } });
    await sock.ev.emit('messages.upsert', {
        messages: [{ key: { remoteJid: '5522222222@s.whatsapp.net', id: 'A' }, message: bugMessage }]
    });
    assert.ok(warns.includes('anchorguard delete failed'));
});

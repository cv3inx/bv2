import assert from 'node:assert/strict';
import test from 'node:test';
import { buildIgnoreContext, ignoredStanzaNeedsAck, makeIgnoreKeyRegistry, normalizeIgnoreKey } from '../lib/Utils/ignore-key.js';

const ME = '5511111111@s.whatsapp.net';
const ME_LID = '77777777@lid';
const PEER = '5522222222@s.whatsapp.net';
const PEER_LID = '88888888@lid';
const GROUP = '12345-6789@g.us';

const node = (tag, attrs) => ({ tag, attrs, content: [] });

const makeRegistry = () => {
    const errors = [];
    const registry = makeIgnoreKeyRegistry({
        getMeId: () => ME,
        getMeLid: () => ME_LID,
        logger: { error: (ctx, msg) => errors.push({ ctx, msg }) }
    });
    return { registry, errors };
};

test('descriptor fields AND together and a remoteJid array ORs', () => {
    const { registry } = makeRegistry();
    registry.register({ remoteJid: [PEER, GROUP], only: ['message'] });

    assert.equal(registry.shouldDrop(node('message', { from: PEER, id: 'a' })), true);
    assert.equal(registry.shouldDrop(node('message', { from: GROUP, id: 'b' })), true);
    // another chat is untouched
    assert.equal(registry.shouldDrop(node('message', { from: '5533333333@s.whatsapp.net', id: 'c' })), false);
    // `only` restricts the kind, so this peer's receipts still arrive
    assert.equal(registry.shouldDrop(node('receipt', { from: PEER, id: 'd' })), false);
});

test('a PN filter also catches the LID-addressed copy via the alt attrs', () => {
    const { registry } = makeRegistry();
    registry.register({ remoteJid: PEER });

    // server addressed the stanza by LID but carried the PN in sender_pn
    assert.equal(registry.shouldDrop(node('message', { from: PEER_LID, sender_pn: PEER, id: 'a' })), true);
    // device suffix must not defeat the match
    assert.equal(registry.shouldDrop(node('message', { from: `5522222222:13@s.whatsapp.net`, id: 'b' })), true);
    // same user part in a different namespace is a different account
    assert.equal(registry.shouldDrop(node('message', { from: '5522222222@lid', id: 'c' })), false);
});

test('participant matching works on group stanzas and respects alt forms', () => {
    const { registry } = makeRegistry();
    registry.register({ participant: PEER, only: ['message'] });

    assert.equal(registry.shouldDrop(node('message', { from: GROUP, participant: PEER, id: 'a' })), true);
    assert.equal(registry.shouldDrop(node('message', { from: GROUP, participant: PEER_LID, participant_pn: PEER, id: 'b' })), true);
    assert.equal(registry.shouldDrop(node('message', { from: GROUP, participant: '5544444444@s.whatsapp.net', id: 'c' })), false);
});

test('fromMe resolves against both the account PN and LID', () => {
    const { registry } = makeRegistry();
    registry.register({ fromMe: true, only: ['message'] });

    assert.equal(registry.shouldDrop(node('message', { from: PEER, participant: ME, id: 'a' })), true);
    assert.equal(registry.shouldDrop(node('message', { from: PEER, participant: ME_LID, id: 'b' })), true);
    assert.equal(registry.shouldDrop(node('message', { from: PEER, participant: PEER, id: 'c' })), false);
});

test("own-device category='peer' traffic is never dropped", () => {
    const { registry } = makeRegistry();
    registry.register({ fromMe: true });

    // app-state key share / history sync / PDO responses between this account's devices
    assert.equal(registry.shouldDrop(node('message', { from: ME, category: 'peer', id: 'a' })), false);
    assert.equal(registry.shouldDrop(node('message', { from: ME_LID, category: 'peer', id: 'b' })), false);
    // the exemption is for this account only — a foreign sender cannot stamp its way out
    registry.register({ remoteJid: PEER });
    assert.equal(registry.shouldDrop(node('message', { from: PEER, category: 'peer', id: 'c' })), true);
});

test('a predicate sees the parsed context and a throwing one keeps the stanza', () => {
    const { registry, errors } = makeRegistry();
    const seen = [];
    registry.register(ctx => {
        seen.push(ctx);
        return ctx.kind === 'message' && ctx.remoteJid === GROUP;
    });

    assert.equal(registry.shouldDrop(node('message', { from: GROUP, participant: `5522222222:13@s.whatsapp.net`, id: 'a' })), true);
    assert.deepEqual(seen.at(-1), { kind: 'message', remoteJid: GROUP, fromMe: false, id: 'a', participant: PEER });
    assert.equal(registry.shouldDrop(node('presence', { from: GROUP, id: 'b' })), false);

    registry.register(() => {
        throw new Error('boom');
    });
    assert.equal(registry.shouldDrop(node('receipt', { from: PEER, id: 'c' })), false);
    assert.equal(errors.length, 1);
});

test('unregister removes only its own filter', () => {
    const { registry } = makeRegistry();
    const offPeer = registry.register({ remoteJid: PEER });
    registry.register({ remoteJid: GROUP });

    assert.equal(registry.shouldDrop(node('message', { from: PEER, id: 'a' })), true);
    offPeer();
    assert.equal(registry.shouldDrop(node('message', { from: PEER, id: 'b' })), false);
    assert.equal(registry.shouldDrop(node('message', { from: GROUP, id: 'c' })), true);
    assert.equal(registry.size, 1);
});

test('non-filterable tags stay even with a matching descriptor', () => {
    const { registry } = makeRegistry();
    registry.register(() => true);

    for (const tag of ['iq', 'success', 'failure', 'stream:error', 'ib']) {
        assert.equal(registry.shouldDrop(node(tag, { from: PEER, id: 'a' })), false, tag);
    }
});

test('only re-delivered kinds get an ack on drop', () => {
    for (const tag of ['message', 'receipt', 'notification', 'call']) {
        assert.equal(ignoredStanzaNeedsAck(tag), true, tag);
    }
    for (const tag of ['presence', 'chatstate']) {
        assert.equal(ignoredStanzaNeedsAck(tag), false, tag);
    }
});

test('invalid filters are rejected before they can silently match nothing', () => {
    assert.throws(() => normalizeIgnoreKey({}), /at least one of/);
    assert.throws(() => normalizeIgnoreKey({ remoteJid: [] }), /cannot be empty/);
    assert.throws(() => normalizeIgnoreKey({ remoteJid: PEER, only: [] }), /cannot be empty/);
    assert.throws(() => normalizeIgnoreKey({ remoteJid: PEER, only: ['iq'] }), /unknown kinds: iq/);
    assert.throws(() => normalizeIgnoreKey({ id: '' }), /non-empty string/);
    assert.throws(() => normalizeIgnoreKey({ participant: '' }), /non-empty jid/);
    assert.throws(() => normalizeIgnoreKey(null), /descriptor object or a predicate/);
    assert.throws(() => normalizeIgnoreKey([PEER]), /descriptor object or a predicate/);
});

test('a userless from is kept verbatim in the context', () => {
    assert.equal(buildIgnoreContext(node('notification', { from: 's.whatsapp.net' }), ME, ME_LID).remoteJid, 's.whatsapp.net');
    assert.equal(buildIgnoreContext(node('notification', {}), ME, ME_LID).remoteJid, null);
});

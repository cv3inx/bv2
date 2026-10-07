import assert from 'node:assert/strict';
import test from 'node:test';
import { deserialize, serialize } from 'node:v8';
import { PreKeyWhisperMessage, WhisperMessage } from 'libsignal/src/protobufs.js';
import { addTransactionCapability, initAuthCreds, makeCacheableSignalKeyStore } from '../lib/Utils/auth-utils.js';
import { Curve, generateSignalPubKey } from '../lib/Utils/crypto.js';
import { storeTcTokensFromIqResult } from '../lib/Utils/tc-token-utils.js';
import { makeLibSignalRepository } from '../lib/Signal/libsignal.js';
import { SenderKeyDistributionMessage } from '../lib/Signal/Group/sender-key-distribution-message.js';

const logger = { trace() {}, debug() {}, info() {}, warn() {}, error() {} };
const clone = value => deserialize(serialize(value));
const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};
const memoryStore = () => {
    const data = {};
    let failures = 0;
    return {
        data,
        failNext(count = 1) { failures = count; },
        async get(type, ids) {
            return Object.fromEntries(ids.filter(id => data[type]?.[id] != null).map(id => [id, clone(data[type][id])]));
        },
        async set(update) {
            if (failures > 0) {
                failures--;
                throw new Error('storage unavailable');
            }
            for (const type in update) Object.assign(data[type] ??= {}, clone(update[type]));
        }
    };
};
const wrap = (store, attempts = 1) => addTransactionCapability(store, logger, { maxCommitRetries: attempts, delayBetweenTriesMs: 0 });
const signalFixture = () => {
    const raw = memoryStore();
    const cached = makeCacheableSignalKeyStore(raw, logger);
    const keys = wrap(cached);
    const creds = initAuthCreds();
    const repo = makeLibSignalRepository({ keys, creds }, logger);
    return { raw, keys, creds, repo };
};
const openSession = (registrationId = 1) => {
    const zero = Buffer.alloc(32).toString('base64');
    return {
        version: 'v1',
        _sessions: {
            [zero]: {
                registrationId,
                currentRatchet: {
                    ephemeralKeyPair: { pubKey: zero, privKey: zero },
                    lastRemoteEphemeralKey: zero,
                    previousCounter: 0,
                    rootKey: zero
                },
                indexInfo: { baseKey: zero, baseKeyType: 1, closed: -1, used: 1, created: 1, remoteIdentityKey: zero },
                _chains: {}
            }
        }
    };
};

test('awaited key writes are visible to ordinary and transactional reads', async () => {
    const raw = memoryStore(), keys = wrap(raw);
    await keys.set({ session: { key: 'new' } });
    assert.deepEqual(await keys.get('session', ['key']), { key: 'new' });
    await keys.transaction(async () => {
        assert.deepEqual(await keys.get('session', ['key']), { key: 'new' });
        await keys.set({ session: { key: null } });
        assert.deepEqual(await keys.get('session', ['key']), {});
    }, 'session');
    assert.deepEqual(await keys.get('session', ['key']), {});
    await keys.flush();
});

test('ordinary write errors reject and can be retried without losing data', async () => {
    const raw = memoryStore(), keys = wrap(raw);
    raw.failNext();
    await assert.rejects(keys.set({ session: { key: 'new' } }), /storage unavailable/);
    assert.deepEqual(await keys.get('session', ['key']), {});
    await keys.set({ session: { key: 'new' } });
    await keys.flush();
    assert.equal(raw.data.session.key, 'new');
});

test('flush waits for writes already accepted by the wrapper', async () => {
    const raw = memoryStore(), started = deferred(), release = deferred();
    const keys = wrap({
        get: raw.get,
        async set(data) {
            started.resolve();
            await release.promise;
            await raw.set(data);
        }
    });
    const writing = keys.set({ session: { key: 'saved' } });
    await started.promise;
    let flushed = false;
    const flushing = keys.flush().then(() => { flushed = true; });
    await Promise.resolve();
    assert.equal(flushed, false);
    release.resolve();
    await Promise.all([writing, flushing]);
    assert.equal(raw.data.session.key, 'saved');
});

test('failed transactions leave the cached store unchanged; commit retries still work', async () => {
    const raw = memoryStore(), cached = makeCacheableSignalKeyStore(raw, logger), keys = wrap(cached, 2);
    await keys.set({ session: { key: 'old' } });
    await assert.rejects(keys.transaction(async () => {
        await keys.set({ session: { key: 'aborted' } });
        assert.equal((await keys.get('session', ['key'])).key, 'aborted');
        throw new Error('abort work');
    }, 'jid'), /abort work/);
    assert.equal((await keys.get('session', ['key'])).key, 'old');
    raw.failNext(2);
    await assert.rejects(keys.transaction(() => keys.set({ session: { key: 'rejected' } }), 'jid'), /storage unavailable/);
    assert.equal((await keys.get('session', ['key'])).key, 'old');
    raw.failNext();
    await keys.transaction(() => keys.set({ session: { key: 'committed' } }), 'jid');
    assert.equal((await keys.get('session', ['key'])).key, 'committed');
    const noRetries = wrap(raw, 0);
    await noRetries.transaction(() => noRetries.set({ session: { once: 'saved' } }), 'jid');
    assert.equal(raw.data.session.once, 'saved');
});

test('nested independent stores keep separate contexts, including A to B to A', async () => {
    const a = memoryStore(), b = memoryStore(), ka = wrap(a), kb = wrap(b);
    await ka.transaction(async () => {
        assert.equal(ka.isInTransaction(), true);
        assert.equal(kb.isInTransaction(), false);
        await ka.set({ session: { shared: 'A' } });
        await kb.transaction(async () => {
            await kb.set({ session: { shared: 'B' } });
            assert.equal((await ka.get('session', ['shared'])).shared, 'A');
            await ka.transaction(() => ka.set({ session: { nested: 'A2' } }), 'other-key');
        }, 'b');
    }, 'a');
    assert.deepEqual(a.data, { session: { shared: 'A', nested: 'A2' } });
    assert.deepEqual(b.data, { session: { shared: 'B' } });
    assert.equal(ka.isInTransaction(), false);
    assert.equal(kb.isInTransaction(), false);
});

for (const abort of [false, true]) {
    test(`detached operations persist after transaction ${abort ? 'rollback' : 'commit'}`, async () => {
        const raw = memoryStore(), keys = wrap(raw), release = deferred();
        let continuation;
        const transaction = keys.transaction(async () => {
            await keys.set({ session: { early: 'value' } });
            continuation = release.promise.then(async () => {
                assert.equal(keys.isInTransaction(), false);
                assert.equal((await keys.get('session', ['early'])).early, abort ? undefined : 'value');
                await keys.set({ session: { late: 'saved' } });
                await keys.transaction(async () => {
                    assert.equal((await keys.get('session', ['late'])).late, 'saved');
                }, 'late');
            });
            if (abort) throw new Error('abort');
        }, 'early');
        if (abort) await assert.rejects(transaction, /abort/);
        else await transaction;
        release.resolve();
        await continuation;
        await keys.flush();
        assert.equal(raw.data.session.late, 'saved');
        assert.equal(raw.data.session.early, abort ? undefined : 'value');
    });
}

test('older incoming privacy tokens cannot replace a newly saved token', async () => {
    const raw = memoryStore(), keys = wrap(raw);
    const result = timestamp => ({
        tag: 'iq', attrs: {}, content: [{
            tag: 'tokens', attrs: {}, content: [{
                tag: 'token', attrs: { type: 'trusted_contact', t: String(timestamp) },
                content: Buffer.from(String(timestamp))
            }]
        }]
    });
    await storeTcTokensFromIqResult({ result: result(200), fallbackJid: '123@lid', keys });
    await storeTcTokensFromIqResult({ result: result(100), fallbackJid: '123@lid', keys });
    assert.equal(raw.data.tctoken['123@lid'].timestamp, '200');
});

test('a rejected cache write exposes neither a changed key nor a new key', async () => {
    const raw = memoryStore(), keys = makeCacheableSignalKeyStore(raw, logger);
    await keys.set({ session: { existing: 'old' } });
    raw.failNext();
    await assert.rejects(keys.set({ session: { existing: 'rejected', added: 'ghost' } }), /storage unavailable/);
    assert.deepEqual(await keys.get('session', ['existing', 'added']), { existing: 'old' });
});

test('Signal session reads reflect repository deletion, direct writes, and rollback', async () => {
    const { keys, repo } = signalFixture();
    const jid = '123@lid', address = repo.jidToSignalProtocolAddress(jid);
    await keys.set({ session: { [address]: openSession() } });
    assert.equal((await repo.validateSession(jid)).exists, true);
    await repo.deleteSession([jid]);
    assert.equal((await repo.validateSession(jid)).exists, false);
    await keys.set({ session: { [address]: openSession(2) } });
    assert.equal((await repo.getSessionInfo(jid)).registrationId, 2);
    await assert.rejects(keys.transaction(async () => {
        await keys.set({ session: { [address]: null } });
        assert.equal((await repo.validateSession(jid)).exists, false);
        throw new Error('abort delete');
    }, jid), /abort delete/);
    assert.equal((await repo.validateSession(jid)).exists, true);
    await keys.set({ session: { [address]: null } });
    assert.equal((await repo.validateSession(jid)).exists, false);
    repo.close();
});

test('deleting a phone-number session also deletes the mapped LID session', async () => {
    const { keys, repo } = signalFixture();
    await repo.lidMapping.storeLIDPNMappings([{ pn: '123@s.whatsapp.net', lid: '456@lid' }]);
    const lidAddress = repo.jidToSignalProtocolAddress('456@lid');
    await keys.set({ session: { [lidAddress]: openSession() } });
    assert.equal((await repo.validateSession('123@s.whatsapp.net')).exists, true);
    await repo.deleteSession(['123@s.whatsapp.net']);
    assert.equal((await repo.validateSession('123@s.whatsapp.net')).exists, false);
    assert.equal((await repo.validateSession('456@lid')).exists, false);
    repo.close();
});

test('group ratchets roll back failed encryption and decryption commits', async () => {
    const alice = signalFixture(), bob = signalFixture();
    const group = '1@g.us', meId = '111@lid';
    const initial = await alice.repo.getSenderKeyDistributionMessage({ group, meId });
    await bob.repo.processSenderKeyDistributionMessage({
        item: { groupId: group, axolotlSenderKeyDistributionMessage: initial },
        authorJid: meId
    });
    alice.raw.failNext();
    await assert.rejects(alice.repo.encryptGroupMessage({ group, meId, data: Buffer.from('failed') }), /storage unavailable/);
    const after = await alice.repo.getSenderKeyDistributionMessage({ group, meId });
    assert.equal(new SenderKeyDistributionMessage(null, null, null, null, after).getIteration(), 0);
    const { ciphertext } = await alice.repo.encryptGroupMessage({ group, meId, data: Buffer.from('hello group') });
    bob.raw.failNext();
    await assert.rejects(bob.repo.decryptGroupMessage({ group, authorJid: meId, msg: ciphertext }), /storage unavailable/);
    assert.equal((await bob.repo.decryptGroupMessage({ group, authorJid: meId, msg: ciphertext })).toString(), 'hello group');
    alice.repo.close();
    bob.repo.close();
});

test('one-to-one ratchets and identity changes roll back on failed persistence', async () => {
    const alice = signalFixture(), bob = signalFixture();
    const aliceJid = '111@lid', bobJid = '222@lid', preKey = Curve.generateKeyPair();
    await bob.keys.set({ 'pre-key': { '42': preKey } });
    await alice.repo.injectE2ESession({
        jid: bobJid,
        session: {
            registrationId: bob.creds.registrationId,
            identityKey: generateSignalPubKey(bob.creds.signedIdentityKey.public),
            signedPreKey: {
                keyId: bob.creds.signedPreKey.keyId,
                publicKey: generateSignalPubKey(bob.creds.signedPreKey.keyPair.public),
                signature: bob.creds.signedPreKey.signature
            },
            preKey: { keyId: 42, publicKey: generateSignalPubKey(preKey.public) }
        }
    });
    alice.raw.failNext();
    await assert.rejects(alice.repo.encryptMessage({ jid: bobJid, data: Buffer.from('failed') }), /storage unavailable/);
    const message = await alice.repo.encryptMessage({ jid: bobJid, data: Buffer.from('hello') });
    const preKeyMessage = PreKeyWhisperMessage.decode(message.ciphertext.subarray(1));
    const whisper = WhisperMessage.decode(preKeyMessage.message.subarray(1, -8));
    assert.equal(whisper.counter, 0);
    bob.raw.failNext();
    await assert.rejects(bob.repo.decryptMessage({ jid: aliceJid, ...message }), /storage unavailable/);
    assert.deepEqual(await bob.keys.get('identity-key', [bob.repo.jidToSignalProtocolAddress(aliceJid)]), {});
    assert.equal((await bob.repo.decryptMessage({ jid: aliceJid, ...message })).toString(), 'hello');
    assert.ok((await bob.keys.get('pre-key', ['42']))['42'] == null);
    alice.repo.close();
    bob.repo.close();
});

test('failed session migration can be retried for the same device', async () => {
    const { raw, keys, repo } = signalFixture();
    await keys.set({
        'device-list': { '123': ['0'] },
        session: { '123.0': openSession() }
    });
    raw.failNext();
    await assert.rejects(repo.migrateSession('123@s.whatsapp.net', '456@lid'), /storage unavailable/);
    assert.equal((await repo.migrateSession('123@s.whatsapp.net', '456@lid')).migrated, 1);
    assert.ok((await keys.get('session', ['123.0']))['123.0'] == null);
    assert.ok((await keys.get('session', ['456_1.0']))['456_1.0']);
    repo.close();
});

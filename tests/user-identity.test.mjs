import assert from 'node:assert/strict';
import test from 'node:test';
import { makeLibSignalRepository } from '../lib/Signal/libsignal.js';
import { makeSocket } from '../lib/Socket/socket.js';

const logger = Object.fromEntries(['trace', 'debug', 'info', 'warn', 'error'].map(n => [n, () => {}]));
logger.child = () => logger;

// `sock.user` is a getter over `authState.creds.me`, and hosts read it unguarded (`sock.user.id`):
// the @neoxr/wb engine does that in serialize() and in JID(). A stanza arriving while `creds.me` is
// absent used to throw inside the host's listener; the identity the socket already knows is the
// right answer, because a socket that is receiving stanzas is logged in.
const makeSocketForTest = () => {
    const auth = { creds: { me: { id: '628123456789:1@s.whatsapp.net', name: 'tester' } }, keys: {} };
    const sock = makeSocket({
        waWebSocketUrl: 'ws://127.0.0.1:1/ws',
        connectTimeoutMs: 1,
        keepAliveIntervalMs: 60_000,
        keepAliveGracePeriodMs: 1_000,
        defaultQueryTimeoutMs: 60_000,
        qrTimeout: 60_000,
        browser: ['Test', 'Chrome', '1.0'],
        logger,
        auth,
        version: [2, 3000, 0],
        shouldSyncHistoryMessage: () => true,
        transactionOpts: { maxCommitRetries: 1, delayBetweenTriesMs: 0 },
        makeSignalRepository: makeLibSignalRepository
    });
    sock.ws.on('error', () => {});
    sock.ws.on('close', () => {});
    return { sock, auth };
};

test('user: falls back to the last known identity when creds.me is absent', async t => {
    const { sock, auth } = makeSocketForTest();
    t.after(() => sock.end(undefined).catch(() => {}));
    assert.equal(sock.user.id, '628123456789:1@s.whatsapp.net');
    delete auth.creds.me;
    assert.equal(sock.user.id, '628123456789:1@s.whatsapp.net');
    // a later creds.update replaces the identity and becomes the new fallback
    sock.ev.emit('creds.update', { me: { id: '628999:2@s.whatsapp.net', name: 'renamed' } });
    assert.equal(sock.user.id, '628999:2@s.whatsapp.net');
    delete auth.creds.me;
    assert.equal(sock.user.id, '628999:2@s.whatsapp.net');
});

import assert from 'node:assert/strict'
import test from 'node:test'
import { makeLibSignalRepository } from '../lib/Signal/libsignal.js'
import { makeChatsSocket } from '../lib/Socket/chats.js'
const logger = Object.fromEntries(['trace', 'debug', 'info', 'warn', 'error'].map(n => [n, () => {}]))
logger.child = () => logger
// A message whose ack was lost (a transport drop between handling and ack) comes back from the server
// with the SAME key.id. The event buffer dedupes repeats only inside one buffer window, so a
// redelivery minutes later reached the host again and every plugin answered twice.
const makeSock = () => {
    const sock = makeChatsSocket({
        waWebSocketUrl: 'ws://127.0.0.1:1/ws',
        connectTimeoutMs: 1,
        keepAliveIntervalMs: 60_000,
        keepAliveGracePeriodMs: 1_000,
        defaultQueryTimeoutMs: 60_000,
        qrTimeout: 60_000,
        browser: ['Test', 'Chrome', '1.0'],
        logger,
        auth: { creds: { me: { id: '628123456789:1@s.whatsapp.net', name: 'tester' } }, keys: {} },
        version: [2, 3000, 0],
        markOnlineOnConnect: false,
        fireInitQueries: false,
        appStateMacVerification: { patch: false, snapshot: false },
        shouldIgnoreJid: () => false,
        shouldSyncHistoryMessage: () => true,
        getMessage: async () => undefined,
        transactionOpts: { maxCommitRetries: 1, delayBetweenTriesMs: 0 },
        makeSignalRepository: makeLibSignalRepository
    })
    sock.ws.on('error', () => {})
    sock.ws.on('close', () => {})
    return sock
}
const message = id => ({
    key: { id, remoteJid: '628111@s.whatsapp.net', fromMe: false },
    message: { conversation: 'halo' },
    messageTimestamp: 1
})
test('upsertMessage: a redelivered message reaches the host once', async t => {
    const sock = makeSock()
    t.after(() => sock.end(undefined).catch(() => {}))
    const delivered = []
    sock.ev.process(map => {
        const upsert = map['messages.upsert']
        if (upsert) delivered.push(...upsert.messages.map(m => m.key.id))
    })
    await sock.upsertMessage(message('DUP1'), 'notify')
    sock.ev.flush()
    // same stanza again, in a later buffer window — this is the redelivery
    await sock.upsertMessage(message('DUP1'), 'notify')
    sock.ev.flush()
    assert.deepEqual(delivered, ['DUP1'])
    // a different message still gets through
    await sock.upsertMessage(message('DUP2'), 'notify')
    sock.ev.flush()
    assert.deepEqual(delivered, ['DUP1', 'DUP2'])
})

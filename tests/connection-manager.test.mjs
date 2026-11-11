import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { makeConnectionManager } from '../lib/Utils/connection-manager.js';
const tick = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms));
const closed = statusCode => ({ connection: 'close', lastDisconnect: { error: { output: { statusCode } } } });
const makeFake = () => ({ ev: new EventEmitter(), end: async () => { } });
const options = overrides => ({
    sessions: [{ id: 'a' }],
    baseDelayMs: 1,
    maxDelayMs: 1,
    staggerMs: 0,
    ...overrides
});
test('reconnects a retryable close and marks the session open', async () => {
    const created = [];
    const manager = makeConnectionManager(options({
        create: () => {
            const sock = makeFake();
            created.push(sock);
            return sock;
        }
    }));
    manager.start();
    await tick();
    assert.equal(created.length, 1);
    created[0].ev.emit('connection.update', closed(428));
    await tick();
    assert.equal(created.length, 2);
    created[1].ev.emit('connection.update', { connection: 'open' });
    assert.equal(manager.stats().open, 1);
    await manager.close();
});
test('does not reconnect a logged-out session', async () => {
    const created = [];
    const dead = [];
    const manager = makeConnectionManager(options({
        create: () => {
            const sock = makeFake();
            created.push(sock);
            return sock;
        }
    }));
    manager.on('dead', event => dead.push(event));
    manager.start();
    await tick();
    created[0].ev.emit('connection.update', closed(401));
    await tick();
    assert.equal(created.length, 1);
    assert.equal(manager.stats().failed, 1);
    assert.equal(dead[0].statusCode, 401);
    await manager.close();
});
test('reconnects a 515 restart immediately, ignoring the backoff ceiling', async () => {
    const created = [];
    const manager = makeConnectionManager(options({
        baseDelayMs: 60000,
        maxDelayMs: 60000,
        create: () => {
            const sock = makeFake();
            created.push(sock);
            return sock;
        }
    }));
    manager.start();
    await tick();
    created[0].ev.emit('connection.update', closed(515));
    await tick();
    assert.equal(created.length, 2);
    await manager.close();
});
test('caps parallel connects', async () => {
    let live = 0;
    let peak = 0;
    const manager = makeConnectionManager({
        maxConcurrent: 2,
        staggerMs: 0,
        baseDelayMs: 1,
        maxDelayMs: 1,
        sessions: Array.from({ length: 6 }, (_, i) => ({ id: `s${i}` })),
        create: async () => {
            peak = Math.max(peak, ++live);
            await tick(5);
            live -= 1;
            return makeFake();
        }
    });
    manager.start();
    await tick(60);
    assert.equal(peak, 2);
    assert.equal(manager.stats().connecting, 6);
    await manager.close();
});
test('stop prevents a later reconnect', async () => {
    const created = [];
    const manager = makeConnectionManager(options({
        create: () => {
            const sock = makeFake();
            created.push(sock);
            return sock;
        }
    }));
    manager.start();
    await tick();
    manager.stop('a');
    created[0].ev.emit('connection.update', closed(428));
    await tick();
    assert.equal(created.length, 1);
    assert.equal(manager.stats().closed, 1);
    await manager.close();
});
test('a throwing create is retried instead of crashing', async () => {
    let calls = 0;
    const manager = makeConnectionManager(options({
        create: () => {
            calls += 1;
            if (calls === 1) {
                throw new Error('auth state unreadable');
            }
            return makeFake();
        }
    }));
    manager.start();
    await tick(30);
    assert.equal(calls, 2);
    await manager.close();
});

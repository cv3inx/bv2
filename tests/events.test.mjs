import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { AbstractSocketClient } from '../lib/Socket/Client/types.js';
import { makeEventBuffer } from '../lib/Utils/event-buffer.js';

const nextTurn = () => new Promise(resolve => setImmediate(resolve));
function makeLogger(errors = []) {
    return {
        trace() {}, debug() {}, info() {}, warn() {},
        error: ({ err }) => errors.push(err)
    };
}

test('event process callbacks guard rejections and unsubscribe normally', async () => {
    const errors = [];
    const ev = makeEventBuffer(makeLogger(errors));
    const failure = new Error('consumer failed');
    let calls = 0;
    const unsubscribe = ev.process(async () => { calls++; throw failure; });
    ev.emit('connection.update', { connection: 'open' });
    await nextTurn();
    assert.deepEqual(errors, [failure]);
    unsubscribe();
    ev.emit('connection.update', { connection: 'close' });
    await nextTurn();
    assert.equal(calls, 1);
    ev.destroy();
});

test('socket on, once, and prependOnce listeners retain cancellation and once semantics', async () => {
    const errors = [];
    const ws = new AbstractSocketClient(new URL('wss://example.invalid'), { logger: makeLogger(errors) });
    let calls = 0;
    const fn = () => { calls++; };
    for (const method of ['on', 'once', 'prependOnceListener']) {
        ws[method]('event', fn);
        ws.off('event', fn);
        ws.emit('event');
        assert.equal(calls, 0, method);
    }
    ws.once('event', fn);
    ws.emit('event');
    ws.emit('event');
    assert.equal(calls, 1);
    ws.on('event', fn);
    ws.once('event', fn);
    ws.off('event', fn);
    ws.emit('event');
    ws.emit('event');
    assert.equal(calls, 3, 'removal should remove the most recent registration');
    ws.removeAllListeners();
    assert.equal(ws.listenerCount('event'), 0);
    assert.equal(ws.listenerCount('error'), 1, 'cleanup must preserve the error sink');
    assert.doesNotThrow(() => ws.emit('error', new Error('during teardown')));
    const failure = new Error('once failed');
    ws.once('event', async () => { throw failure; });
    ws.emit('event');
    await nextTurn();
    assert.deepEqual(errors, [failure]);
});

test('named socket cleanup preserves unrelated listeners and explicit undefined semantics', () => {
    const ws = new AbstractSocketClient(new URL('wss://example.invalid'), { logger: makeLogger() });
    ws.on('event', () => {});
    ws.on('other', () => {});
    ws.removeAllListeners('event');
    assert.equal(ws.listenerCount('event'), 0);
    assert.equal(ws.listenerCount('other'), 1);
    ws.removeAllListeners(undefined);
    assert.equal(ws.listenerCount('other'), 1);
    ws.removeAllListeners('error');
    assert.equal(ws.listenerCount('error'), 1);
    ws.removeAllListeners();
});

test('event listener cleanup releases callbacks while the socket remains alive', () => {
    const moduleUrl = new URL('../lib/Utils/event-buffer.js', import.meta.url).href;
    const child = spawnSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', `
        import assert from 'node:assert/strict';
        import { makeEventBuffer } from ${JSON.stringify(moduleUrl)};
        const ev = makeEventBuffer({ debug() {}, trace() {}, warn() {}, error() {} });
        function attach(mode) {
            const handler = () => mode;
            ev.on('temporary', handler);
            if (mode === 'off') ev.off('temporary', handler);
            else ev.removeAllListeners('temporary');
            return new WeakRef(handler);
        }
        const references = Array.from({ length: 100 }, (_, i) => attach(i % 2 ? 'off' : 'all'));
        for (let i = 0; i < 5; i++) {
            await new Promise(resolve => setImmediate(resolve));
            global.gc();
        }
        assert.equal(references.filter(reference => reference.deref()).length, 0);
        ev.destroy();
    `], { encoding: 'utf8', timeout: 15000 });
    assert.equal(child.status, 0, child.stderr || child.error?.message);
});

test('event .off removes only one duplicated registration', () => {
    const ev = makeEventBuffer(makeLogger());
    let calls = 0;
    const fn = () => { calls++; };
    ev.on('example', fn);
    ev.on('example', fn);
    ev.off('example', fn);
    ev.emit('example', {});
    assert.equal(calls, 1);
    ev.removeTrackedListeners();
    ev.emit('example', {});
    assert.equal(calls, 1);
    ev.destroy();
});

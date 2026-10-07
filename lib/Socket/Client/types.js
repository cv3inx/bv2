import { EventEmitter } from 'events';
import { URL } from 'url';
import { makeListenerGuard } from '../../Utils/listener-guard.js';
export class AbstractSocketClient extends EventEmitter {
    constructor(url, config) {
        super();
        this.url = url;
        this.config = config;
        this.setMaxListeners(0);
        // Every stanza handler in this library is registered here as an async listener, and a
        // rejection from one of those is an unhandled rejection - which Node answers by killing the
        // process, disconnecting every other account it hosts. Guarding registration rather than
        // each of the ~12 call sites means a handler added later cannot reintroduce it.
        this.listenerGuard = makeListenerGuard(err => {
            const logger = this.config?.logger;
            if (logger?.error)
                logger.error({ err, url: this.url?.toString?.() }, 'unhandled error in socket listener');
            else
                console.error('unhandled error in socket listener', err);
        });
        // An 'error' event with NO listener is a THROW, not a log - that is EventEmitter's contract,
        // and it is the one hole the listener guard above does not cover: the guard protects a
        // listener that REJECTS, this protects an emit that nobody is listening for.
        //
        // How it fired in production - four times on one host, each dropping every account on the
        // process - is an exact sequence in Socket/socket.js's end():
        //
        //   1. ws.removeAllListeners('error')   every error listener gone
        //   2. await ws.close()                 the raw socket is still CONNECTING
        //   3. ws aborts the handshake          abortHandshake() -> process.nextTick(emitErrorAndClose)
        //   4. the raw socket emits 'error'     'WebSocket was closed before the connection was
        //                                        established'
        //   5. connect()'s forwarder runs       this.emit('error', err) with ZERO listeners
        //   6. Node throws                      inside a nextTick callback, so nothing can catch it
        //
        // The app above saw an uncaughtException and shut down. A socket that fails to open must
        // never be able to do that, so the invariant here is: this emitter ALWAYS has at least one
        // 'error' listener. Real listeners still receive everything - this only keeps the count off
        // zero.
        this.armErrorSink();
    }
    /**
     * Keep exactly one no-op 'error' subscriber, so emit('error') can never throw.
     *
     * Registered through super, not this.on: the guard wraps listeners in a new function each time,
     * so a guarded no-op could not be recognised again and would stack up one per re-arm.
     */
    armErrorSink() {
        if (!this.errorSink) {
            this.errorSink = () => { };
        }
        if (!super.listeners('error').includes(this.errorSink)) {
            super.on('error', this.errorSink);
        }
    }
    /**
     * socket.js's end() calls removeAllListeners('error') and THEN closes a socket that may still be
     * connecting - step 1 and step 2 above. Re-arming here is what makes the invariant survive its
     * own consumer's teardown; without it the constructor's sink is gone by the time the error lands.
     */
    removeAllListeners(event) {
        const result = arguments.length ? super.removeAllListeners(event) : super.removeAllListeners();
        if (!arguments.length || event === 'error') {
            this.errorSink = undefined;
            this.armErrorSink();
        }
        return result;
    }
    on(event, listener) {
        return super.on(event, this.listenerGuard.wrap(listener));
    }
    addListener(event, listener) {
        return this.on(event, listener);
    }
    once(event, listener) {
        return super.once(event, listener);
    }
    prependListener(event, listener) {
        return super.prependListener(event, this.listenerGuard.wrap(listener));
    }
    prependOnceListener(event, listener) {
        return super.prependOnceListener(event, listener);
    }
    off(event, listener) {
        return this.removeListener(event, listener);
    }
    removeListener(event, listener) {
        // Native once wrappers remove themselves by their wrapper reference; callers use
        // the original callback, preserved on the guard's .listener property.
        return super.removeListener(event, listener?.listener ? this.listenerGuard.unwrap(listener) : listener);
    }
}
//# sourceMappingURL=types.js.map

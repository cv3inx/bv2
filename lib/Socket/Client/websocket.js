import WebSocket from 'ws';
import { DEFAULT_ORIGIN } from '../../Defaults/index.js';
import { AbstractSocketClient } from './types.js';
export class WebSocketClient extends AbstractSocketClient {
    constructor() {
        super(...arguments);
        this.socket = null;
    }
    get isOpen() {
        return this.socket?.readyState === WebSocket.OPEN;
    }
    get isClosed() {
        return this.socket === null || this.socket?.readyState === WebSocket.CLOSED;
    }
    get isClosing() {
        return this.socket === null || this.socket?.readyState === WebSocket.CLOSING;
    }
    get isConnecting() {
        return this.socket?.readyState === WebSocket.CONNECTING;
    }
    connect() {
        if (this.socket) {
            return;
        }
        this.socket = new WebSocket(this.url, {
            origin: DEFAULT_ORIGIN,
            headers: this.config.options?.headers,
            handshakeTimeout: this.config.connectTimeoutMs,
            timeout: this.config.connectTimeoutMs,
            agent: this.config.agent
        });
        this.socket.setMaxListeners(0);
        const events = ['close', 'error', 'upgrade', 'message', 'open', 'ping', 'pong', 'unexpected-response'];
        for (const event of events) {
            this.socket?.on(event, (...args) => this.emit(event, ...args));
        }
    }
    /**
     * Drop the raw socket and open a new one on the SAME emitter. Every stanza listener the layers
     * above registered (messages-recv, chats, the host) stays attached, which is what makes a
     * reconnect invisible to them. The noise session is rebuilt by the caller.
     */
    reconnect() {
        const socket = this.socket;
        this.socket = null;
        if (socket) {
            // remove the forwarders first: a late close from the old socket must not be reported
            // as a close of the new one
            socket.removeAllListeners();
            try {
                socket.terminate();
            }
            catch { }
        }
        this.connect();
    }
    async close() {
        if (!this.socket) {
            return;
        }
        const socket = this.socket;
        // A half-open peer never answers the close handshake, so an unbounded wait here leaks one
        // socket per reconnect. With a fleet that ends as FD exhaustion, so bound it and terminate.
        const timeoutMs = this.config.closeTimeoutMs ?? 5000;
        const closePromise = new Promise(resolve => {
            const timer = setTimeout(() => {
                try {
                    socket.terminate();
                }
                catch { }
                resolve();
            }, timeoutMs);
            timer.unref?.();
            const done = () => {
                clearTimeout(timer);
                resolve();
            };
            socket.once('close', done);
            socket.once('error', done);
        });
        try {
            socket.close();
        } catch { }
        await closePromise;
        this.socket = null;
    }
    send(str, cb) {
        this.socket?.send(str, cb);
        return Boolean(this.socket);
    }
}
//# sourceMappingURL=websocket.js.map
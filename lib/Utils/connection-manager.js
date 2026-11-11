import { EventEmitter } from 'events';
import { Agent } from 'https';
import { DisconnectReason } from '../Types/index.js';
/**
 * Supervises a fleet of sockets inside one process.
 *
 * The library builds and tears down one socket; it deliberately does not reconnect, because only
 * the host knows which auth state to reload. With hundreds of accounts that leaves three fleet-level
 * problems to whoever wires them up, and getting them wrong is what makes accounts drop:
 *
 *  - every socket reconnecting the moment the server closes it, all at once, which hammers the
 *    endpoint and gets throttled or banned (this is what `baseDelayMs` + jitter + stagger fix);
 *  - a permanently dead session (401/403/411/440) being reconnected forever, which is the
 *    documented path to a ban (this is what DEAD_REASONS stops);
 *  - unbounded parallel connects, which exhausts FDs and TLS handshakes on boot.
 *
 * Events are deliberately never named 'error': EventEmitter throws on an unhandled 'error', and one
 * dead session must not take the process down.
 *
 * ponytail: supervision only. Every socket still shares one event loop, so this bounds reconnect
 * storms and socket leaks but not CPU-bound crypto; past a few hundred accounts, shard by process.
 */
const DEAD_REASONS = new Set([
    DisconnectReason.loggedOut,
    DisconnectReason.forbidden,
    DisconnectReason.multideviceMismatch,
    DisconnectReason.badSession,
    DisconnectReason.connectionReplaced
]);
export class ConnectionManager extends EventEmitter {
    #create;
    #sessions = new Map();
    #maxConcurrent;
    #active = 0;
    #waiters = [];
    #reconnect;
    #baseDelayMs;
    #maxDelayMs;
    #maxAttempts;
    #staggerMs;
    #logger;
    #started = false;
    constructor({ create, sessions = [], maxConcurrent = 8, reconnect = true, baseDelayMs = 2000, maxDelayMs = 60000, maxAttempts = Infinity, staggerMs = 250, logger = console }) {
        super();
        if (typeof create !== 'function') {
            throw new TypeError('ConnectionManager needs a create(session) function');
        }
        for (const session of sessions) {
            if (!session?.id) {
                throw new TypeError('every session needs an id');
            }
            if (this.#sessions.has(session.id)) {
                throw new TypeError(`duplicate session id: ${session.id}`);
            }
            this.#sessions.set(session.id, {
                id: session.id,
                session,
                sock: null,
                state: 'idle',
                attempts: 0,
                generation: 0,
                timer: null,
                stopped: false,
                lastError: null
            });
        }
        this.#create = create;
        this.#maxConcurrent = Math.max(1, maxConcurrent);
        this.#reconnect = reconnect;
        this.#baseDelayMs = baseDelayMs;
        this.#maxDelayMs = maxDelayMs;
        this.#maxAttempts = maxAttempts;
        this.#staggerMs = staggerMs;
        this.#logger = logger;
    }
    /** Connect every session, staggered so boot does not fire them all in one tick. */
    start() {
        if (this.#started) {
            return this.stats();
        }
        this.#started = true;
        let index = 0;
        for (const rec of this.#sessions.values()) {
            const delayMs = this.#staggerMs * index++;
            if (!delayMs) {
                void this.#connect(rec);
            }
            else {
                rec.timer = setTimeout(() => {
                    rec.timer = null;
                    void this.#connect(rec);
                }, delayMs);
            }
        }
        return this.stats();
    }
    get(id) {
        return this.#sessions.get(id)?.sock ?? null;
    }
    /** Stop one session for good. A close event that arrives afterwards is ignored. */
    stop(id) {
        const rec = this.#sessions.get(id);
        if (!rec) {
            return false;
        }
        this.#stop(rec);
        return true;
    }
    /** Stop everything and wait for each socket's teardown. */
    async close() {
        const pending = [];
        for (const rec of this.#sessions.values()) {
            const sock = this.#stop(rec);
            if (sock) {
                pending.push(Promise.resolve(sock.end?.(undefined)).catch(() => { }));
            }
        }
        await Promise.all(pending);
        this.#started = false;
        this.removeAllListeners();
    }
    stats() {
        const counts = { total: 0, idle: 0, connecting: 0, open: 0, reconnecting: 0, closed: 0, failed: 0 };
        for (const rec of this.#sessions.values()) {
            counts.total += 1;
            counts[rec.state] += 1;
        }
        counts.activeConnects = this.#active;
        counts.queuedConnects = this.#waiters.length;
        return counts;
    }
    #stop(rec) {
        rec.stopped = true;
        rec.generation += 1;
        if (rec.timer) {
            clearTimeout(rec.timer);
            rec.timer = null;
        }
        const sock = rec.sock;
        rec.sock = null;
        rec.state = 'closed';
        return sock;
    }
    async #connect(rec) {
        if (rec.stopped) {
            return;
        }
        if (rec.timer) {
            clearTimeout(rec.timer);
            rec.timer = null;
        }
        const generation = ++rec.generation;
        rec.state = 'connecting';
        await this.#acquire();
        let sock;
        try {
            sock = await this.#create(rec.session);
        }
        catch (err) {
            this.#release();
            rec.lastError = err;
            this.emit('session-error', { id: rec.id, error: err });
            this.#scheduleReconnect(rec, err);
            return;
        }
        this.#release();
        // stop() or a newer connect won the race while this one was being created
        if (rec.stopped || generation !== rec.generation) {
            void sock?.end?.(undefined);
            return;
        }
        rec.sock = sock;
        try {
            sock.ev.on('connection.update', update => this.#onUpdate(rec, sock, update));
        }
        catch (err) {
            rec.lastError = err;
            this.emit('session-error', { id: rec.id, error: err });
            this.#scheduleReconnect(rec, err);
        }
    }
    #onUpdate(rec, sock, update) {
        // a socket that was already replaced must not drive this session any more
        if (rec.sock !== sock) {
            return;
        }
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            this.emit('qr', { id: rec.id, qr });
        }
        if (connection === 'open') {
            rec.state = 'open';
            rec.attempts = 0;
            rec.lastError = null;
            this.emit('open', { id: rec.id, sock });
        }
        else if (connection === 'close') {
            const error = lastDisconnect?.error;
            rec.sock = null;
            rec.lastError = error;
            this.emit('close', { id: rec.id, error, statusCode: error?.output?.statusCode });
            this.#scheduleReconnect(rec, error);
        }
    }
    #scheduleReconnect(rec, error) {
        if (!this.#reconnect || rec.stopped) {
            rec.state = 'closed';
            return;
        }
        const statusCode = error?.output?.statusCode;
        if (DEAD_REASONS.has(statusCode) || rec.attempts >= this.#maxAttempts) {
            rec.state = 'failed';
            this.#logger?.warn?.({ id: rec.id, statusCode, attempts: rec.attempts }, 'session will not be reconnected');
            this.emit('dead', { id: rec.id, error, statusCode });
            return;
        }
        // the server asks for a restart on 515; backing off there only delays the reconnect
        const immediate = statusCode === DisconnectReason.restartRequired;
        const backoff = Math.min(this.#maxDelayMs, this.#baseDelayMs * 2 ** rec.attempts);
        const delayMs = immediate ? 0 : Math.round(backoff * (0.75 + Math.random() * 0.5));
        rec.attempts += 1;
        rec.state = 'reconnecting';
        this.emit('reconnect', { id: rec.id, attempt: rec.attempts, delayMs, statusCode });
        rec.timer = setTimeout(() => {
            rec.timer = null;
            void this.#connect(rec);
        }, delayMs);
    }
    #acquire() {
        if (this.#active < this.#maxConcurrent) {
            this.#active += 1;
            return Promise.resolve();
        }
        return new Promise(resolve => this.#waiters.push(resolve));
    }
    #release() {
        const next = this.#waiters.shift();
        if (next) {
            // hand the slot over without touching the counter
            next();
        }
        else {
            this.#active -= 1;
        }
    }
}
export const makeConnectionManager = (options) => new ConnectionManager(options);
/**
 * One TLS agent shared by every socket in the fleet. `ws` opens one TCP connection per socket, so
 * this does not multiplex them, but it does keep the agent, its DNS cache and its free-socket pool
 * shared instead of one per account.
 */
export const makeWssAgent = ({ maxSockets = 256, keepAlive = true, keepAliveMsecs = 30000 } = {}) => new Agent({
    keepAlive,
    keepAliveMsecs,
    maxSockets,
    maxFreeSockets: Math.min(32, maxSockets)
});

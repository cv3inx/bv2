import { Boom } from '@hapi/boom';
import { DisconnectReason } from '../Types/index.js';

/**
 * Reconnection Handler - Robust auto-reconnection with state preservation
 * Prevents frequent disconnect/logout/connectionLost issues
 */
export class ReconnectionHandler {
    constructor(makeSocket, config = {}) {
        this.makeSocket = makeSocket;
        this.config = config;
        this.logger = config.logger || console;
        
        // Reconnection state
        this.sock = null;
        this.authState = null;
        this.reconnectTimer = null;
        this.isConnecting = false;
        
        // Configuration
        this.maxAttempts = config.maxReconnectAttempts || 10;
        this.baseDelay = config.reconnectDelayMs || 5000;
        this.maxDelay = config.maxReconnectDelayMs || 60000;
        this.currentAttempt = 0;
        
        // State preservation
        this.preservedState = {
            chats: new Map(),
            messages: new Map(),
            presence: new Map()
        };
        
        // Metrics
        this.metrics = {
            totalDisconnects: 0,
            successfulReconnects: 0,
            failedReconnects: 0,
            lastDisconnectReason: null,
            averageReconnectTime: 0,
            reconnectTimes: []
        };
    }

    /**
     * Initialize connection with auto-reconnect wrapper
     */
    async connect() {
        if (this.isConnecting) {
            this.logger.warn('Connection already in progress');
            return null;
        }
        
        this.isConnecting = true;
        
        try {
            this.sock = this.makeSocket(this.config);
            
            // Store auth state reference
            if (this.sock.authState && !this.authState) {
                this.authState = this.sock.authState;
            }
            
            // Setup connection update handler
            this.setupConnectionHandler();
            
            // Restore preserved state
            this.restoreState();
            
            this.isConnecting = false;
            return this.sock;
        } catch (error) {
            this.isConnecting = false;
            this.logger.error({ error }, 'Failed to create socket');
            throw error;
        }
    }

    /**
     * Setup connection update handler with auto-reconnect
     */
    setupConnectionHandler() {
        if (!this.sock || !this.sock.ev) {
            return;
        }
        
        this.sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr, isNewLogin } = update;
            
            if (qr) {
                // Reset reconnect attempts on new QR
                this.currentAttempt = 0;
                this.logger.info('QR received, reset reconnect attempts');
            }
            
            if (isNewLogin) {
                // Reset on successful new login
                this.currentAttempt = 0;
                this.logger.info('New login successful, reset reconnect attempts');
            }
            
            if (connection === 'close') {
                await this.handleDisconnect(lastDisconnect);
            } else if (connection === 'open') {
                await this.handleConnect();
            }
        });
    }

    /**
     * Handle disconnection with smart reconnection logic
     */
    async handleDisconnect(lastDisconnect) {
        this.metrics.totalDisconnects++;
        
        const error = lastDisconnect?.error;
        const statusCode = error?.output?.statusCode || DisconnectReason.connectionClosed;
        
        this.metrics.lastDisconnectReason = statusCode;
        
        // Log disconnect
        this.logger.info({
            reason: statusCode,
            error: error?.message,
            attempt: this.currentAttempt,
            total: this.metrics.totalDisconnects
        }, 'Connection closed');
        
        // Preserve state before reconnecting
        this.preserveState();
        
        // Check if we should reconnect
        if (!this.shouldReconnect(statusCode)) {
            this.logger.info({ statusCode }, 'Not reconnecting - permanent failure or disabled');
            return;
        }
        
        // Schedule reconnection
        this.scheduleReconnect();
    }

    /**
     * Handle successful connection
     */
    async handleConnect() {
        const reconnectTime = Date.now() - (this.reconnectStartTime || Date.now());
        
        if (this.currentAttempt > 0) {
            this.metrics.successfulReconnects++;
            this.metrics.reconnectTimes.push(reconnectTime);
            
            // Keep only last 10 times for average
            if (this.metrics.reconnectTimes.length > 10) {
                this.metrics.reconnectTimes.shift();
            }
            
            // Calculate average
            this.metrics.averageReconnectTime = 
                this.metrics.reconnectTimes.reduce((a, b) => a + b, 0) / this.metrics.reconnectTimes.length;
            
            this.logger.info({
                attempt: this.currentAttempt,
                time: reconnectTime,
                avgTime: Math.round(this.metrics.averageReconnectTime)
            }, 'Reconnection successful');
        }
        
        // Reset attempt counter
        this.currentAttempt = 0;
        this.reconnectStartTime = null;
        
        // Clear any pending reconnect timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    /**
     * Determine if should attempt reconnection
     */
    shouldReconnect(statusCode) {
        // Check if auto reconnect is enabled
        if (!this.config.enableAutoReconnect) {
            return false;
        }
        
        // Don't reconnect on these permanent failures
        const permanentFailures = [
            DisconnectReason.loggedOut,
            DisconnectReason.forbidden,
            DisconnectReason.multideviceMismatch
        ];
        
        if (permanentFailures.includes(statusCode)) {
            this.logger.warn({ statusCode }, 'Permanent failure, will not reconnect');
            return false;
        }
        
        // Check max attempts
        if (this.currentAttempt >= this.maxAttempts) {
            this.logger.warn({ 
                attempts: this.currentAttempt, 
                max: this.maxAttempts 
            }, 'Max reconnection attempts reached');
            return false;
        }
        
        return true;
    }

    /**
     * Schedule reconnection attempt with exponential backoff
     */
    scheduleReconnect() {
        this.currentAttempt++;
        this.reconnectStartTime = Date.now();
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
            this.baseDelay * Math.pow(2, this.currentAttempt - 1),
            this.maxDelay
        );
        
        // Add jitter (±20%)
        const jitter = delay * (0.8 + Math.random() * 0.4);
        const finalDelay = Math.floor(jitter);
        
        this.logger.info({
            attempt: this.currentAttempt,
            delay: finalDelay,
            maxAttempts: this.maxAttempts
        }, 'Scheduling reconnection attempt');
        
        // Clear existing timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        
        // Schedule reconnect
        this.reconnectTimer = setTimeout(async () => {
            try {
                await this.attemptReconnect();
            } catch (error) {
                this.logger.error({ error, attempt: this.currentAttempt }, 'Reconnection attempt failed');
                
                // Schedule next attempt if not at max
                if (this.currentAttempt < this.maxAttempts) {
                    this.scheduleReconnect();
                } else {
                    this.metrics.failedReconnects++;
                    this.logger.error('All reconnection attempts exhausted');
                }
            }
        }, finalDelay);
    }

    /**
     * Attempt to reconnect
     */
    async attemptReconnect() {
        this.logger.info({ attempt: this.currentAttempt }, 'Attempting to reconnect...');
        
        // Cleanup old socket
        if (this.sock) {
            try {
                if (this.sock.ev) {
                    this.sock.ev.removeAllListeners();
                }
                if (this.sock.ws && !this.sock.ws.isClosed) {
                    await this.sock.ws.close();
                }
            } catch (error) {
                this.logger.debug({ error }, 'Error cleaning up old socket');
            }
        }
        
        // Reuse auth state if available
        const config = { ...this.config };
        if (this.authState) {
            config.auth = this.authState;
        }
        
        // Create new socket
        await this.connect();
    }

    /**
     * Preserve connection state before disconnect
     */
    preserveState() {
        if (!this.sock) return;
        
        try {
            // Preserve from in-memory store if available
            if (this.sock.store) {
                const chats = this.sock.store.chats;
                const messages = this.sock.store.messages;
                const presence = this.sock.store.presence;
                
                if (chats) this.preservedState.chats = new Map(chats);
                if (messages) this.preservedState.messages = new Map(messages);
                if (presence) this.preservedState.presence = new Map(presence);
            }
            
            this.logger.debug({
                chats: this.preservedState.chats.size,
                messages: this.preservedState.messages.size,
                presence: this.preservedState.presence.size
            }, 'State preserved');
        } catch (error) {
            this.logger.warn({ error }, 'Failed to preserve state');
        }
    }

    /**
     * Restore preserved state after reconnection
     */
    restoreState() {
        if (!this.sock || !this.sock.store) return;
        
        try {
            const store = this.sock.store;
            
            if (this.preservedState.chats.size > 0 && store.chats) {
                for (const [jid, chat] of this.preservedState.chats) {
                    if (!store.chats.has(jid)) {
                        store.chats.set(jid, chat);
                    }
                }
            }
            
            if (this.preservedState.messages.size > 0 && store.messages) {
                for (const [jid, msgs] of this.preservedState.messages) {
                    if (!store.messages.has(jid)) {
                        store.messages.set(jid, msgs);
                    }
                }
            }
            
            this.logger.debug({
                chats: this.preservedState.chats.size,
                messages: this.preservedState.messages.size
            }, 'State restored');
        } catch (error) {
            this.logger.warn({ error }, 'Failed to restore state');
        }
    }

    /**
     * Get connection metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            currentAttempt: this.currentAttempt,
            isConnecting: this.isConnecting,
            reconnectSuccessRate: this.metrics.totalDisconnects > 0
                ? (this.metrics.successfulReconnects / this.metrics.totalDisconnects * 100).toFixed(2) + '%'
                : 'N/A'
        };
    }

    /**
     * Stop all reconnection attempts
     */
    stop() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.config.enableAutoReconnect = false;
        this.logger.info('Reconnection handler stopped');
    }

    /**
     * Resume reconnection
     */
    resume() {
        this.config.enableAutoReconnect = true;
        this.currentAttempt = 0;
        this.logger.info('Reconnection handler resumed');
    }
}

/**
 * Create a reconnection wrapper for makeWASocket
 */
export function withReconnect(makeWASocket, config = {}) {
    const handler = new ReconnectionHandler(makeWASocket, config);
    
    const wrappedConnect = async () => {
        return handler.connect();
    };
    
    return {
        connect: wrappedConnect,
        handler,
        getMetrics: () => handler.getMetrics(),
        stop: () => handler.stop(),
        resume: () => handler.resume()
    };
}

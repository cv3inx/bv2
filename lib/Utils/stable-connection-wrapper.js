import { Boom } from '@hapi/boom';
import { DisconnectReason } from '../Types/index.js';

/**
 * Stable Connection Wrapper for Third-Party Obfuscated Libraries
 * 
 * Use this wrapper to add connection stability improvements
 * when using obfuscated third-party connection libraries.
 * 
 * This works at the user-code level without modifying the library internals.
 */
export class StableConnectionWrapper {
    constructor(options = {}) {
        this.logger = options.logger || console;
        this.socketFactory = options.socketFactory; // Function to create socket
        
        // Reconnection config
        this.maxReconnectAttempts = options.maxReconnectAttempts || 15;
        this.reconnectDelayMs = options.reconnectDelayMs || 5000;
        this.maxReconnectDelayMs = options.maxReconnectDelayMs || 90000;
        this.enableAutoReconnect = options.enableAutoReconnect !== false;
        
        // Keep-alive config
        this.keepAliveCheckIntervalMs = options.keepAliveCheckIntervalMs || 20000;
        this.keepAliveTimeoutMs = options.keepAliveTimeoutMs || 60000;
        
        // State
        this.sock = null;
        this.authState = null;
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        this.shouldReconnect = true;
        this.lastActivityTime = Date.now();
        this.connectionStartTime = null;
        
        // Activity monitoring
        this.activityCheckTimer = null;
        this.keepAliveFailures = 0;
        this.maxKeepAliveFailures = options.maxKeepAliveFailures || 3;
        
        // Event handlers
        this.eventHandlers = {
            onConnect: [],
            onDisconnect: [],
            onQR: [],
            onMessage: [],
            onReconnectAttempt: [],
            onReconnectSuccess: [],
            onReconnectFailed: []
        };
        
        // Metrics
        this.metrics = {
            totalConnections: 0,
            successfulConnections: 0,
            totalDisconnects: 0,
            reconnectAttempts: 0,
            successfulReconnects: 0,
            failedReconnects: 0,
            lastDisconnectReason: null,
            uptime: 0,
            connectionHistory: []
        };
    }

    /**
     * Register event handler
     */
    on(event, handler) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].push(handler);
        }
        return this;
    }

    /**
     * Emit event to handlers
     */
    emit(event, data) {
        const handlers = this.eventHandlers[event] || [];
        handlers.forEach(handler => {
            try {
                handler(data);
            } catch (err) {
                this.logger.error({ err, event }, 'Error in event handler');
            }
        });
    }

    /**
     * Connect with stability features
     */
    async connect() {
        if (this.isReconnecting) {
            this.logger.warn('Connection attempt already in progress');
            return null;
        }
        
        this.isReconnecting = true;
        this.connectionStartTime = Date.now();
        this.lastActivityTime = Date.now();
        
        try {
            // Create socket using factory
            this.sock = await this.socketFactory();
            
            // Store auth state reference
            if (this.sock.authState) {
                this.authState = this.sock.authState;
            }
            
            this.metrics.totalConnections++;
            
            // Setup connection monitoring
            this.setupConnectionMonitor();
            
            // Setup activity tracking
            this.setupActivityTracking();
            
            this.isReconnecting = false;
            this.shouldReconnect = true;
            
            return this.sock;
        } catch (error) {
            this.isReconnecting = false;
            this.logger.error({ error }, 'Failed to create connection');
            throw error;
        }
    }

    /**
     * Setup connection state monitoring
     */
    setupConnectionMonitor() {
        if (!this.sock || !this.sock.ev) {
            return;
        }
        
        this.sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr, isNewLogin, receivedPendingNotifications } = update;
            
            // Update activity time
            this.lastActivityTime = Date.now();
            
            // Handle QR code
            if (qr) {
                this.reconnectAttempts = 0;
                this.keepAliveFailures = 0;
                this.emit('onQR', { qr });
                this.logger.info('QR code received');
            }
            
            // Handle new login
            if (isNewLogin) {
                this.reconnectAttempts = 0;
                this.keepAliveFailures = 0;
                this.logger.info('New login successful');
            }
            
            // Handle connection open
            if (connection === 'open') {
                await this.handleConnectionOpen();
            }
            
            // Handle connection close
            if (connection === 'close') {
                await this.handleConnectionClose(lastDisconnect);
            }
            
            // Handle received pending notifications
            if (receivedPendingNotifications) {
                this.lastActivityTime = Date.now();
            }
        });
        
        // Track message activity
        this.sock.ev.on('messages.upsert', () => {
            this.lastActivityTime = Date.now();
        });
        
        this.sock.ev.on('messages.upsert', (m) => {
            this.lastActivityTime = Date.now();
            this.emit('onMessage', m);
        });
    }

    /**
     * Setup activity tracking timer
     */
    setupActivityTracking() {
        // Clear existing timer
        if (this.activityCheckTimer) {
            clearInterval(this.activityCheckTimer);
        }
        
        // Check connection health periodically
        this.activityCheckTimer = setInterval(() => {
            this.checkConnectionHealth();
        }, this.keepAliveCheckIntervalMs);
    }

    /**
     * Check connection health based on activity
     */
    checkConnectionHealth() {
        if (!this.sock) return;
        
        const timeSinceLastActivity = Date.now() - this.lastActivityTime;
        
        // If no activity for timeout period, connection might be stale
        if (timeSinceLastActivity > this.keepAliveTimeoutMs) {
            this.keepAliveFailures++;
            
            this.logger.warn({
                timeSinceLastActivity,
                failures: this.keepAliveFailures,
                maxFailures: this.maxKeepAliveFailures
            }, 'Connection appears stale - no recent activity');
            
            // Only take action after multiple failures
            if (this.keepAliveFailures >= this.maxKeepAliveFailures) {
                this.logger.error('Connection unresponsive, triggering reconnect');
                
                // Force close to trigger reconnect
                if (this.sock.ws && !this.sock.ws.isClosed) {
                    this.sock.ws.close().catch(() => {});
                }
            }
        } else {
            // Reset failure counter on activity
            this.keepAliveFailures = 0;
        }
    }

    /**
     * Handle successful connection
     */
    async handleConnectionOpen() {
        this.metrics.successfulConnections++;
        this.keepAliveFailures = 0;
        
        if (this.reconnectAttempts > 0) {
            this.metrics.successfulReconnects++;
            const reconnectTime = Date.now() - (this.reconnectStartTime || Date.now());
            
            this.emit('onReconnectSuccess', {
                attempt: this.reconnectAttempts,
                time: reconnectTime
            });
            
            this.logger.info({
                attempt: this.reconnectAttempts,
                time: reconnectTime
            }, 'Reconnection successful');
        } else {
            this.emit('onConnect', { time: Date.now() });
            this.logger.info('Connection established');
        }
        
        this.reconnectAttempts = 0;
        this.reconnectStartTime = null;
        
        // Update uptime
        this.metrics.uptime = Date.now() - (this.connectionStartTime || Date.now());
    }

    /**
     * Handle connection close with smart reconnection
     */
    async handleConnectionClose(lastDisconnect) {
        this.metrics.totalDisconnects++;
        
        const error = lastDisconnect?.error;
        const statusCode = error?.output?.statusCode || DisconnectReason.connectionClosed;
        
        this.metrics.lastDisconnectReason = statusCode;
        this.metrics.connectionHistory.push({
            reason: statusCode,
            error: error?.message,
            timestamp: new Date().toISOString()
        });
        
        // Keep only last 20 entries
        if (this.metrics.connectionHistory.length > 20) {
            this.metrics.connectionHistory.shift();
        }
        
        this.emit('onDisconnect', {
            reason: statusCode,
            error,
            attempt: this.reconnectAttempts
        });
        
        this.logger.info({
            reason: statusCode,
            errorMessage: error?.message,
            attempt: this.reconnectAttempts
        }, 'Connection closed');
        
        // Check if should reconnect
        if (!this.shouldReconnect()) {
            this.logger.info({ statusCode }, 'Not reconnecting - permanent failure or disabled');
            return;
        }
        
        // Schedule reconnection
        this.scheduleReconnect();
    }

    /**
     * Check if should attempt reconnection
     */
    shouldReconnect(statusCode) {
        // Check if auto reconnect enabled
        if (!this.enableAutoReconnect) {
            return false;
        }
        
        // Don't reconnect on permanent failures
        const permanentFailures = [
            DisconnectReason.loggedOut,
            DisconnectReason.forbidden,
            DisconnectReason.multideviceMismatch
        ];
        
        if (permanentFailures.includes(statusCode)) {
            this.logger.warn({ statusCode }, 'Permanent failure - will not auto-reconnect');
            return false;
        }
        
        // Check max attempts
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.logger.warn({
                attempts: this.reconnectAttempts,
                max: this.maxReconnectAttempts
            }, 'Max reconnection attempts reached');
            return false;
        }
        
        return true;
    }

    /**
     * Schedule reconnection attempt
     */
    scheduleReconnect() {
        this.reconnectAttempts++;
        this.reconnectStartTime = Date.now();
        this.metrics.reconnectAttempts++;
        
        // Calculate delay with exponential backoff
        const baseDelay = this.reconnectDelayMs;
        const maxDelay = this.maxReconnectDelayMs;
        const delay = Math.min(
            baseDelay * Math.pow(2, this.reconnectAttempts - 1),
            maxDelay
        );
        
        // Add jitter (±25%)
        const jitter = delay * (0.75 + Math.random() * 0.5);
        const finalDelay = Math.floor(jitter);
        
        this.emit('onReconnectAttempt', {
            attempt: this.reconnectAttempts,
            delay: finalDelay
        });
        
        this.logger.info({
            attempt: this.reconnectAttempts,
            delay: finalDelay,
            maxAttempts: this.maxReconnectAttempts
        }, 'Scheduling reconnection attempt');
        
        setTimeout(async () => {
            await this.attemptReconnect();
        }, finalDelay);
    }

    /**
     * Attempt to reconnect
     */
    async attemptReconnect() {
        this.logger.info({ attempt: this.reconnectAttempts }, 'Attempting to reconnect...');
        
        try {
            // Cleanup old socket
            await this.cleanup();
            
            // Reuse auth state if available
            const options = this.authState ? { auth: this.authState } : {};
            
            // Create new connection
            await this.connect();
            
        } catch (error) {
            this.logger.error({ error, attempt: this.reconnectAttempts }, 'Reconnection failed');
            
            // Check if should retry
            if (this.reconnectAttempts < this.maxReconnectAttempts && this.shouldReconnect) {
                this.metrics.failedReconnects++;
                this.scheduleReconnect();
            } else {
                this.emit('onReconnectFailed', {
                    attempts: this.reconnectAttempts,
                    error
                });
                this.logger.error('All reconnection attempts exhausted');
            }
        }
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        // Stop activity monitor
        if (this.activityCheckTimer) {
            clearInterval(this.activityCheckTimer);
            this.activityCheckTimer = null;
        }
        
        // Remove all event listeners from old socket
        if (this.sock && this.sock.ev) {
            try {
                this.sock.ev.removeAllListeners();
            } catch (err) {
                // Ignore errors during cleanup
            }
        }
        
        // Close websocket
        if (this.sock && this.sock.ws && !this.sock.ws.isClosed) {
            try {
                await this.sock.ws.close();
            } catch (err) {
                // Ignore errors during cleanup
            }
        }
        
        this.sock = null;
    }

    /**
     * Get connection metrics
     */
    getMetrics() {
        const uptime = this.connectionStartTime 
            ? Date.now() - this.connectionStartTime 
            : 0;
        
        return {
            ...this.metrics,
            uptime,
            reconnectAttempts: this.reconnectAttempts,
            isReconnecting: this.isReconnecting,
            keepAliveFailures: this.keepAliveFailures,
            lastActivityTime: this.lastActivityTime,
            timeSinceLastActivity: Date.now() - this.lastActivityTime,
            successRate: this.metrics.totalConnections > 0
                ? ((this.metrics.successfulConnections / this.metrics.totalConnections) * 100).toFixed(2) + '%'
                : 'N/A',
            reconnectSuccessRate: this.metrics.reconnectAttempts > 0
                ? ((this.metrics.successfulReconnects / this.metrics.reconnectAttempts) * 100).toFixed(2) + '%'
                : 'N/A'
        };
    }

    /**
     * Stop all reconnection attempts
     */
    stop() {
        this.shouldReconnect = false;
        this.enableAutoReconnect = false;
        
        if (this.activityCheckTimer) {
            clearInterval(this.activityCheckTimer);
            this.activityCheckTimer = null;
        }
        
        this.logger.info('Connection wrapper stopped');
    }

    /**
     * Resume reconnection
     */
    resume() {
        this.shouldReconnect = true;
        this.enableAutoReconnect = true;
        this.reconnectAttempts = 0;
        this.keepAliveFailures = 0;
        
        this.logger.info('Connection wrapper resumed');
    }

    /**
     * Force reconnect
     */
    async forceReconnect() {
        this.logger.info('Force reconnecting...');
        await this.cleanup();
        this.reconnectAttempts = 0;
        return this.connect();
    }

    /**
     * Get current socket
     */
    getSocket() {
        return this.sock;
    }

    /**
     * Check if connected
     */
    isConnected() {
        return this.sock && this.sock.ws && this.sock.ws.isOpen;
    }
}

/**
 * Create stable connection wrapper
 * 
 * @param {Function} socketFactory - Function that creates the socket
 * @param {Object} options - Configuration options
 * @returns {StableConnectionWrapper}
 * 
 * @example
 * const wrapper = createStableConnection(
 *   () => makeWASocket({ auth: authState, logger }),
 *   { maxReconnectAttempts: 10, logger }
 * )
 * 
 * wrapper.on('onDisconnect', (data) => console.log('Disconnected:', data))
 * wrapper.on('onReconnectSuccess', (data) => console.log('Reconnected:', data))
 * 
 * await wrapper.connect()
 */
export function createStableConnection(socketFactory, options = {}) {
    return new StableConnectionWrapper({
        socketFactory,
        ...options
    });
}

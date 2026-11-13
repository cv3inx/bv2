import { Boom } from '@hapi/boom';
import { DisconnectReason } from '../Types/index.js';

/**
 * Connection Manager - Handles automatic reconnection and connection stability
 * Reduces disconnect/logout/connectionLost issues
 */
export class ConnectionManager {
    constructor(options = {}) {
        this.logger = options.logger || console;
        this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
        this.reconnectDelayMs = options.reconnectDelayMs || 5000;
        this.maxReconnectDelayMs = options.maxReconnectDelayMs || 60000;
        this.connectTimeoutMs = options.connectTimeoutMs || 30000;
        this.keepAliveIntervalMs = options.keepAliveIntervalMs || 25000; // Reduced from 30s
        this.keepAliveGracePeriodMs = options.keepAliveGracePeriodMs || 15000; // Increased grace
        
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        this.lastDisconnectTime = null;
        this.connectionStable = false;
        this.shouldReconnect = true;
        
        // Track disconnect reasons for pattern analysis
        this.disconnectHistory = [];
        this.maxHistorySize = 20;
        
        // Circuit breaker
        this.consecutiveFailures = 0;
        this.circuitBreakerThreshold = 5;
        this.circuitBreakerResetTime = 5 * 60 * 1000; // 5 minutes
        this.circuitBreakerTripped = false;
        this.circuitBreakerTripTime = null;
    }

    /**
     * Check if we should attempt reconnection
     */
    shouldAttemptReconnect(disconnectReason) {
        // Don't reconnect on permanent failures
        const permanentFailures = [
            DisconnectReason.loggedOut,
            DisconnectReason.forbidden,
            DisconnectReason.multideviceMismatch
        ];
        
        if (permanentFailures.includes(disconnectReason)) {
            this.logger.info({ reason: disconnectReason }, 'Permanent failure, not reconnecting');
            return false;
        }
        
        // Check circuit breaker
        if (this.circuitBreakerTripped) {
            const timeSinceTrip = Date.now() - this.circuitBreakerTripTime;
            if (timeSinceTrip < this.circuitBreakerResetTime) {
                this.logger.warn('Circuit breaker tripped, waiting before reconnect');
                return false;
            }
            // Reset circuit breaker after timeout
            this.circuitBreakerTripped = false;
            this.consecutiveFailures = 0;
        }
        
        // Check max attempts
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.logger.warn({ attempts: this.reconnectAttempts }, 'Max reconnect attempts reached');
            return false;
        }
        
        return this.shouldReconnect;
    }

    /**
     * Get delay for next reconnection attempt (exponential backoff with jitter)
     */
    getReconnectDelay() {
        const baseDelay = Math.min(
            this.reconnectDelayMs * Math.pow(2, this.reconnectAttempts),
            this.maxReconnectDelayMs
        );
        
        // Add jitter (±25%)
        const jitter = baseDelay * (0.75 + Math.random() * 0.5);
        
        return Math.floor(jitter);
    }

    /**
     * Record a disconnect event for analysis
     */
    recordDisconnect(reason, error) {
        this.lastDisconnectTime = Date.now();
        this.connectionStable = false;
        
        // Add to history
        this.disconnectHistory.push({
            reason,
            error: error?.message,
            timestamp: new Date().toISOString()
        });
        
        // Trim history
        if (this.disconnectHistory.length > this.maxHistorySize) {
            this.disconnectHistory.shift();
        }
        
        // Track consecutive failures for circuit breaker
        if (reason !== DisconnectReason.restartRequired) {
            this.consecutiveFailures++;
            
            if (this.consecutiveFailures >= this.circuitBreakerThreshold) {
                this.circuitBreakerTripped = true;
                this.circuitBreakerTripTime = Date.now();
                this.logger.error('Circuit breaker tripped due to consecutive failures');
            }
        }
    }

    /**
     * Record successful connection
     */
    recordSuccess() {
        this.reconnectAttempts = 0;
        this.consecutiveFailures = 0;
        this.circuitBreakerTripped = false;
        this.connectionStable = true;
        this.isReconnecting = false;
    }

    /**
     * Increment reconnect attempts
     */
    incrementAttempts() {
        this.reconnectAttempts++;
        this.isReconnecting = true;
    }

    /**
     * Reset reconnect attempts (manual reset)
     */
    resetAttempts() {
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
    }

    /**
     * Analyze disconnect patterns to detect issues
     */
    analyzeDisconnectPattern() {
        if (this.disconnectHistory.length < 3) {
            return null;
        }
        
        const recentDisconnects = this.disconnectHistory.slice(-5);
        
        // Check for rapid disconnects
        const timeWindow = 5 * 60 * 1000; // 5 minutes
        const recentCount = recentDisconnects.filter(d => 
            Date.now() - new Date(d.timestamp).getTime() < timeWindow
        ).length;
        
        if (recentCount >= 3) {
            return {
                type: 'rapid_disconnect',
                message: 'Detected rapid disconnection pattern, possible network or auth issue',
                recommendation: 'Check network stability and authentication state'
            };
        }
        
        // Check for repeated same error
        const errorCounts = {};
        for (const d of recentDisconnects) {
            const key = d.reason;
            errorCounts[key] = (errorCounts[key] || 0) + 1;
        }
        
        for (const [reason, count] of Object.entries(errorCounts)) {
            if (count >= 3) {
                return {
                    type: 'repeated_error',
                    reason: parseInt(reason),
                    message: `Repeated disconnect with reason ${reason}`,
                    recommendation: 'Investigate specific error cause'
                };
            }
        }
        
        return null;
    }

    /**
     * Get optimized keep-alive config
     */
    getKeepAliveConfig() {
        return {
            intervalMs: this.keepAliveIntervalMs,
            gracePeriodMs: this.keepAliveGracePeriodMs,
            // Use shorter interval on unstable connections
            adaptiveInterval: this.consecutiveFailures > 2 
                ? Math.floor(this.keepAliveIntervalMs * 0.75)
                : this.keepAliveIntervalMs
        };
    }

    /**
     * Check if connection should be considered stale
     */
    isConnectionStale(lastActivityTime, thresholdMs = 120000) {
        if (!lastActivityTime) return false;
        return Date.now() - lastActivityTime > thresholdMs;
    }

    /**
     * Get connection statistics
     */
    getStats() {
        return {
            reconnectAttempts: this.reconnectAttempts,
            consecutiveFailures: this.consecutiveFailures,
            circuitBreakerTripped: this.circuitBreakerTripped,
            connectionStable: this.connectionStable,
            lastDisconnectTime: this.lastDisconnectTime,
            disconnectCount: this.disconnectHistory.length
        };
    }

    /**
     * Stop reconnection attempts
     */
    stop() {
        this.shouldReconnect = false;
    }

    /**
     * Resume reconnection attempts
     */
    resume() {
        this.shouldReconnect = true;
    }
}

/**
 * Create connection handler wrapper with automatic reconnection
 */
export function createConnectionHandler(sock, manager, onReconnect) {
    const { ev, logger } = sock;
    
    ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode || DisconnectReason.connectionClosed;
            
            manager.recordDisconnect(reason, lastDisconnect?.error);
            
            const pattern = manager.analyzeDisconnectPattern();
            if (pattern) {
                logger.warn({ pattern }, 'Disconnect pattern detected');
            }
            
            if (manager.shouldAttemptReconnect(reason)) {
                const delay = manager.getReconnectDelay();
                manager.incrementAttempts();
                
                logger.info({ 
                    attempt: manager.reconnectAttempts, 
                    delay,
                    reason 
                }, 'Scheduling reconnection');
                
                setTimeout(async () => {
                    if (!manager.shouldReconnect) {
                        logger.info('Reconnection cancelled');
                        return;
                    }
                    
                    try {
                        logger.info('Attempting to reconnect...');
                        await onReconnect();
                    } catch (err) {
                        logger.error({ err }, 'Reconnection failed');
                    }
                }, delay);
            }
        } else if (connection === 'open') {
            manager.recordSuccess();
            logger.info(manager.getStats(), 'Connection established');
        }
    });
    
    return manager;
}

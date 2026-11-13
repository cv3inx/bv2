import { Boom } from '@hapi/boom';
import { DisconnectReason } from '../Types/index.js';

/**
 * Improved Keep-Alive Manager
 * Prevents false connectionLost triggers and handles network jitter better
 */
export class KeepAliveManager {
    constructor(options = {}) {
        this.logger = options.logger || console;
        this.intervalMs = options.intervalMs || 25000;
        this.gracePeriodMs = options.gracePeriodMs || 15000;
        this.timeoutMs = options.timeoutMs || 10000;
        
        // State tracking
        this.lastActivityTime = Date.now();
        this.lastPingTime = null;
        this.pendingPings = new Map();
        this.pingId = 0;
        
        // Health metrics
        this.metrics = {
            totalPings: 0,
            successfulPongs: 0,
            missedPongs: 0,
            averageLatency: 0,
            latencyHistory: []
        };
        
        // Adaptive timing
        this.adaptiveInterval = this.intervalMs;
        this.consecutiveMisses = 0;
        this.maxConsecutiveMisses = 3;
        
        // Timers
        this.pingTimer = null;
        this.timeoutTimer = null;
        this.isActive = false;
    }

    /**
     * Start keep-alive monitoring
     */
    start(sendPing) {
        if (this.isActive) {
            this.stop();
        }
        
        this.isActive = true;
        this.sendPingCallback = sendPing;
        this.scheduleNextPing();
        
        this.logger.info({
            interval: this.adaptiveInterval,
            grace: this.gracePeriodMs
        }, 'Keep-alive started');
    }

    /**
     * Stop keep-alive monitoring
     */
    stop() {
        this.isActive = false;
        
        if (this.pingTimer) {
            clearTimeout(this.pingTimer);
            this.pingTimer = null;
        }
        
        if (this.timeoutTimer) {
            clearTimeout(this.timeoutTimer);
            this.timeoutTimer = null;
        }
        
        // Clear pending pings
        for (const [id, pending] of this.pendingPings) {
            clearTimeout(pending.timeout);
        }
        this.pendingPings.clear();
    }

    /**
     * Schedule next ping with jitter
     */
    scheduleNextPing() {
        if (!this.isActive) return;
        
        // Add small jitter (±10%)
        const jitter = this.adaptiveInterval * (0.9 + Math.random() * 0.2);
        
        this.pingTimer = setTimeout(() => {
            this.performPing();
        }, jitter);
    }

    /**
     * Perform ping operation
     */
    async performPing() {
        if (!this.isActive || !this.sendPingCallback) {
            return;
        }
        
        this.pingId++;
        const currentId = this.pingId;
        this.lastPingTime = Date.now();
        this.metrics.totalPings++;
        
        // Create pending ping entry
        const pendingEntry = {
            id: currentId,
            timestamp: this.lastPingTime,
            timeout: setTimeout(() => {
                this.handlePingTimeout(currentId);
            }, this.timeoutMs)
        };
        
        this.pendingPings.set(currentId, pendingEntry);
        
        try {
            await this.sendPingCallback();
            this.updateActivity();
        } catch (error) {
            this.logger.warn({ error, pingId: currentId }, 'Ping failed');
            // Don't immediately fail - allow for transient errors
            this.consecutiveMisses++;
            
            if (this.consecutiveMisses >= this.maxConsecutiveMisses) {
                this.logger.error({ misses: this.consecutiveMisses }, 'Too many consecutive ping failures');
            }
        }
        
        // Schedule next ping
        this.scheduleNextPing();
    }

    /**
     * Handle ping timeout
     */
    handlePingTimeout(pingId) {
        const pending = this.pendingPings.get(pingId);
        if (!pending) return;
        
        this.pendingPings.delete(pingId);
        this.metrics.missedPongs++;
        this.consecutiveMisses++;
        
        this.logger.warn({
            pingId,
            latency: Date.now() - pending.timestamp,
            consecutiveMisses: this.consecutiveMisses
        }, 'Ping timeout');
        
        // Adjust interval on failures (slow down)
        if (this.consecutiveMisses >= 2) {
            this.adaptiveInterval = Math.min(this.intervalMs * 1.5, 60000);
        }
    }

    /**
     * Record activity (pong received)
     */
    recordPong(pingId) {
        const pending = this.pendingPings.get(pingId);
        if (!pending) return;
        
        clearTimeout(pending.timeout);
        this.pendingPings.delete(pingId);
        
        const latency = Date.now() - pending.timestamp;
        this.recordLatency(latency);
        
        this.metrics.successfulPongs++;
        this.consecutiveMisses = 0;
        
        // Reset adaptive interval on success
        this.adaptiveInterval = this.intervalMs;
        
        this.updateActivity();
    }

    /**
     * Record latency for metrics
     */
    recordLatency(latency) {
        this.metrics.latencyHistory.push(latency);
        
        // Keep only last 20 samples
        if (this.metrics.latencyHistory.length > 20) {
            this.metrics.latencyHistory.shift();
        }
        
        // Calculate average
        this.metrics.averageLatency = 
            this.metrics.latencyHistory.reduce((a, b) => a + b, 0) / 
            this.metrics.latencyHistory.length;
    }

    /**
     * Update last activity time
     */
    updateActivity() {
        this.lastActivityTime = Date.now();
    }

    /**
     * Check if connection is healthy
     */
    isHealthy() {
        const timeSinceActivity = Date.now() - this.lastActivityTime;
        const maxAllowedTime = this.adaptiveInterval + this.gracePeriodMs;
        
        // More lenient check - only unhealthy if WAY over threshold
        return timeSinceActivity < maxAllowedTime * 2;
    }

    /**
     * Check if connection is stale (but not dead)
     */
    isStale() {
        const timeSinceActivity = Date.now() - this.lastActivityTime;
        return timeSinceActivity > this.adaptiveInterval;
    }

    /**
     * Get health metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            consecutiveMisses: this.consecutiveMisses,
            adaptiveInterval: this.adaptiveInterval,
            lastActivity: this.lastActivityTime,
            timeSinceLastActivity: Date.now() - this.lastActivityTime,
            healthStatus: this.isHealthy() ? 'healthy' : 'unhealthy',
            pendingPings: this.pendingPings.size
        };
    }

    /**
     * Reset metrics and state
     */
    reset() {
        this.metrics = {
            totalPings: 0,
            successfulPongs: 0,
            missedPongs: 0,
            averageLatency: 0,
            latencyHistory: []
        };
        this.consecutiveMisses = 0;
        this.adaptiveInterval = this.intervalMs;
        this.lastActivityTime = Date.now();
        this.pendingPings.clear();
    }
}

/**
 * Create keep-alive manager with smart defaults
 */
export function createKeepAliveManager(logger, config = {}) {
    return new KeepAliveManager({
        logger,
        intervalMs: config.keepAliveIntervalMs || 25000,
        gracePeriodMs: config.keepAliveGracePeriodMs || 15000,
        timeoutMs: config.pingTimeoutMs || 10000
    });
}

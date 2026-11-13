# Connection Stability Improvements

## Overview
Improvements untuk mengurangi frekuensi disconnect/logout/connectionLost pada Baileys WhatsApp bot.

## Files Added

### 1. `lib/Utils/connection-manager.js`
- **Auto-reconnection** dengan exponential backoff
- **Circuit breaker** untuk mencegah infinite reconnect loop
- **Disconnect pattern analysis** untuk deteksi masalah berulang
- **Connection metrics** untuk monitoring

### 2. `lib/Utils/reconnection-handler.js`
- **State preservation** saat disconnect (chats, messages, presence)
- **Smart reconnection** dengan retry logic
- **Connection wrapper** yang mudah digunakan
- **Metrics tracking** untuk analyze connection health

### 3. `lib/Utils/keep-alive-manager.js`
- **Improved ping/pong** handling
- **Adaptive timing** berdasarkan network conditions
- **Latency tracking** untuk optimization
- **More lenient timeout** untuk mengurangi false disconnects

## Files Modified

### 1. `lib/Defaults/index.js`
**Changes:**
- `keepAliveIntervalMs`: 30000 → 25000 (faster disconnect detection)
- `keepAliveGracePeriodMs`: 30000 → 15000 (better network jitter tolerance)
- Added: `maxReconnectAttempts`, `reconnectDelayMs`, `maxReconnectDelayMs`, `enableAutoReconnect`

### 2. `lib/Socket/socket.js`
**Changes:**
- More lenient staleness check
- Only disconnect if 2x over grace period threshold
- Added warning log before disconnect

### 3. `lib/Utils/index.js`
**Changes:**
- Export connection stability modules

## Usage

### Basic Usage with Auto-Reconnect

```javascript
import { makeWASocket, DisconnectReason } from '@violetix/baileys'
import { ConnectionManager, createConnectionHandler } from '@violetix/baileys/Utils'

const config = {
    // Your config
    logger,
    auth: authState,
    enableAutoReconnect: true,
    maxReconnectAttempts: 10,
    reconnectDelayMs: 5000
}

const sock = makeWASocket(config)

// Setup auto-reconnect
const manager = new ConnectionManager({
    logger,
    maxReconnectAttempts: 10,
    enableAutoReconnect: true
})

createConnectionHandler(sock, manager, async () => {
    // This callback runs on reconnection
    const newSock = makeWASocket(config)
    return newSock
})
```

### With Reconnection Handler

```javascript
import { makeWASocket } from '@violetix/baileys'
import { withReconnect } from '@violetix/baileys/Utils'

const config = { /* your config */ }

const { connect, handler, getMetrics } = withReconnect(makeWASocket, config)

// Connect with auto-reconnect
await connect()

// Check metrics
console.log(getMetrics())

// Stop reconnecting if needed
handler.stop()

// Resume later
handler.resume()
```

### Manual Connection Handling

```javascript
sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update
    
    if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode
        
        // Only reconnect on specific errors
        const shouldReconnect = [
            DisconnectReason.connectionClosed,
            DisconnectReason.connectionLost,
            DisconnectReason.restartRequired,
            DisconnectReason.timedOut
        ].includes(statusCode)
        
        if (shouldReconnect) {
            console.log('Reconnecting...')
            await connect()
        }
    }
})
```

## Key Improvements

### 1. Better Keep-Alive Management
- Reduced ping interval untuk faster detection
- Increased grace period untuk network jitter tolerance
- Adaptive timing based on network conditions
- Only disconnect if significantly over threshold (2x)

### 2. Smart Reconnection
- Exponential backoff dengan jitter untuk avoid thundering herd
- Circuit breaker untuk prevent infinite loops
- State preservation untuk seamless reconnect
- Metrics tracking untuk debugging

### 3. Disconnect Pattern Analysis
- Track disconnect history
- Detect rapid disconnects
- Identify repeated errors
- Provide actionable recommendations

### 4. Grace Period Handling
- More lenient timeout (2x grace period)
- Warning logs before disconnect
- Adaptive intervals on network issues
- Better handling of transient errors

## Metrics Available

```javascript
// Connection Manager Stats
{
    reconnectAttempts: 0,
    consecutiveFailures: 0,
    circuitBreakerTripped: false,
    connectionStable: true,
    lastDisconnectTime: null,
    disconnectCount: 0
}

// Keep-Alive Manager Metrics
{
    totalPings: 50,
    successfulPongs: 48,
    missedPongs: 2,
    averageLatency: 245,
    healthStatus: 'healthy',
    consecutiveMisses: 0
}

// Reconnection Handler Metrics
{
    totalDisconnects: 5,
    successfulReconnects: 5,
    failedReconnects: 0,
    averageReconnectTime: 8234,
    reconnectSuccessRate: '100.00%'
}
```

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `keepAliveIntervalMs` | 25000 | Ping interval (ms) |
| `keepAliveGracePeriodMs` | 15000 | Grace period for pong (ms) |
| `maxReconnectAttempts` | 10 | Max reconnect tries |
| `reconnectDelayMs` | 5000 | Base reconnect delay (ms) |
| `maxReconnectDelayMs` | 60000 | Max reconnect delay (ms) |
| `enableAutoReconnect` | true | Enable auto-reconnect |

## Troubleshooting

### Frequent Disconnects
1. Check network stability
2. Verify auth state is valid
3. Review disconnect pattern analysis
4. Adjust grace period if needed

### Reconnection Loop
1. Check circuit breaker status
2. Review consecutive failure count
3. Verify auth state not corrupted
4. Check logs for permanent failures

### Slow Reconnection
1. Check exponential backoff settings
2. Review average reconnect time
3. Consider reducing max delay
4. Enable state preservation

## Testing

```javascript
// Test connection stability
import { ConnectionManager } from '@violetix/baileys/Utils'

const manager = new ConnectionManager({ logger })

// Simulate disconnect
manager.recordDisconnect(DisconnectReason.connectionLost, new Error('test'))
console.log(manager.shouldAttemptReconnect(DisconnectReason.connectionLost))
console.log(manager.getReconnectDelay())

// Check pattern analysis
manager.recordDisconnect(DisconnectReason.connectionLost, new Error('test'))
manager.recordDisconnect(DisconnectReason.connectionLost, new Error('test'))
console.log(manager.analyzeDisconnectPattern())
```

## Notes

- All improvements backward compatible
- Original Baileys behavior preserved when features disabled
- Metrics optional, no overhead if not used
- Grace period adjustments prevent false positives

## Future Improvements

1. WebSocket connection pooling
2. Better network quality detection
3. Predictive disconnect prevention
4. Multi-region failover
5. Session migration support

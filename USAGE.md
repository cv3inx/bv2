# Stable Connection untuk Third-Party Obfuscated Library

Karena library pihak ketiga yang digunakan di-obfuscate, kita tidak bisa modify internal logic. Solusinya: **wrap di level user code**.

## Quick Start

```javascript
import { createStableConnection } from '@violetix/baileys/Utils'

// Factory function untuk membuat socket
const socketFactory = () => {
    return makeWASocket({
        auth: authState,
        logger,
        // config lainnya
    })
}

// Create wrapper dengan stability features
const wrapper = createStableConnection(socketFactory, {
    logger,
    maxReconnectAttempts: 15,
    reconnectDelayMs: 5000,
    keepAliveCheckIntervalMs: 20000,
    keepAliveTimeoutMs: 60000
})

// Event handlers
wrapper
    .on('onConnect', () => {
        console.log('✅ Connected')
    })
    .on('onDisconnect', (data) => {
        console.log('❌ Disconnected:', data.reason)
    })
    .on('onReconnectAttempt', (data) => {
        console.log(`🔄 Reconnecting (attempt ${data.attempt})...`)
    })
    .on('onReconnectSuccess', (data) => {
        console.log(`✅ Reconnected after ${data.time}ms`)
    })
    .on('onReconnectFailed', (data) => {
        console.log('❌ All reconnection attempts failed')
    })
    .on('onQR', ({ qr }) => {
        console.log('📱 QR:', qr)
    })
    .on('onMessage', (msg) => {
        // Handle message
    })

// Connect
await wrapper.connect()

// Get socket untuk digunakan
const sock = wrapper.getSocket()

// Check metrics
console.log(wrapper.getMetrics())

// Force reconnect jika perlu
await wrapper.forceReconnect()

// Stop reconnecting
wrapper.stop()

// Resume reconnecting
wrapper.resume()
```

## Fitur Utama

### 1. Auto-Reconnect dengan Exponential Backoff
- Retry otomatis saat disconnect
- Delay bertambah eksponensial: 5s → 10s → 20s → 40s → ...
- Jitter untuk menghindari thundering herd
- Maksimal 15 attempts (configurable)

### 2. Activity Monitoring
- Track aktivitas terakhir (messages, connection updates)
- Deteksi koneksi stale (no activity > 60s)
- Auto-reconnect jika unresponsive

### 3. Smart Disconnect Handling
- Tidak reconnect untuk error permanen:
  - `loggedOut` (401)
  - `forbidden` (403)
  - `multideviceMismatch` (411)
- Reconnect untuk error temporary:
  - `connectionClosed` (428)
  - `connectionLost` (408)
  - `restartRequired` (515)
  - `timedOut` (408)

### 4. Keep-Alive Monitoring
- Check kesehatan koneksi setiap 20s
- Deteksi jika tidak ada aktivitas > 60s
- Auto-trigger reconnect setelah 3x failures

### 5. Metrics & Monitoring
```javascript
{
    totalConnections: 5,
    successfulConnections: 5,
    totalDisconnects: 4,
    reconnectAttempts: 4,
    successfulReconnects: 4,
    failedReconnects: 0,
    uptime: 3600000, // ms
    reconnectSuccessRate: '100.00%',
    lastActivityTime: 1699999999999,
    timeSinceLastActivity: 5000
}
```

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `maxReconnectAttempts` | 15 | Max reconnect attempts |
| `reconnectDelayMs` | 5000 | Base delay (ms) |
| `maxReconnectDelayMs` | 90000 | Max delay (ms) |
| `keepAliveCheckIntervalMs` | 20000 | Health check interval |
| `keepAliveTimeoutMs` | 60000 | No activity timeout |
| `maxKeepAliveFailures` | 3 | Failures before reconnect |
| `enableAutoReconnect` | true | Enable auto-reconnect |
| `logger` | console | Logger instance |

## Contoh Lengkap

```javascript
import { makeWASocket, useMultiFileAuthState } from '@violetix/baileys'
import { createStableConnection } from '@violetix/baileys/Utils'
import pino from 'pino'

async function main() {
    const logger = pino({ level: 'info' })
    const { state: authState, saveCreds } = await useMultiFileAuthState('auth')
    
    // Factory function
    const createSocket = () => {
        return makeWASocket({
            auth: authState,
            logger,
            printQRInTerminal: false
        })
    }
    
    // Create stable wrapper
    const wrapper = createStableConnection(createSocket, {
        logger,
        maxReconnectAttempts: 15,
        reconnectDelayMs: 5000
    })
    
    // Events
    wrapper
        .on('onQR', ({ qr }) => {
            // Show QR
            console.log('Scan QR:', qr)
        })
        .on('onConnect', () => {
            console.log('Bot ready!')
        })
        .on('onDisconnect', ({ reason }) => {
            console.log('Disconnected, reason:', reason)
        })
        .on('onReconnectSuccess', ({ attempt, time }) => {
            console.log(`Reconnected in ${time}ms (attempt ${attempt})`)
        })
        .on('onMessage', async (msg) => {
            const sock = wrapper.getSocket()
            // Handle message
        })
    
    // Connect
    await wrapper.connect()
    
    // Save credentials on update
    wrapper.getSocket()?.ev?.on('creds.update', saveCreds)
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
        console.log('Shutting down...')
        wrapper.stop()
        process.exit(0)
    })
}

main().catch(console.error)
```

## Tips Mengurangi Disconnect

### 1. Gunakan Auth State yang Valid
```javascript
// Pastikan auth state tersimpan dengan benar
const { state, saveCreds } = await useMultiFileAuthState('auth')

sock.ev.on('creds.update', saveCreds)
```

### 2. Monitor Metrics
```javascript
// Check metrics setiap 5 menit
setInterval(() => {
    const metrics = wrapper.getMetrics()
    console.log('Connection health:', metrics)
    
    if (metrics.keepAliveFailures > 0) {
        console.warn('⚠️ Keep-alive failures detected')
    }
}, 5 * 60 * 1000)
```

### 3. Handle Network Changes
```javascript
// Jika ada perubahan network, force reconnect
wrapper.forceReconnect()
```

### 4. Adjust Timing untuk Network Lambat
```javascript
const wrapper = createStableConnection(createSocket, {
    keepAliveCheckIntervalMs: 30000, // Lebih longgar
    keepAliveTimeoutMs: 90000, // Lebih toleran
    maxKeepAliveFailures: 5 // Lebih banyak kesempatan
})
```

### 5. Stop Reconnect saat Maintenance
```javascript
// Saat maintenance, stop reconnect
wrapper.stop()

// Setelah selesai, resume
wrapper.resume()
```

## Troubleshooting

### Masih Sering Disconnect
1. Check network stability
2. Increase `keepAliveTimeoutMs`
3. Increase `maxKeepAliveFailures`
4. Check auth state tidak corrupt
5. Review logs untuk pattern

### Reconnect Loop
1. Check `lastDisconnectReason` di metrics
2. Mungkin error permanen (loggedOut, forbidden)
3. Check auth state valid
4. Try `wrapper.stop()` lalu `wrapper.resume()`

### Connection Stale tapi Tidak Reconnect
1. Check `keepAliveFailures` count
2. Mungkin perlu kurangi `maxKeepAliveFailures`
3. Check `keepAliveCheckIntervalMs` tidak terlalu tinggi

## Keuntungan Wrapper Approach

✅ Tidak perlu modify library obfuscated
✅ Bisa digunakan dengan library apapun
✅ Full control di user code
✅ Easy to debug dan monitor
✅ Backward compatible
✅ No internal patches needed

Wrapper ini bekerja di **level user code** - tidak perlu touch internal library yang di-obfuscate.

# node-spotify-soloist

A lightweight, event-driven Node.js WebSocket client for controlling Spotify playback through [Spotify Soloist](https://developer.spotify.com/documentation/soloist).

Provides a simple interface for playback controls, queue management, player state, and real-time events, with automatic reconnection and request handling.

## Features

- **Playback controls** — Play, pause, skip, and seek.
- **Real-time events** — Subscribe to playback, track, volume, and device changes.
- **Queue management** — Retrieve the queue and add tracks.
- **Playback options** — Control shuffle, repeat, and volume.
- **Device management** — Activate or deactivate the Spotify player.
- **Automatic reconnection** — Reconnects when the WebSocket connection drops.
- **Promise-based requests** — Send commands and await their responses.
- **Zero dependencies** — Uses native WebSocket and EventTarget APIs.

## Requirements

- Node.js 22 or later
- A running Spotify Soloist WebSocket server

## Quick Start

```javascript
import { Soloist } from './soloist.js'

const soloist = new Soloist('ws://localhost:8080')

soloist.on('open', async () => {
  console.log('Connected to Soloist')

  const state = await soloist.request('get_state')
  console.log('Current playback:', state)

  soloist.play()
})

soloist.on('track_changed', ({ item }) => {
  console.log('Now playing:', item.decorations?.identity?.name)
})

soloist.on('close', () => {
  console.log('Disconnected from Soloist')
})
```

Replace `ws://localhost:8080` with your Soloist server's WebSocket URL.

## Usage

### Connecting

Create a client by providing the WebSocket server URL.

```javascript
const soloist = new Soloist('ws://localhost:8080')
```

Automatic reconnection is enabled by default. To disable it:

```javascript
const soloist = new Soloist('ws://localhost:8080', {
  reconnect: false
})
```

When enabled, the client attempts to reconnect 3 seconds after a disconnection.

Commands can be sent once the `open` event fires.

### Playback Controls

```javascript
// Resume playback
soloist.play()

// Play a specific Spotify URI
soloist.play('spotify:track:4uLU6hMCjMI75M1A2tKUQC')

// Pause playback
soloist.pause()

// Skip to the next track
soloist.skipNext()

// Skip to the previous track
soloist.skipPrev()

// Seek to 30 seconds
soloist.seek(30000)
```

### Volume and Playback Options

```javascript
// Set volume
soloist.setVolume(0.5)

// Enable shuffle
soloist.setShuffle(true)

// Disable shuffle
soloist.setShuffle(false)

// Repeat the current context
soloist.setRepeatContext(true)

// Repeat the current track
soloist.setRepeatTrack(true)
```

Volume values are passed directly to the Soloist server.

### Queue Management

```javascript
// Request the current queue
soloist.getQueue()

// Request a limited number of entries
soloist.getQueue(10)

// Add a track to the queue
soloist.addToQueue('spotify:track:4uLU6hMCjMI75M1A2tKUQC')
```

Listen for queue updates:

```javascript
soloist.on('queue_changed', ({ previous, upcoming }) => {
  console.log('Previous tracks:', previous)
  console.log('Upcoming tracks:', upcoming)
})
```

### Player State

Request the current playback state:

```javascript
soloist.getState()
```

Listen for state updates:

```javascript
soloist.on('playback_state', state => {
  console.log('Status:', state.status)
  console.log('Track:', state.item)
  console.log('Position:', state.position.position_ms)
  console.log('Volume:', state.volume)
})
```

The playback status can be one of:

- `idle`
- `playing`
- `paused`
- `buffering`

### Current Track

Access the most recently received track using the `currentTrack` getter.

```javascript
const track = soloist.currentTrack

console.log(track?.decorations?.identity?.name)
```

The value is initially `null` and is updated when the client receives playback or track-change messages. It is cleared when the connection closes or the client receives certain idle or logged-out states.

### Authentication State

```javascript
soloist.on('auth_state', state => {
  console.log('Logged in:', state.logged_in)
  console.log('Active:', state.is_active)
  console.log('Device:', state.device_name)
})

soloist.getAuthState()
```

### Device Management

Activate or deactivate the Soloist player:

```javascript
soloist.activate()

soloist.deactivate()
```

Listen for device changes:

```javascript
soloist.on('device_changed', ({ is_active, device_name }) => {
  console.log('Device:', device_name)
  console.log('Active:', is_active)
})
```

## Promise-based Requests

The `request()` method sends a command and returns a Promise that resolves when Soloist responds.

```javascript
const state = await soloist.request('get_state')

console.log(state.status)
```

Commands are processed sequentially because Soloist error messages do not include a command identifier.

### Examples

```javascript
// Get authentication state
const auth = await soloist.request('get_auth_state')

// Get playback state
const playback = await soloist.request('get_state')

// Get queue
const queue = await soloist.request('get_queue', {
  limit: 10
})

// Pause playback and await confirmation
await soloist.request('pause')

// Set volume and await confirmation
await soloist.request('set_volume', {
  volume: 0.5
})
```

The following commands have dedicated response events:

| Command | Response event |
|---|---|
| `get_auth_state` | `auth_state` |
| `get_state` | `playback_state` |
| `get_queue` | `queue_changed` |
| Other commands | `command_result` |

Requests time out after 5 seconds. On timeout, the client closes the WebSocket connection.

A request may reject when:

- The server returns an error.
- The WebSocket disconnects.
- A socket error occurs.
- The server does not respond within 5 seconds.
- The WebSocket is not open when the command is sent.

Handle request errors using `try/catch`:

```javascript
try {
  await soloist.request('skip_next')
  console.log('Skipped to next track')
} catch (error) {
  console.error('Command failed:', error.message)
}
```

**Note:** Unlike `request()`, the convenience methods such as `play()`, `pause()`, and `getState()` send commands without waiting for a response.

## Events

Subscribe to events using `on()`.

```javascript
soloist.on('playback_changed', ({ status }) => {
  console.log('Playback status:', status)
})
```

The method returns an unsubscribe function:

```javascript
const unsubscribe = soloist.on('volume_changed', ({ volume }) => {
  console.log('Volume:', volume)
})

// Stop listening
unsubscribe()
```

### Available Events

| Event | Description |
|---|---|
| `open` | WebSocket connection established |
| `close` | WebSocket connection closed |
| `socket_error` | WebSocket error occurred |
| `auth_state` | Authentication and device state |
| `playback_state` | Full playback state |
| `track_changed` | Current track changed |
| `playback_changed` | Playback status changed |
| `volume_changed` | Volume changed |
| `device_changed` | Active device changed |
| `context_changed` | Playback context changed |
| `options_changed` | Playback options changed |
| `position_sync` | Playback position synchronized |
| `queue_changed` | Playback queue updated |
| `command_result` | Command completed |
| `error` | Soloist server returned an error |

### Example: Real-time Playback Monitoring

```javascript
const soloist = new Soloist('ws://localhost:8080')

soloist.on('open', () => {
  soloist.getState()
})

soloist.on('track_changed', ({ item }) => {
  console.log('Track:', item.decorations?.identity?.name)
})

soloist.on('playback_changed', ({ status }) => {
  console.log('Playback:', status)
})

soloist.on('position_sync', ({ position }) => {
  console.log('Position:', position.position_ms)
})

soloist.on('volume_changed', ({ volume }) => {
  console.log('Volume:', volume)
})

soloist.on('error', ({ message }) => {
  console.error('Soloist error:', message)
})
```

## API Reference

### Constructor

`new Soloist(url, options?)`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `url` | `string` | Required | Soloist WebSocket URL |
| `options.reconnect` | `boolean` | `true` | Automatically reconnect after disconnection |

### Methods

| Method | Description |
|---|---|
| `on(type, listener)` | Subscribe to an event |
| `request(command, fields?)` | Send a command and await its response |
| `getAuthState()` | Request authentication state |
| `getState()` | Request playback state |
| `getQueue(limit?)` | Request the playback queue |
| `play(uri?)` | Resume playback or play a Spotify URI |
| `pause()` | Pause playback |
| `skipNext()` | Skip to the next track |
| `skipPrev()` | Skip to the previous track |
| `seek(positionMs)` | Seek to a position in milliseconds |
| `setVolume(volume)` | Set playback volume |
| `setShuffle(enabled)` | Enable or disable shuffle |
| `setRepeatContext(enabled)` | Enable or disable context repeat |
| `setRepeatTrack(enabled)` | Enable or disable track repeat |
| `addToQueue(uri)` | Add a Spotify URI to the queue |
| `activate()` | Activate the player |
| `deactivate()` | Deactivate the player |
| `close()` | Close the connection and disable reconnection |

### Properties

| Property | Type | Description |
|---|---|---|
| `currentTrack` | `Entity \| null` | Most recently received track entity |

## Data Structures

### Entity

Spotify entities contain metadata and optional decorations.

```javascript
{
  uri: 'spotify:track:...',
  entity_type: 'track',
  decorations: {
    identity: {
      name: 'Track Name'
    },
    visual_identity: {
      cover: [
        {
          url: 'https://...',
          size: 'large'
        }
      ]
    },
    playback: {
      duration_ms: 180000
    }
  }
}
```

Depending on the entity, decorations may include identity, cover artwork, parent entities, creators, playback duration, and content ratings.

### Playback Position

```javascript
{
  position_ms: 30000,
  timestamp_ms: 1700000000000,
  speed: 1
}
```

### Playback Options

```javascript
{
  shuffle: false,
  repeat: 'off',
  playback_speed: 1,
  modes: {}
}
```

The `repeat` field can be `off`, `context`, or `track`.

### Queue Entry

```javascript
{
  uid: 'queue-entry-id',
  source: 'queue',
  item: {
    entity_type: 'track',
    decorations: {}
  }
}
```

The `source` field can be `context`, `queue`, or `autoplay`.

## Connection Handling

The client automatically reconnects when the WebSocket connection closes, unless reconnection is disabled.

```javascript
const soloist = new Soloist('ws://localhost:8080', {
  reconnect: true
})
```

Reconnect attempts occur after a fixed 3-second delay.

To permanently close the connection:

```javascript
soloist.close()
```

Calling `close()` disables further automatic reconnection for that client instance.

## Error Handling

Soloist distinguishes between WebSocket errors and server-reported errors.

```javascript
soloist.on('socket_error', event => {
  console.error('WebSocket error:', event)
})

soloist.on('error', ({ message }) => {
  console.error('Soloist error:', message)
})

soloist.on('close', event => {
  console.log('Connection closed:', event.code)
})
```

For commands requiring confirmation or explicit error handling, prefer `request()` over the convenience methods.
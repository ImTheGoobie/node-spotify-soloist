/**
 * @typedef {object} Entity
 * @property {string} [uri]
 * @property {string} entity_type
 * @property {object} decorations
 * @property {{name: string}} [decorations.identity]
 * @property {{cover: {url: string, size: string}[]}} [decorations.visual_identity]
 * @property {{entity: Entity}} [decorations.parent]
 * @property {{entity: Entity}[]} [decorations.creators]
 * @property {{duration_ms?: number, content_ratings?: string[]}} [decorations.playback]
 */

/** @typedef {'idle' | 'playing' | 'paused' | 'buffering'} PlaybackStatus */
/** @typedef {{position_ms: number, timestamp_ms: number, speed: number}} Position */
/** @typedef {{shuffle: boolean, repeat: 'off' | 'context' | 'track', playback_speed: number, modes: Record<string, string>}} PlaybackOptions */
/** @typedef {{uid: string, source: 'context' | 'queue' | 'autoplay', item: Entity}} QueueEntry */

/**
 * @typedef {object} SoloistMessages
 * @property {undefined} open
 * @property {Event} socket_error
 * @property {CloseEvent} close
 * @property {{type: 'auth_state', logged_in: boolean, is_active: boolean, device_name: string}} auth_state
 * @property {{type: 'playback_state', status: PlaybackStatus, item: Entity, context: Entity, position: Position, volume: number, is_active: boolean, options: PlaybackOptions, available_actions: Record<string, {step_ms?: number}>}} playback_state
 * @property {{type: 'track_changed', item: Entity}} track_changed
 * @property {{type: 'playback_changed', status: PlaybackStatus}} playback_changed
 * @property {{type: 'volume_changed', volume: number}} volume_changed
 * @property {{type: 'device_changed', is_active: boolean, device_name: string}} device_changed
 * @property {{type: 'context_changed', context: Entity}} context_changed
 * @property {{type: 'options_changed', options: PlaybackOptions}} options_changed
 * @property {{type: 'position_sync', position: Position}} position_sync
 * @property {{type: 'queue_changed', previous: QueueEntry[], upcoming: QueueEntry[]}} queue_changed
 * @property {{type: 'command_result', command: string}} command_result
 * @property {{type: 'error', message: string}} error
 */

/**
 * Spotify Soloist WebSocket client. Commands can be sent after the open event.
 * Subscribe with on() for Soloist messages and socket lifecycle events.
 */
export class Soloist extends EventTarget {
	#socket
	#retryTimer
	#closed = false
	#pendingRequest = Promise.resolve()
	#currentTrack = null

	constructor(url, { reconnect = true } = {}) {
		super()

		const connect = () => {
			this.#socket = new WebSocket(url)
			this.#socket.addEventListener('open', () => this.dispatchEvent(new Event('open')))
			this.#socket.addEventListener('error', event => {
				this.dispatchEvent(new CustomEvent('socket_error', { detail: event }))
			})
			this.#socket.addEventListener('close', event => {
				this.#currentTrack = null
				this.dispatchEvent(new CustomEvent('close', { detail: event }))
				if (!reconnect || this.#closed) return
				this.#retryTimer = setTimeout(connect, 3000)
				this.#retryTimer.unref()
			})
			this.#socket.addEventListener('message', event => {
				const message = JSON.parse(event.data)
				if (message.type === 'playback_state' || message.type === 'track_changed') {
					this.#currentTrack = message.status === 'idle' ? null : message.item
				} else if (message.status === 'idle' || (message.type === 'auth_state' && !message.logged_in)) {
					this.#currentTrack = null
				}
				this.dispatchEvent(new CustomEvent(message.type, { detail: message }))
			})
		}

		connect()
	}

	get currentTrack() {
		return this.#currentTrack
	}

	/** Send one request at a time because Soloist errors carry no command identifier. */
	request(command, fields) {
		const eventType = {
			get_auth_state: 'auth_state',
			get_state: 'playback_state',
			get_queue: 'queue_changed'
		}[command] ?? 'command_result'
		const request = this.#pendingRequest.then(() => {
			const listeners = new AbortController()
			let timeout

			return new Promise((resolve, reject) => {
				const options = { signal: listeners.signal }
				this.addEventListener(eventType, ({ detail }) => {
					if (eventType === 'command_result' && detail.command !== command) return
					resolve(detail)
				}, options)
				this.addEventListener('error', ({ detail }) => reject(new Error(detail.message)), options)
				this.addEventListener('close', () => reject(new Error('Soloist disconnected.')), options)
				this.addEventListener('socket_error', () => reject(new Error('Could not connect to Soloist.')), options)
				this.#send(command, fields)
				timeout = setTimeout(() => {
					reject(new Error('Soloist did not respond.'))
					this.#socket.close()
				}, 5000)
			}).finally(() => {
				clearTimeout(timeout)
				listeners.abort()
			})
		})
		this.#pendingRequest = request.catch(() => {})
		return request
	}

	/**
	 * Subscribe to a raw Soloist payload. Returns a function that removes the listener.
	 * @template {keyof SoloistMessages} Type
	 * @param {Type} type
	 * @param {(message: SoloistMessages[Type]) => void} listener
	 */
	on(type, listener) {
		const handleEvent = event => listener(event.detail)
		this.addEventListener(type, handleEvent)
		return () => this.removeEventListener(type, handleEvent)
	}

	#send(command, fields) {
		if (this.#socket.readyState !== WebSocket.OPEN) {
			throw new Error('Soloist WebSocket is not open')
		}

		this.#socket.send(JSON.stringify({ type: 'command', command, ...fields }))
	}

	close() {
		this.#closed = true
		clearTimeout(this.#retryTimer)
		this.#socket.close()
	}

	getAuthState() {
		this.#send('get_auth_state')
	}

	getState() {
		this.#send('get_state')
	}

	/** @param {number} [limit] */
	getQueue(limit) {
		this.#send('get_queue', { limit })
	}

	/** @param {string} [uri] */
	play(uri) {
		this.#send('play', { uri })
	}

	pause() {
		this.#send('pause')
	}

	skipNext() {
		this.#send('skip_next')
	}

	skipPrev() {
		this.#send('skip_prev')
	}

	/** @param {number} positionMs */
	seek(positionMs) {
		this.#send('seek', { position_ms: positionMs })
	}

	/** @param {number} volume */
	setVolume(volume) {
		this.#send('set_volume', { volume })
	}

	/** @param {boolean} enabled */
	setShuffle(enabled) {
		this.#send('set_shuffle', { enabled })
	}

	/** @param {boolean} enabled */
	setRepeatContext(enabled) {
		this.#send('set_repeat_track', { enabled: !enabled })
		this.#send('set_repeat_context', { enabled })
	}

	/** @param {boolean} enabled */
	setRepeatTrack(enabled) {
		this.#send('set_repeat_context', { enabled: !enabled })
		this.#send('set_repeat_track', { enabled })
	}

	/** @param {string} uri */
	addToQueue(uri) {
		this.#send('add_to_queue', { uri })
	}

	activate() {
		this.#send('activate')
	}

	deactivate() {
		this.#send('deactivate')
	}
}

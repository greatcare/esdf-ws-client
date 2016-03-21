var EventEmitter2 = require('eventemitter2').EventEmitter2;

function SocketTransportStateError(state, readyState) {
	this.name = 'SocketTransportStateError';
	this.message = 'The underlying socket is not connected (current state: ' + state + '; readyState: ' + readyState + ')';
	this.data = {
		state: state,
		readyState: readyState
	};
	if (typeof Error.captureStackTrace === 'function') {
		Error.captureStackTrace(this, SocketTransportStateError);
	}
}
SocketTransportStateError.prototype = Object.create(Error.prototype);

module.exports = function(SocketConstructor) {
	var states = [
		// A "null" state is when the socket is unconnected, and no attempt to connect has been made.
		'unconnected',
		// An attempt to connect is being made:
		'connecting',
		// The socket is connected and operational:
		'connected',
		// A connection has failed and a retry delay is currently running:
		'retrying'
	];
	
	/**
	 * SocketTransport is a class which maintains an active connection to a WebSocket server
	 *  and performs reconnection whenever needed. It also notifies the user of the socket
	 *  about disconnects and allows sending and receiving messages, mimicking the native
	 *  WebSocket API.
	 * @constructor
	 * @extends EventEmitter
	 * @param {string} URL - The URL to connect to. Usually equal to something like "ws://host.tld" or "ws://host.tld/path/to/socket".
	 * @param {Object} [options] - Options for controlling the behaviour of the transport.
	 */
	function SocketTransport(URL, options) {
		if (!URL) {
			throw new Error('A WebSocket URL must be passed to the SocketTransport constructor!');
		}
		if (!(this instanceof SocketTransport)) {
			return new SocketTransport(URL, options);
		}
		/**
		 * The URL to use for connecting to the WebSocket server.
		 * Typically, it looks like "ws://host.tld/path", where path may be empty.
		 * @type {string}
		 */
		this._URL = URL;
		/**
		 * A map of options to control the transport's behaviour.
		 */
		this._options = options || {};
		/**
		 * The current socket object in use.
		 * Since WebSockets can not be re-used after they have been closed,
		 *  this reference points to the current (i.e. most recent) socket in use.
		 * @type {?external:WebSocket}
		 */
		this._socket = null;
		/**
		 * A descriptive state of the transport, for internal logic use.
		 * This controls the various state transitions.
		 * @type {string}
		 */
		this._state = 'unconnected';
		/**
		 * Whether the transport is active.
		 * True means that the user intends to be connected.
		 * False is when the user has explicitly requested a connection shutdown.
		 * Inactive transports do not attempt reconnection when closed or when an error occurs.
		 * @type {boolean}
		 */
		this._active = false;
		/**
		 * The reconnection timeout. Set when an unplanned disconnect occurs.
		 * It is cleared when _deactivate() is called.
		 */
		this._reconnectTimeout = null;
		EventEmitter2.call(this);
		
		/**
		 * We store a map of "standard listeners" - that is, functions that we are going
		 *  to be adding as event listeners on WebSocket objects.
		 * This way, we have a reference to them, so we can do .removeEventListener().
		 * @type {Object.<string,function>}
		 */
		var self = this;
		var listeners = {
			open: function() {
				self._handleOpen();
			},
			error: function(error) {
				self._handleError(error);
			},
			close: function(closeEvent) {
				self._handleDisconnect();
			},
			message: function(messageEvent) {
				self.emit('message', messageEvent.data);
			}
		};
		this._standardListeners = listeners;
		
	}
	SocketTransport.prototype = Object.create(EventEmitter2.prototype);
	
	// ### State transition methods ###
	
	SocketTransport.prototype._connect = function _connect() {
		this._socket = new SocketConstructor(this._URL);
		this._setup();
	};
	
	SocketTransport.prototype._setup = function _setup() {
		// We take the listeners from our internal map, so that we have a reference to them at all times.
		// This lets us remove them during teardown and avoid a listener (memory) leak.
		var listeners = this._standardListeners;
		this._socket.addEventListener('open', listeners.open);
		this._socket.addEventListener('error', listeners.error);
		this._socket.addEventListener('close', listeners.close);
		this._socket.addEventListener('message', listeners.message);
	};
	
	SocketTransport.prototype._teardown = function _teardown() {
		var listeners = this._standardListeners;
		// Guard clause: if no socket is present at all, do nothing.
		if (!this._socket) {
			return;
		}
		if (this._socket.removeEventListener) {
			this._socket.removeEventListener('open', listeners.open);
			this._socket.removeEventListener('error', listeners.error);
			this._socket.removeEventListener('close', listeners.close);
			this._socket.removeEventListener('message', listeners.message);
		}
		else if (this._socket.removeListener) {
			this._socket.removeListener('open', listeners.open);
			this._socket.removeListener('error', listeners.error);
			this._socket.removeListener('close', listeners.close);
			this._socket.removeListener('message', listeners.message);
		}
		
	};
	
	SocketTransport.prototype._disconnect = function _disconnect() {
		// Clear the reconnection timeout, if any.
		if (this._reconnectTimeout) {
			clearTimeout(this._reconnectTimeout);
			this._reconnectTimeout = null;
		}
		// Only then do we close the socket.
		try {
			this._socket.close();
		}
		catch (error) {
			// If an error occurs, this probably means that the socket is already closed.
			// Thus, we do not have to do anything further.
		}
		// Behave as if the socket has disconnected on its own. Notify listeners.
		//this._handleDisconnect();
		// Finally, we can clear the reference to the socket.
		this._socket = null;
	};
	
	SocketTransport.prototype._handleOpen = function _connected() {
		this._state = 'connected';
		this.emit('connect');
	};
	
	SocketTransport.prototype._handleError = function _handleError(error) {
		this.emit('error', error);
		this._handleDisconnect();
	};
	
	SocketTransport.prototype._handleDisconnect = function _handleDisconnect() {
		var stateAtDisconnectTime = this._state;
		this._state = 'unconnected';
		// Remove all event listeners. If the socket emits a 'close' event, we do not want to be repeating the already-emitted event.
		this._teardown();
		if (this._active) {
			this._retryConnection();
		}
		if (stateAtDisconnectTime === 'connected') {
			this.emit('disconnect');
		}
	};
	
	SocketTransport.prototype._retryConnection = function _retryConnection() {
		var self = this;
		if (self._state !== 'retrying') {
			self._state = 'retrying';
			//TODO: Custom delay strategy.
			self._reconnectTimeout = setTimeout(function() {
				self._reconnectTimeout = null;
				self._state = 'connecting';
				self._connect();
			}, 2000);
		}
	};
	
	// ### Publc methods ###
	
	//TODO: doc
	SocketTransport.prototype.start = function start() {
		if (!this._active) {
			this._active = true;
			this._connect();
		}
	};
	
	SocketTransport.prototype.stop = function stop() {
		if (this._active) {
			this._active = false;
			this._disconnect();
		}
	};
	
	SocketTransport.prototype.send = function send(message) {
		// Diagnostic variable to store the readyState in case sending fails.
		var readyState;
		if (this._state !== 'connected') {
			readyState = this._socket ? this._socket.readyState : null;
			throw new SocketTransportStateError(this._state, readyState);
		}
		try {
			this.emit('send', message);
			this._socket.send(message);
		}
		catch (error) {
			readyState = this._socket.readyState;
			throw new SocketTransportStateError(this._state, readyState);
		}
	};
	
	// ### Actual "export" ###
	
	return SocketTransport;
};

var EventEmitter2 = require('eventemitter2').EventEmitter2;
var uuid = require('uuid');

function DisconnectError() {
	this.name = 'DisconnectError';
	this.message = 'RPC transport has disconnected in the middle of the request';
	this.isRetriable = true;
	if (typeof Error.captureStackTrace === 'function') {
		Error.captureStackTrace(this, DisconnectError);
	}
}
DisconnectError.prototype = Object.create(Error.prototype);

function isResponse(message) {
	return typeof(message.id) === 'string' && message.id && (message.error || (typeof message.result !== 'undefined'));
}

function annotateError(error) {
	if (error && error.name === 'SocketTransportStateError') {
		error.isRetriable = true;
	}
}

module.exports = function() {
	function JSONRPC(transport) {
		EventEmitter2.call(this);
		this._transport = transport;
		
		// Create a map of requests by ID.
		this._requests = Object.create(null);
		
		this._init();
	}
	JSONRPC.prototype = Object.create(EventEmitter2.prototype);
	
	// ### Internals ###
	
	JSONRPC.prototype._init = function _init() {
		var self = this;

		// React to messages coming from the server:
		self._transport.on('message', function(data) {
			// Check whether the message looks like JSON-RPC 2.0:
			var parsedMessage;
			try {
				parsedMessage = JSON.parse(data);
			}
			catch (error) {
				// The message fails to parse as JSON. It surely is not JSON-RPC.
				return;
			}
			if (parsedMessage && parsedMessage.jsonrpc === '2.0') {
				self._processMessage(parsedMessage);
			}
		});
		
		// Upon a disconnect, reject all requests' promises:
		self._transport.on('disconnect', function() {
			var error = new DisconnectError();
			self._rejectAll(error);
		});
	};
	
	JSONRPC.prototype._processMessage = function _processMessage(message) {
		// Guard clause: only react to actual JSON-RPC 2.0 Response objects.
		if (!isResponse(message)) {
			return;
		}
		// Guard clause: if no request with this ID was issued, ignore the message.
		if (!this._requests[message.id]) {
			return;
		}
		this.emit('response', message);
		// Now that we know that the request had been made, determine what the result was:
		if (typeof message.result !== 'undefined') {
			this._requests[message.id].fulfill(message.result);
		}
		else {
			var error = new Error(message.error.message, message.error.code);
			error.data = message.error.data;
			this._requests[message.id].reject(error);
		}
		delete this._requests[message.id];
	};
	
	JSONRPC.prototype._rejectAll = function _rejectAll(error) {
		var self = this;
		Object.keys(self._requests).forEach(function(requestID) {
			self._requests[requestID].reject(error);
			delete self._requests[requestID];
		});
	};
	
	// ### Public methods ###
	
	JSONRPC.prototype.call = function call(method, params) {
		var self = this;
		var request = {
			jsonrpc: '2.0',
			method: String(method),
			params: Object(params || 0),
			id: uuid.v4()
		};
		self.emit('request', request);
		return new Promise(function callJSONRPCMethod(fulfill, reject) {
			try {
				self._transport.send(JSON.stringify(request));
			}
			catch (sendError) {
				// For known transport errors, annotate them with an "isRetriable" flag.
				// This lets the consumers of this JSONRPC API consistently perform only one check when deciding whether to retry the call in the future.
				annotateError(sendError);
				return void reject(sendError);
			}
			self._requests[request.id] = { fulfill: fulfill, reject: reject };
		});
	};
	
	JSONRPC.prototype.abortAll = function abortAll(error) {
		this._rejectAll(error || new Error('Manually aborted all pending requests'));
	};
	
	return JSONRPC;
};

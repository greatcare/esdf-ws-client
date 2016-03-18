var lib = {
	SocketTransport: require('./SocketTransport'),
	JSONRPC: require('./JSONRPC'),
	Commander: require('./Commander')
};
var EventEmitter2 = require('eventemitter2').EventEmitter2;

module.exports = function(SocketConstructor) {
	var SocketTransport = lib.SocketTransport(SocketConstructor);
	var JSONRPC = lib.JSONRPC();
	var Commander = lib.Commander();
	
	/**
	 * The AppClient is a high-level JSON-RPC client with support for method retries and reconnecting.
	 * @constructor
	 * @param {string} URL - The WebSocket URL to connect to.
	 * @param {Object} options - The 
	 */
	function AppClient(URL, options) {
		if (!(this instanceof AppClient)) {
			
		}
		
		//TODO: Implement option passing.
		//TODO: Implement passing custom transport, RPC and commander instances.
		var transport = new SocketTransport(URL);
		var RPC = new JSONRPC(transport);
		var commander = new Commander(RPC);
		
		// Every time we manage to connect, all pending calls are retried:
		transport.on('connect', function() {
			setTimeout(function() {
				commander.triggerRetries();
			}, 10000 * Math.random());
		});
		
		// Make transport errors non-fatal:
		transport.on('error', function() {});
		
		//TODO: Listen for drop notifications and immediately reject all RPCs with an { isRetriable: true } error.
		
		// Initialize getters so that all underlying resources may be conveniently accessed.
		Object.defineProperties(this, {
			transport: { enumerable: true, get: function() { return transport; } },
			RPC: { enumerable: true, get: function() { return RPC; } },
			commander: { enumerable: true, get: function() { return commander; } }
		});
		
		// Start the transport right away!
		transport.start();
	}
	
	AppClient.prototype.call = function call() {
		return this.commander.call.apply(this.commander, arguments);
	};
	
	return AppClient;
};

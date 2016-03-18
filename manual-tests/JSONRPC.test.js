var ws = require('ws');
var SocketTransport = require('../lib/SocketTransport')(ws);
var JSONRPC = require('../lib/JSONRPC')();

var transport = new SocketTransport('ws://localhost:7717');
transport.start();
var client = new JSONRPC(transport);

setInterval(function() {
	console.log('---> request');
	client.call('getDate', {}).then(function(dateResult) {
		console.log('date result:', dateResult);
	}, function(error) {
		console.log('date error: %s (retriable: %s)', error.name, error.isRetriable ? 'yes' : 'no');
	});
}, 3000);

transport.on('error', function(error) {
	//console.error(error.code || error.name || error);
});

transport.on('connect', function() {
	console.log('CONNECT');
});
transport.on('disconnect', function() {
	console.log('DISCONNECT');
});

setTimeout(function() {
	transport.stop();
}, 10000);

setTimeout(function() {
	transport.start()
}, 20000);

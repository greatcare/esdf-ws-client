var ws = require('ws');
var SocketTransport = require('../lib/SocketTransport')(ws);
var JSONRPC = require('../lib/JSONRPC')();
var Commander = require('../lib/Commander')();

var transport = new SocketTransport('ws://localhost:7717');
transport.start();
var client = new JSONRPC(transport);
var commander = new Commander(client);

setInterval(function() {
	console.log('---> request');
	commander.call('getDate', {}).then(function(dateResult) {
		console.log('date result:', dateResult);
	}, function(error) {
		console.log('date error: %s (retriable: %s)', error.name, error.isRetriable ? 'yes' : 'no', error);
	});
}, 3000);

transport.on('error', function(error) {
	//console.error(error.code || error.name || error);
});

transport.on('connect', function() {
	console.log('CONNECT');
	setTimeout(function() {
		commander.triggerRetries();
	}, Math.random() * 10000);
});
transport.on('disconnect', function() {
	console.log('DISCONNECT');
});

// setTimeout(function() {
// 	transport.stop();
// }, 10000);

// setTimeout(function() {
// 	transport.start()
// }, 20000);

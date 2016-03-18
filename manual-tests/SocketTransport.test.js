var ws = require('ws');
var SocketTransport = require('../lib/SocketTransport')(ws);

var transport = new SocketTransport('ws://[::1]:8865');
transport.start();

setInterval(function() {
	try {
		transport.send('hey there');
	}
	catch (error) {
		console.log('* Sending error:', error.name);
	}
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

transport.on('message', function(message) {
	console.log('message:', message);
});

// setTimeout(function() {
// 	transport.stop();
// }, 10000);
// 
// setTimeout(function() {
// 	transport.start()
// }, 20000);

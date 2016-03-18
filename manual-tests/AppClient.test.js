var ws = require('ws');
var AppClient = require('../lib/AppClient')(ws);
var client = new AppClient('ws://quanta.rkaw.pl:7717');

setInterval(function() {
	console.log('---> request');
	client.call('getDate', {}).then(function(dateResult) {
		console.log('date result:', dateResult);
	}, function(error) {
		console.log('date error: %s (retriable: %s)', error.name, error.isRetriable ? 'yes' : 'no', error);
	});
}, 3000);

client.transport.on('connect', function() {
	console.log('CONNECT');
});

client.transport.on('disconnect', function() {
	console.log('DISCONNECT');
});

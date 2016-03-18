var when = require('when');
var EventEmitter2 = require('eventemitter2').EventEmitter2;
var defaultRetry = require('./utils/RetryStrategies').defaultRetry;

module.exports = function() {
	/**
	 * A Commander is a layer over a JSON-RPC 2.0 Client which controls automatic retries of method calls.
	 * @constructor
	 * @param {JSONRPC} client - The underlying JSON-RPC client to use. Should expose an API equivalent to the one found in the JSONRPC module in this package.
	 * @param {Object} [options] - Tunables that control the behaviour of this automatic layer.
	 * @param {function} [options.retryStrategy] - A function that should accept no arguments and return a function which, when called with arguments (next:function, error:Error), will call that "next" function some time in the future, or reject with the passed error if retry is denied.
	 */
	function Commander(client, options) {
		if (!(this instanceof Commander)) {
			return new Commander(client, options);
		}
		
		EventEmitter2.call(this);
		this.setMaxListeners(0);
		
		options = options || {};
		
		options.retryStrategy = options.retryStrategy || defaultRetry;
		
		this._client = client;
		this._options = options;
	}
	Commander.prototype = Object.create(EventEmitter2.prototype);
	
	/**
	 * Call a given remote method and retry if adverse network conditions occur.
	 * Note that this implies the target system provides idempotent methods.
	 * @param {string} method - Name of the remote method to call.
	 * @param {Object} params - The parameters to pass to the call. This could also be an Array if positional arguments are employed instead of a map of parameters.
	 * @returns {Promise} - A Promise that fulfills with the method's result when the call has succeeded and rejects if the call fails with an application error, or if network errors occur and all retries fail.
	 */
	Commander.prototype.call = function call(method, params) {
		var retry = this._options.retryStrategy({}, this);
		var client = this._client;
		
		function tryCall() {
			return client.call(method, params).then(function callSucceeded(resolution) {
				return resolution;
			}, function callFailed(error) {
				if (error && error.isRetriable) {
					return retry(tryCall, error);
				}
				else {
					throw error;
				}
			});
		}
		
		return tryCall();
	};
	
	Commander.prototype.triggerRetries = function triggerRetries() {
		this.emit('shouldRetry');
	};
	
	return Commander;
};

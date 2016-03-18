var when = require('when');

/**
 * @param {Object} options - Settings to control the behaviour of the retry strategy.
 * @param {EventEmitter} controller - An EventEmitter that emits 'shouldRetry' whenever a pending retry should be made immediate.
 */
module.exports.defaultRetry = function defaultRetry(options, controller) {
	var currentDelay = options.initialDelay || 3000;
	var maximumDelay = options.maximumDelay || 60000;
	// We randomize the time delay multiplier so that spam does not occur.
	var multiplier = 1.5 + (options.deterministic ? 1 : Math.random());
	var maximumRetries = options.maximumRetries || 6;
	var retryNumber = 1;
	return function exponentialBackOff(next, error) {
		// See if we've reached the limit.
		if (retryNumber > maximumRetries) {
			return when.reject(error);
		}
		retryNumber += 1;
		return when.promise(function(resolve) {
			var retryTimer;
			// Declare a "xor" guard which will ensure that the retry is only attempted once:
			var retryEntered = false;
			var retry = function retry() {
				// Guard clause: ensure the handler only runs once.
				if (retryEntered) {
					return;
				}
				// Set the guard flag.
				retryEntered = true;
				// Clear the timeout - this is a no-op if we've entered this function due to the timeout firing in the ordinary way.
				clearTimeout(retryTimer);
				// Remove the handler - this is a no-op if we've arrived here due to the shouldRetry event.
				// Increase the delay by multiplying it by a pre-determined value:
				currentDelay = currentDelay * multiplier;
				// Enforce the amount of time the delay is capped at:
				if (currentDelay > maximumDelay) {
					currentDelay = maximumDelay;
				}
				// Actually call the next function, remembering to use "return" so that the promise chain is not broken:
				return resolve(next());
			};
			controller.once('shouldRetry', retry);
			retryTimer = setTimeout(retry, currentDelay);
		});
	};
}
# WebSocket client overlay

This library provides an API over several WebSocket implementations that makes it easy to write always-connected single-page browser applications or Node.js client programs.

Several API levels are available - from the very basic "transport" object that only maintains socket connections, up to a Promise-based JSON-RPC 2.0 client that hides command retries.

**Note that the library is written in modern ECMAScript 6 and may require a recent browser and Node.js versions, or being compiled into ES5.**

## Using the library

A package.json file is provided for npm. The entry point is index.js, which exports the classes using **module.exports** (CommonJS). Probably the simplest way to obtain and include the package is to use

```
npm install --save esdf-ws-client
```

and then require the library from your application code. For browsers, use **require** and **webpack**: put a `require('esdf-ws-client')` in an application source file (here, we assume your app entry point is `app.js`), and make sure that `esdf-ws-client` is installed in your top-level `node_modules`. Now, you can call
```
webpack app.js bundle.js
```
to generate the bundle file. Webpack should be able to find the dependency and resolve the `require` statement.

**Some usage examples for the various layers provided by this library can be seen in the `manual-tests` directory.**

## Exported symbols

The exported symbols are functions that return constructors. For example, to use the `SocketTransport` class, you would write:
```js
// Browser:
var SocketTransport = require('esdf-ws-client').SocketTransport(window.WebSocket);
// Node.js
var ws = require('ws');
var SocketTransport = require('esdf-ws-client').SocketTransport(ws);
```

This way, the library is independent from a given WebSocket implementation, as long as the API is WebSocket-compatible. The second (Node.js) example is actually included in the `manual-tests/` directory. Currently, only the `ws` Node module is known to implement the WebSocket API such that it is compatible to the browser side.

## API layers

Several "levels" of the API are provided. From the bottom: SocketTransport (low-level socket messages), JSONRPC, Commander, AppClient (high-level RPC calls with retries).

### exports.SocketTransport(SocketConstructor) => class SocketTransport(socketURL)
Generate a SocketTransport constructor from a given underlying WebSocket implementation. A SocketTransport is an object that simulates a WebSocket connection, but adds automatic reconnects and simplifies state management.

Example:
```js
var client = require('esdf-ws-client');
// Get a Node module that is WebSocket-compatible
var socketImplementation = require('ws');
// Generate a class constructor by injecting the socket implementation:
var SocketTransport = client.SocketTansport(socketImplementation);
// Now we can use the constructor:
var myTransport = new SocketTransport('ws://localhost:1234');
```

SocketTransport instances are EventEmitters (in particular, they implement the `EventEmitter2` API). Internally, the transport maintains multiple socket instances and replaces them whenever necessary. All comnunication must be handled through the SocketTransport API.

#### SocketTransport#start()
Start the transport. The transport is always constructed as stopped and must be started manually. After starting, the transport will try to connect to the given WebSocket URL, and will emit events informing listeners of connection state changes that the socket knows of. Multiple attempts to start the transport are ignored.

#### SocketTransport#stop()
Stop the transport. This closes the current connection, if any, and disables further attempts at reconnecting. If the connection is up at the time when this method is called, the transport will emit a `disconnect` event.

#### SocketTransport#send(message)
Send a message over the socket. The message must be a string, and will be delivered to the other side of the socket in a single WebSocket frame. Sending may fail if the transport is known to be disconnected - then, a `SocketTransportStateError` is thrown (if you need to recognize error types, `error.name` equals `'SocketTransportStateError'`).

The SocketTransport does not retransmit lost messages. Unless the underlying TCP connection recovers automatically, the user of this class should assume that all messages that had been sent, but not acknowledged in some application-specific way (such as using replies), have been lost.

#### SocketTransport#on(eventType, listener)
Add a listener for an event of the given **eventType**. The list of supported events is available below.

#### SocketTransport#on('connect', function() { ... })
Add a listener for the `connect` event. This event type is emitted when the underlying socket has managed to connect. Note that having connected is not a sufficient guarantee of being able to exchange messages - the connection could go down without the socket "knowing" about it for considerable lengths of time.

#### SocketTransport#on('disconnect', function() { ... })
Add a listener for the `disconnect` event, which is emitted when a connection had been established, but has now gone down. Note that, for a disconnect to occur, a `connect` event must have been emitted before. Thus, if an application never actually manages to connect from the start, this event will not be emitted. This differentiates it significantly from the `error` event.

#### SocketTransport#on('message', function(message) { ... })
Add a listener for the `message` event. The event is emitted whenever a new message is received on the socket. The listener function gets one argument - the message contents (string).

#### SocketTransport#on('error', function(error) { ... })
Add a listener for the `error` event, emitted when an error occurs on the underlying socket. Errors occur when:
* A connection attempt times out or otherwise fails
* An established connection is terminated for reasons other than a direct request to do so (SocketTransport.stop)

Thus, it is possible to be seeing "error" events occuring periodically on an application that is unable to connect and is retrying its attempts.

### exports.JSONRPC() => class JSONRPC(transport)
Create a JSONRPC constructor. No arguments are necessary for getting the class constructor, but the "class factory" pattern is still used for consistency.
A JSONRPC is an object that uses an existing `SocketTransport` (passed as the sole argument to the generated constructor) to send JSON-RPC 2.0 Requests and receive their corresponding Replies on the user's behalf. In other words, it is an RPC client for WebSocket.

This basic JSON-RPC 2.0 client lacks support for notifications and bulk requests/replies - it can only handle the obvious case when all requests and replies have IDs assigned. For asynchronous notifications, use the raw transport class.

Messages that do not look like JSON-RPC 2.0 are silently ignored, making it possible to multiplex several protocols within the WebSocket transport by having multiple `message` listeners. Note that, upon construction, the JSONRPC client becomes a listener for the `message` event on the passed transport, but that does not make it the sole listener. Thus, any other listeners that handle non-RPC messages must be aware that they will also be getting `message` events containing JSON-RPC 2.0 payloads, and ignore them accordingly.

#### JSONRPC#call(method, params) => Promise
Call the remote method named **<method>**, passing it parameters **<params>**. The parameters can be of any shape accepted by the remote method - usually, array (positional arguments) or a key-value object (named arguments).

Returns a Promise which fulfills with the result of the call, or rejects if a remote error or a transport error occurs. In particular, if the transport disconnects during the call, the promise is rejected with a `DisconnectError`.

#### JSONRPC#abortAll(error?)
Abort all outstanding method calls and reject their respective promises with the given optional error, which defaults to a normal JavaScript `Error` containing an explanatory message.

### exports.Commander() => class Commander(RPCClient, options)
Generate a Commander constructor. The generated constructor accepts a single mandatory argument - an instance of `JSONRPC`. Additionally, one can pass an Object (key-value) of options (which are, for now, undocumented - please see the short source).

A Commander object is a helper over the normal JSONRPC client. It provides automatic retries of requests that have failed and are considered to be "retriable" - connection and transport errors (though custom errors could be used that have an `isRetriable` property equal to true).

#### Commander#call(method, params) => Promise
Call a given remote method via JSON-RPC. This behaves identically to `JSONRPC#call`, but provides transparent retries - where a low-level call would be rejected immediately with a transport error, this variant tries several times, and only rejects when the retry strategy gives up. To the caller, it looks as if the promise resolution just takes a longer time than usual in case of network problems (though may still reject if the issues persist).

Note that the back-end system, whatever that may be, must be prepared to handle duplicate method calls (be *idempotent*). Otherwise, retrying any given operation may have unpredictable consequences.

#### Commander#triggerRetries()
Notify the commander that it is a good time to retry all calls that have been waiting for their turn. The Commander itself does not listen to the transport layer directly, so it does not "know" when a lost connection has returned. An external component, such as an `AppClient`, may hold references to both the commander and the transport, and poke the commander whenever the transport has regained connectivity.

### exports.AppClient(SocketConstructor) => class AppClient(socketURL)
Get a constructor for the AppClient class, backed by a particular WebSocket implementation. Underlying sockets are then constructed by calling `new SocketConstructor(socketURL)`. An AppClient constructs its own SocketTransport, JSONRPC and Commander, and manages them so that RPC retries are done when the connection has returned. At the same time, it exposes the constructed objects, so that the raw transport layer may be interacted with directly if any other data besides JSON-RPC 2.0 should travel on it.

**This is the high-level API.**

#### AppClient#call(method, params) => Promise
Behaves just like the Commander's `call` method. The only difference is that retries are potentially done faster upon detecting that a connection is back.

#### AppClient#transport
A reference to the underlying `SocketTransport` instance.

#### AppClient#RPC
A reference to the `JSONRPC` instance used.

#### AppClient#commander
A reference to the `Commander` instance that messages are sent via.

## License
MIT - see the file `LICENSE`.

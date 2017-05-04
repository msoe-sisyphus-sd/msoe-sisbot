var _               = require("underscore");
var fs              = require('fs');
var tls             = require("tls");
var JsonSocket      = require('json-socket');
var uuid        		= require('uuid');

var Ansible = function() {
	return {
		debug :						false,
		sockets : 				{},
		service : 				null,
		_handler :				{},
		_cb_hash : 				{},
		_listeners :			{},
		_address : 				'localhost',
		_port : 					80,
		_is_receiver :		false,
		_cert : 					{
								  			key: '/etc/ssl/private/private-key.pem',
								  			cert: '/etc/ssl/private/public-cert.pem'
											},

		init: function(address,port,is_receiver) {
			this._address = address;
			this._port = port;

			this._is_receiver = is_receiver;
			if (this._is_receiver) {
				this.serve();
			}
		},
		setAddress: function(address) {
			if (this.server_sockets.length > 0) {
				// take down servers, rebuild
			}
			this._address = address;
		},
		setCert: function(cert) {
			if (cert.key != undefined) this._cert.key = cert.key;
			if (cert.cert != undefined) this._cert.cert = cert.cert;
		},
		setHandler: function(service_obj) {
			this._handler = service_obj;

			_.each(this.sockets, function(obj) {
				if (obj.type == "connected") {
					obj.message_handler = service_obj;
				}
			});
		},
		connect: function(service, address, port, cb) {
			var self = this;

			// connect to another ansible service
			var options = {
				rejectUnauthorized:false
			};

			var socket =  tls.connect(port, address, options, function () {
				self.get(service).is_connected = true;
				// console.log(service + " Connected", self.get(service).is_connected);
				cb(null,true);
			});

			// save as JSONSocket
		  var json_socket = new JsonSocket(socket);
		  json_socket.on('error',function(err){
					if (self.get(service).is_connected) {
				    console.log("Ansible Error Socket: ", err);
						self.get(service).is_connected = false;

						// check for _connectionError function in handler
						if (self._handler != null && _.isFunction(self._handler._connectionError)) {
							self._handler._connectionError(service);
						}

						// if (self.get(service).maintain_conn == true) {
						// 	setTimeout(function(){
						// 		self.get(service).reconnect++;
						// 		delete self.get_socket(service);
						// 		self.connect(service, address, port, cb);
						// 	},5000);
						// }
					}
					cb(err,null);
		  });
		  json_socket.on('close',function(){
		    console.log("Ansible Socket Closed:", service);
				var service_obj = self.get(service);
				if (service_obj.is_connected) {
					service_obj.is_connected = false;

					// check for _connectionClosed function in handler
					if (self._handler != null && _.isFunction(self._handler._connectionClosed)) {
						self._handler._connectionClosed(service);
					}
				}

				// retry to connect in 5 seconds
				if (service_obj.maintain_conn == true) {
					setTimeout(function(){
						service_obj.reconnect++;
						delete service_obj.socket;
						self.connect(service, service_obj.address, service_obj.port, cb); // allows for address to be changed by handler
					},5000);
				} else {
					self.disconnect(service);
				}
		  });
			json_socket.on('message',function(message) {
				if (message.method == "response" && message._id != undefined) {
					try {
						self._cb_hash[message._id].cb(message.err, message.data);
						delete self._cb_hash[message.id];
					} catch(err) {
						return console.log("Response error", err);
					}
				} else if (self.get(service).message_handler != null) {
					try {
						if (self.debug) console.log(service+" Message", message);
						self.get(service).message_handler[message.method](message.data, function(err, resp) {
							if (message._id != undefined) {
								var response = { service: service, data: resp, err: err, _id: message._id };
								self.respond(response);
							}
						});
					} catch(err) {
						return console.log("Handler error", err);
					}
				}
				// call any listener method saved
				if (self._listeners[message.method] != undefined) {
					try {
						self._listeners[message.method](message, json_socket);
					} catch(err) {
						return console.log("Message error",err);
					}
				}
			});

			// save to list
			if (this.sockets[service] == undefined) {
				var socket_obj = {
					socket: 					json_socket,
					service: 					service,
					address: 					address,
					port: 						port,
					is_connected: 		false,
					type: 						"client",
					messages: 				[],
					message_handler:	(self._handler) ? self._handler : null, // object to call functions when messages come in
					maintain_conn: 		true,
					reconnect: 				0
				};
				this.sockets[service] = socket_obj;
			} else {
				self.get(service).reconnect = 0;
				self.get(service).socket = json_socket;

				if (self.get(service).messages.length > 0) {
					// send those messages!
				}
			}

			return json_socket;
		},
		serve: function() {
		  var self = this;
			if (self.debug) console.log("Start Ansible Server", this._port, options);
		  var options = {
		    key: fs.readFileSync(this._cert.key),
		    cert: fs.readFileSync(this._cert.cert)
		  };
		  this.server = tls.createServer(options,function(socket) {
				socket.on('error', function(err) {
						console.log("Ansible Server error", err);
				});

				var json_socket = new JsonSocket(socket);

				// add connected to clients list
				var socket_obj = {
					socket: 					json_socket,
					service: 					uuid(), // make unique
					port: 						self.port,
					is_connected: 		true,
					type: 						"connected",
					messages: 				[],
					message_handler:	(self._handler) ? self._handler : null // object to call functions when messages come in
				};
				self.sockets[socket_obj.service] = socket_obj;
				console.log("Client connected", socket_obj.service);

				json_socket.on('close', function() {
					console.log("Client disconnected from server", socket_obj.service);
					if (socket_obj.messages.length > 0) console.log(socket_obj.messages.length+" unsent messages for "+service);

					self.disconnect(socket_obj.service);
				});
				json_socket.on('message', function(message) {
					message.service = socket_obj.service;

					if (self.get(socket_obj.service).message_handler != null) {
						try {
							if (self.debug) console.log(socket_obj.service+" Message", message);
							self.get(socket_obj.service).message_handler[message.method](message.data, function(err, resp) {
								if (message._id != undefined) {
									var response = { service: socket_obj.service, data: resp, err: err, _id: message._id };
									self.respond(response);
								}
							});
						} catch(err) {
							return console.log("Handler error", err);
						}
					}

					if (self._listeners[message.method] != undefined) {
						try {
							self._listeners[message.method](message, json_socket);
						} catch(err) {
							return console.log("Message error",err);
						}
					}
				});
			}).listen(this._port);
		},
		stop_server: function(service) {
			var self = this;
			console.log("Ansible stop server", service);
			// remove all connected sockets?
			var clientList = this.sockets;
			_.each(clientList, function(client) {
				if (client.type == "connected")
				self.disconnect(client);
			});

			delete this.server;

			return true;
		},
		disconnect: function(service) {
			// disconnect, forget socket
			delete this.sockets[service];

			console.log("Ansible disconnect", service, Object.keys(this.sockets).length);

			return true;
		},
		get: function(service) {
			return this.sockets[service];
		},
		get_socket: function(service) {
			return this.sockets[service].socket;
		},
		get_by_socket: function(socket) {
			var returnValue = null;
			_.each(this.sockets, function(obj) {
				if (obj.socket == socket) {
					returnValue = obj;
				}
			});
			return returnValue;
		},
		listen_to: function(method, cb) {
			try {
				this._listeners[method] = cb;
				return this;
			} catch (err) {
				return console.log("Listen to error", err);
			}
		},
		// ----- unused function, will be handled by setting this._handler before any connections come in ----- //
		set_client_handler: function(service, handler) {
			var socket_obj = this.get(service);
			if (socket_obj != undefined) {
				socket_obj.message_handler = handler;
			}
		},
		request: function(obj) {
			// obj { service: "label", data: {}, method: "name", cb: func() }
			if (this.get(obj.service) == undefined) return console.log("Service "+obj.service+" not available", obj);

			var socket = this.get(obj.service).socket;
			if (socket == undefined) return console.log("No "+obj.service+" socket available", null);

			// save cb for response whenever it comes back
			if (obj.cb != undefined && _.isFunction(obj.cb)) {
				if (this.debug) console.log("CB: ", obj.cb);
				var _id = uuid();
				this._cb_hash[_id] = { cb: obj.cb, timestamp: Date.now() };
				obj._id = _id;
			}

			// console.log("Request", obj, this.get(obj.service));
			if (this.get(obj.service).is_connected == true) {
				// console.log("Request", obj);
				socket.sendMessage(obj);
			} else {
				console.log("Message Saved", obj);
				this.get(obj.service).messages.push(obj);
			}
		},
		respond: function(obj) {
			obj.method = "response";
			this.request(obj);
		}
	}
};

module.exports = Ansible;

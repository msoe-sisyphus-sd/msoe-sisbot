var http			= require("http");
var tls				= require("tls");
var fs		  		= require('fs');
var cors			= require("cors");
var express	 		= require('express');
var bodyParser		= require('body-parser');
var iwconfig		= require('wireless-tools/iwconfig');
var _				= require('underscore');
var exec 			= require('child_process').exec;
var io			 	= require("socket.io");
var moment 			= require('moment');

var local_config 	= require('./config.js');
var sisbot_obj		= require('./sisbot.js');

var config = {};

var app = function(given_config,ansible) {
	_.extend(given_config, local_config);

	config = given_config;

	function getserial(){
	   var fs = require('fs');
	   var content = fs.readFileSync('/proc/cpuinfo', 'utf8');
	   var cont_array = content.split("\n");
	   var serial_line = cont_array[cont_array.length-2];
	   var serial = serial_line.split(":");
	   return serial[1].slice(1);
	}
	if (config.pi_serial == undefined) config.pi_serial = getserial();

	/**************************** SERVICES ****************************************/

	var services	= {};
	var sockets			= { /* id: socket */	};

	/**************************** SERVER *******************************************/

	var static			 = new express();

	static.use(cors());
	static.use(bodyParser.json());
	static.use(bodyParser.urlencoded({ limit: '50mb' }));

	static.get('/', function(req, res) {
		logEvent(1, "Get Page:",req.originalUrl);
		iwconfig.status('wlan0', function(err, resp) {
		 	logEvent(1, "Status", resp);
			if (resp.mode == 'master') {
				res.sendFile(config.base_dir+'/index.html');
			} else {
				res.sendFile(config.base_dir+'/success.html');
			}
		});
	});
	static.get('/:service/download_log_file/:filename', function (req, res) {
		var service 		= req.params.service;
		var filename 		= req.params.filename.replace('.log', '');
		var file_loc		= config.folders.logs + filename + '.log';

		// if asking for today's proxy, and a datestamped copy doesn't exist
		if (!fs.existsSync(file_loc)) {
			logEvent(2, 'Download log file unavailable:', file_loc);
		}

		try {
			res.download(file_loc, filename+'.log',function(err) {
				if (err) logEvent(2, 'Download error:', err);
			});
		} catch(err) {
			logEvent(2, 'Download log file error:', err);
		}
	});
	static.get('/*', function(req, res) {
		logEvent(1, "Get:",req.originalUrl);
	 	res.sendFile(config.base_dir+req.originalUrl);
	});
	static.post('/:service/:endpoint', function(req, res) {
		service = req.params.service;
		endpoint = req.params.endpoint;

    var host = req.headers['host'];
    if (config.debug) logEvent(1, "Sisbot POST recieved to service " + service + " endpoint " + endpoint + " host " + host );
    //var hdr = JSON.stringify(req.headers);
    //logEvent(1, "Headers for HOST were " + hdr);

    // var hip = host.split('.');
    // var oct2 = parseInt(hip[1]);
		//
    // if (hip[0] == "10"  || (hip[0] == "192" && hip[1] == "168")  || (hip[0] == "172" && oct2 > 15 && oct2 < 32) ) {
    //   if (config.debug) logEvent(1, "POST host " + host + " is whitelisted");
    // } else {
    //   if (host.match("\.local$") != null) {
    //      if (config.debug) logEvent(1, "POST from bonjour is whitelisted " + host);
    //   } else {
    //     if (config.debug) logEvent(1, "POST host " + host + " is DENIED");
    //     //res.status(401).send({ error: "host " + host + " is not whitelisted" });
    //     //return;
    //   }
    // }

		var data = (_.isString(req.body.data)) ? JSON.parse(req.body.data) : req.body.data;
		data = data.data;

		if (endpoint != "state") {
			// check if data is an array, loop through if so
			if (_.isArray(data)) {
				var truncated_data = [];
				_.each(data, function(obj) {
					truncated_data.push(_.omit(obj, 'verts', 'raw_coors', 'wifi_password', 'password', 'psk')); // add any keys to skip from logging
				});
				logEvent(1, "Post Array:", service, endpoint, truncated_data);
			} else {
				var truncated_data = _.omit(data, 'verts', 'raw_coors', 'wifi_password', 'password', 'psk'); // add any keys to skip from logging
				logEvent(1, "Post:", service, endpoint, truncated_data);
			}
		}

		var cb		= function (err, resp) {
			res.json({ err: err, resp: resp });
			if (!err && endpoint != "state")	{
		    logEvent(0, "Endpoint Socket Update:"+endpoint+"()", JSON.stringify(resp).length);
				socket_update(resp);
			}
		};
		try {
			services[service][endpoint](data,cb);
		} catch (err) {
			logEvent(2, "Error:", service, endpoint, err);
		}
	});

	var server = http.createServer(static).listen(config.services.sisbot.port);

	/**************************** HELPER FUNCTIONS ***************************************/
	function socket_update(data) {
		if (data != null) {
			//logEvent(1, "socket_update()  data=", data);
			if (data == "close") {
				// logEvent(0, "Close connected sockets", sockets.length);
				// _.each(sockets, function(socket, id) {
				// 	socket.disconnect(true);
				// });
				// logEvent(0, "Close socket_server");
				socket_server.close(function() {
					logEvent(1, "Socket Server closed");
				});
			} else {
				// TODO: How much data is sent?
				logEvent(0, "Socket Update:", JSON.stringify(data).length);
	      // if (process.env.NODE_ENV.indexOf('_dev') >= 0) {
				// 	var socket_keys = _.keys(sockets);
					// if (socket_keys.length > 0) logEvent(0, "Socket Update ("+socket_keys.length+"):", JSON.stringify(data).length);
				// }

				_.each(sockets, function(socket, id) {
					if (data == "disconnect") {
						socket.disconnect(true);
					} else {
						if (socket.connected) socket.emit('set', data);
					}
				});
			}
		}
	}

	function logEvent() {
		// save to the log file for sisbot
		if (local_config.folders.logs) {
			var filename = local_config.folders.logs + moment().format('YYYYMMDD') + '_sisbot.log';

			var line = moment().format('YYYYMMDD HH:mm:ss Z');
			_.each(arguments, function(obj, index) {
				if (_.isObject(obj)) line += "\t"+JSON.stringify(obj);
				else line += "\t"+obj;
			});

			fs.appendFile(filename, line + '\n', function(err, resp) {
			  if (err) console.log("Log err", err);
			});

			if (process.env.NODE_ENV != undefined) {
	      if (process.env.NODE_ENV.indexOf('_dev') >= 0) {
	        if (arguments[0] == 0 || arguments[0] == '0') line = '\x1b[32m'+line+'\x1b[0m'; // Green
	        if (arguments[0] == 2 || arguments[0] == '2') line = '\x1b[31m'+line+'\x1b[0m'; // Red
	    		console.log(line);
	      }
	    }
		} else console.log(arguments);
	}

	/**************************** SISBOT SERVICE ****************************************/

	services.sisbot	= sisbot_obj.init(config, ansible, socket_update);

	/**************************** SOCKET.IO ***************************************/

	var socket_server   = io.listen(server, { pingTimeout: local_config.pingTimeout, pingInterval: local_config.pingInterval });

	socket_server.origins('*:*');

	socket_server.on('connection', function(socket) {
		if (!sockets[socket.id]) {
			// logEvent(1, "Socket connect: "+socket.id);
			sockets[socket.id] = socket;

			try {
				services['sisbot'].state({}, function(err, resp) {
					if (err) return;
					logEvent(0, "Socket Connect Set:", JSON.stringify(resp).length);
					socket.emit('set', resp);
				});
			} catch(err) {
				logEvent(2, 'Socket emit state error', err);
			}
		}

		socket.on('disconnect', function(data) {
			logEvent(1, "Socket disconnect: ", data);
			if (data && data.id) delete sockets[data.id];
		});
	});

	logEvent(1, "Sisbot Server created", config.version);
}

module.exports = app;

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

		res.download(file_loc);
	});
	static.get('/*', function(req, res) {
		logEvent(1, "Get:",req.originalUrl);
	 	res.sendFile(config.base_dir+req.originalUrl);
	});
	static.post('/:service/:endpoint', function(req, res) {
		service = req.params.service;
		endpoint = req.params.endpoint;

		var data = (_.isString(req.body.data)) ? JSON.parse(req.body.data) : req.body.data;
		data = data.data;

		// TODO: remove add_track as well, or at least don't log the verts
		if (endpoint != "state") {
			var truncated_data = _.omit(data, 'verts', 'wifi_password', 'password'); // add any keys to skip from logging
			logEvent(1, "Post:",service, endpoint,truncated_data);
		}

		var cb		= function (err, resp) {
			res.json({ err: err, resp: resp });
			if (!err)	socket_update(resp);
		};
		try {
			services[service][endpoint](data,cb);
		} catch (err) {
			logEvent(2, "Error:", service, endpoint, err);
		}
	});

	var server = http.createServer(static).listen(config.services.sisbot.port);

	/**************************** SOCKET.IO ***************************************/

	var sockets			= { /* id: socket */	};
	var socket_server   = io.listen(server, { pingTimeout: local_config.pingTimeout, pingInterval: local_config.pingInterval });

	socket_server.origins('*:*');

	socket_server.on('connection', function(socket) {
		if (!sockets[socket.id]) {
			// logEvent(1, "Socket connect: "+socket.id);
			sockets[socket.id] = socket;

			services['sisbot'].get_collection({}, function(err, resp) {
				if (err) return;
				socket.emit('set', resp);
			});
		}

		socket.on('disconnect', function(data) {
			// logEvent(1, "Socket disconnect: ", data);
			delete sockets[data.id];
		});
	});

	function socket_update(data) {
		if (data != null) {
			_.each(sockets, function(socket, id) {
				if (data == "disconnect") {
					socket.disconnect(true);
				} else {
					socket.emit('set', data);
				}
			});
		}
	}

	/**************************** SISBOT SERVICE ****************************************/

	function logEvent() {
		// save to the log file for sisbot
		if (local_config.folders.logs) {
			var filename = local_config.folders.logs + moment().format('YYYYMMDD') + '_sisbot.log';

			var line = Date.now();
			_.each(arguments, function(obj, index) {
				if (_.isObject(obj)) line += "\t"+JSON.stringify(obj);
				else line += "\t"+obj;
			});

			// console.log(line);
			fs.appendFile(filename, line + '\n', function(err, resp) {
			  if (err) console.log("Log err", err);
			});
		} else console.log(arguments);
	}

	services.sisbot	= sisbot_obj.init(config, ansible, socket_update);

	logEvent(1, "Sisbot Server created");
}

module.exports = app;

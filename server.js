var http			= require("http");
var tls				= require("tls");
var fs		  	= require('fs');
var cors			= require("cors");
var express	 	= require('express');
var bodyParser		= require('body-parser');
var iwconfig		= require('wireless-tools/iwconfig');
var _				= require('underscore');
var exec 			= require('child_process').exec;
var io			  = require("socket.io");

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
	services.sisbot	= sisbot_obj.init(config, ansible);

	/**************************** SERVER *******************************************/

	var static			 = new express();

	static.use(cors());
	static.use(bodyParser.json());
	static.use(bodyParser.urlencoded({ limit: '50mb' }));

	static.get('/', function(req, res) {
		console.log("Get Page:",req.originalUrl);
		iwconfig.status('wlan0', function(err, resp) {
		  console.log("Status", resp);
			if (resp.mode == 'master') {
				res.sendFile(config.base_dir+'/index.html');
			} else {
				res.sendFile(config.base_dir+'/success.html');
			}
		});
	});
	static.get('/*', function(req, res) {
		console.log("Get:",req.originalUrl);
	  res.sendFile(config.base_dir+req.originalUrl);
	});
	static.post('/:service/:endpoint', function(req, res) {
		service = req.params.service;
		endpoint = req.params.endpoint;

		var data = (_.isString(req.body.data)) ? JSON.parse(req.body.data) : req.body.data;
		data = data.data;

		if (endpoint != "state") console.log("Post:",service, endpoint, data);

		var cb		= function (err, resp) {
			res.json({ err: err, resp: resp });
			if (!err)	socket_update(resp);
		};
		try {
			services[service][endpoint](data,cb);
		} catch (err) {
			console.log("Error:", service, endpoint, err);
		}
	});

	var server = http.createServer(static).listen(config.servers.sisbot.port);

	/**************************** SOCKET.IO ***************************************/

	var sockets			= { /* id: socket */	};
	var socket_server	= io.listen(server);

	socket_server.origins('*:*');

	socket_server.on('connection', function(socket) {
		if (!sockets[socket.id])	sockets[socket.id] = socket;

		socket.on('disconnect', function(data) {
			delete sockets[data.id];
		});
	});

	function socket_update(data) {
		_.each(sockets, function(socket, id) {
			socket.emit('set', data);
		});
	}

	console.log("Sisbot Server created");
}

module.exports = app;

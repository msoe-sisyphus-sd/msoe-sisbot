var http					= require("http");
var tls						= require("tls");
var fs          	= require('fs');
var cors					= require("cors");
var express     	= require('express');
var bodyParser		= require('body-parser');
var iwconfig			= require('wireless-tools/iwconfig');
// var iwlist			= require('wireless-tools/iwlist');
var _							= require('underscore');
var exec 					= require('child_process').exec;
// var httpProxy   = require('http-proxy');

var config 				= require('./config.js');
var ansible 		= require('./ansible.js');
// var api 					= require('./api/server.js')(config, null);

/**************************** PROXY *******************************************/

// var proxy       = httpProxy.createServer();

/**************************** SERVICES ****************************************/

// var used_ports = [];
var services = {};
console.log("Services:", config.services);
_.each(config.services, function (service, key) {
  if (service.address !== 'localhost') return this;

	console.log("Create Service", key, service);
  var service_obj = require(service.dir + '/'+key+'.js');
	var local_config = require(service.dir + '/config.js');
	local_config = _.extend(config, local_config);

	services[key] = service_obj.init(local_config,ansible());
});

/**************************** SERVER *******************************************/

var static             = new express();

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

	console.log("Post:",service, endpoint, data);

	var cb		= function (err, resp) {
		res.json({ err: err, resp: resp });
	};
	services[service][endpoint](data,cb);
});

http.createServer(static).listen(80);

console.log("Server created");

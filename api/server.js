var http        		= require("http");
var express     		= require('express');
var bodyParser			= require('body-parser');
var cors            = require('cors');
var _          			= require('underscore');

var local_config		= require('./config.js');

var api_service     = require('./api.js');
var harness					= require('./harness.js');

/*** SETUP Ansible/API ***/
var api = function(config,ansible) {
	_.extend(config, local_config);

	api_service.init(config, ansible);

	/*** SETUP EXPRESS & SOCKET.IO SERVER FOR API ****/
	var exp         = express();

	exp
	.use(cors())
	.use(bodyParser.json({limit: '50mb' }))
	.use(bodyParser.urlencoded({limit: '50mb', extended: true }))
	.post('/array', function (req, res) {
		var api_data	= (_.isString(req.body.data)) ? JSON.parse(req.body.data) : req.body.data;
		api_data		= api_data.data;
		var num_cbs		= api_data.length;

		function each_req(ind_req) {
			var endpoint = ind_req.data.endpoint;
			harness.q(ind_req.data, function(err, resp) {
				ind_req._err		= err;
				ind_req._resp		= resp;
				ind_req._endpoint	= endpoint;
				ind_req._id			= ind_req.data.id;
				check_for_finish();
			});
		}

		_.each(api_data, each_req);

		function check_for_finish() {
			--num_cbs;
			if (num_cbs == 0) {
				//session_manager.after_api_request(req.body.user, api_action, err, resp);
				res.json({ err: null, resp: api_data });
			}
		}
	})
	.post('/*', function(req, res) {
		var api_data = (_.isString(req.body.data)) ? JSON.parse(req.body.data) : req.body.data;

		var api_action = req.originalUrl.replace('/','');

	  var cb		= function (err, resp) {
			res.json({ err: err, resp: resp });
		};

	  if (!api_action) return cb('No API endpoint specified', null);

	  try {
	    api_service[api_action](api_data, cb);
	  } catch(err) {
			console.log("API Err", api_action, err);
	    return cb('Invalid API endpoint:' + api_action, err);
	  }
	});

	var server          = exp.listen(config.services.api.port);

	console.log('Setup the API server');
}

module.exports = api;

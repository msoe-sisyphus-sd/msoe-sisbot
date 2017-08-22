var fs			= require('fs');
var _           = require('underscore');
var uuid		= require('uuid');
var which_cson  = 'default.cson';
var default_status = require('./default_status.js');

if (process.env.NODE_ENV.indexOf('dev') == -1) {
    var which_cson  = require('/home/pi/sisbot-server/sisbot/configs/whichcson.js');

    // PROVE CSON FILE EXISTS
    if (!fs.existsSync('/home/pi/sisbot-server/sisbot/configs/' + which_cson)) {
            console.log('!!!!! MISSING CSON FILE !!!!!');
            which_cson = 'default.cson';
    }
}

var config = {
		base: {
			version	: '1.0.1',
			debug   : false,
			default_domain: 'sisyphus.local',
			cert: function() {
				return {
					key: this.default_domain+"/privkey.pem",
					cert: this.default_domain+"/fullchain.pem"
				}
			},
			folders: {
				sisbot: 'sisbot',
				content: 'content',
				config: 'configs',
				tracks: 'tracks', // models
				cloud: 'siscloud',
				api: 'sisapi'
			},
			receiver : true, // receive messages from cloud
			sisbot_config : which_cson,
			sisbot_state : 'status.json',
			serial_path: '/dev/ttyACM0',
			autoplay: true,
			skip_incompatible: true,
			min_speed: 0.5,
			max_speed: 1.75,
			auto_th: 1.570796,
			failed_home_rho: 0.2,
			failed_home_th: 1.570796,
			max_rand_retries: 10,
			check_internet_interval: 1800000, //3600000, // once every hour, confirm an internet connection
			internet_retries: 5, // retry # of times before resetting to hotspot
			retry_internet_interval: 3000, // three seconds later
			default_data: default_status,
		},
		stopped: { // set NODE_ENV=sisbot_stopped to make it start without autoplaying
			autoplay: false,
		},
		testing: {
			testing: true,
		},
		dummy: {
			serial_path: "false",
		},
		debug: {
			debug: true
		}
};

var config_obj = config.base;
if (process.env.NODE_ENV != undefined) {
	var envs = process.env.NODE_ENV.split('_');
	_.each(envs, function(env) {
		if (config[env] != undefined) _.extend(config_obj, config[env]);
	});
}

// run functions to eliminate them
var keys = Object.keys(config_obj);
_.each(keys, function(key) {
	if (_.isFunction(config_obj[key])) {
		config_obj[key] = config_obj[key]();
	}
});

module.exports = config_obj;

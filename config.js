var _           = require('underscore');

var config = {
		base: {
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
			sisbot_config : 'default.cson',
			sisbot_state : 'status.json',
			serial_path: '/dev/ttyACM0',
			autoplay: true,
			skip_incompatible: true,
			max_rand_retries: 10,
			check_internet_interval: 3600000 // once every hour, confirm an internet connection
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

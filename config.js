var fs				= require('fs');
var _         = require('underscore');
var uuid			= require('uuid');
var default_status  = require('./default_status.js');
var which_cson;

if (process.env.NODE_ENV.indexOf('dummy') == -1) {
  which_cson = require('/home/pi/sisbot-server/sisbot/configs/whichcson.js');

  // PROVE CSON FILE EXISTS
  if (!fs.existsSync('/home/pi/sisbot-server/sisbot/configs/' + which_cson)) {
      console.log('!!!!! MISSING CSON FILE !!!!!');
      which_cson = 'default.cson';
  }
}

var config = {
		base: {
			version	: '1.9.51', // Software Update Status
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
				api: 'sisapi',
        leds: 'sisbot/content/lights',
  	  	logs: '/var/log/sisyphus/'
			},
			api_endpoint : 'https://webcenter.sisyphus-industries.com',
      api_thumb_url: '/uploads/track/thr/', // +track_id+'/thumb_'+xxx+'.png'
			receiver : true, // receive messages from cloud
			sisbot_config : which_cson,
			sisbot_state : 'status.json',
			serial_path: '/dev/ttyACM0',
			arduino_serial_path: '/dev/ttyACM1',
			autoplay: true,
			skip_incompatible: true,
			min_speed: 0.15,
			max_speed: 1.75,
			auto_th: 1.570796,
			failed_home_rho: 0.2,
			failed_home_th: 1.570796,
			auto_home_rho: 0.0185, //.25" for r=13.5"
 			auto_home_th: 0.106, //.5" for 6" diam falcon
      auto_track_start_rho: true, // move to track start rho if non-continuous
			max_rand_retries: 10,
			check_internet_interval: 60000, // every minute.
			// check_internet_interval Changed because dropped LAN or changed wifi will not be detected by a bot for this long (used to be 30 minutes)
			// unless the bot has a web or phone client connected to it before the LAN drops
			network_retries: 5, // retry # of times before resetting to hotspot
			retry_network_interval: 3000, // three seconds later
			wifi_error_retry_interval: 60000, // one minute
      wifi_first_retry_interval: 5000, // five seconds
      ntp_wait: 5000, // five seconds
      sleep_init_wait: 10000, // ten seconds
			default_data: default_status,
			pingTimeout: 7000, // socket pingTimeout
			pingInterval: 1000, // socket pingInterval
			max_thumbnail_points: 10000,
      log_days_to_keep: 7, // number of days to keep dated log files
      log_max_size: 5000000 // maximum filesize before automatically deleting (5MB)
		},
		matt: {
			folders: {
			  cloud: 'sisyphus_cloud',
			  api: 'api',
			  sisbot: 'sisbot',
			  proxy: 'proxy',
			  app: 'cloud',
			  content: 'content',
			  config: 'configs',
			  tracks: 'tracks', // models
			  logs: '/Users/mattfox12/Documents/Sodo/Ease/Sisyphus/logs'
			},
			base_dir: '/Users/mattfox12/Documents/Sodo/Ease/Sisyphus',
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

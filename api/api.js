var iwconfig			= require('wireless-tools/iwconfig');
var iwlist			= require('wireless-tools/iwlist');
var _						= require('underscore');
var exec 					= require('child_process').exec;

var api = {
  config: {},
  ansible: null,
  stations: {},

  init: function(config, session_manager) {
      var self = this;
      console.log("Init API");
      this.config = config;
			if (session_manager != null) {
	      this.ansible = session_manager;
	      if (config.cert) {
	          this.ansible.setCert({
	              key : config.base_certs + config.cert.key,
	              cert: config.base_certs + config.cert.cert
	          });
	      }
	      this.ansible.setHandler(this);
	      this.ansible.init(config.services.api.address, config.services.api.ansible_port, true);
	      _.each(config.services.api.connect, function(obj) {
	          console.log('obj', obj);
	          self.ansible.connect(obj, config.services[obj].address, config.services[obj].ansible_port, function(err, resp) {
	              if (resp == true) console.log("API Connected to " + obj);
	              else console.log(obj + " API Connect Error", err);
	          });
	      });
			}

			return this;
  },
	wifi: function(data, cb) {
		iwlist.scan(req.body, cb);
	},
	change_to_wifi: function(data, cb) {
		if (req.body.ssid && req.body.psk && req.body.ssid != 'false' && req.body.psk != "") {
			exec('sudo /home/pi/sisbot-server/ease/stop_hotspot.sh '+req.body.ssid+' '+req.body.psk);
			cb(null, req.body.ssid);
		}
		cb('ssid or psk error', null);
	},
	reset_to_hotspot: function(data, cb) {
		exec('sudo /home/pi/sisbot-server/ease/start_hotspot.sh');
		cb(null, 'reset to hotspot');
	},
	play: function(data, cb) {
		// tell sisbot to play
		sisbot('play',data, function(err, resp) {
			console.log("Play Resp", resp);
			cb(null, 'play');
		});
	},
	pause: function(data, cb) {
		// tell sisbot to play
		sisbot('pause',data, function(err, resp) {
			console.log("Pause Resp", resp);
			cb(null, 'pause');
		});
	},
	home: function(data, cb) {
		// tell sisbot to play
		sisbot('home',data, function(err, resp) {
			console.log("Home", resp);
			cb(null, 'home');
		});
	},
	setPlaylist: function(data, cb) {
		// tell sisbot to play
		sisbot('setPlaylist',data, function(err, resp) {
			console.log("Set Playlist", resp);
			cb(null, 'playlist');
		});
	},
	playNextTrack: function(data, cb) {
		// tell sisbot to play
		sisbot('playNextTrack',data, function(err, resp) {
			console.log("Play next track", resp);
			cb(null, 'next');
		});
	},
  jogThetaLeft: function(data,cb) {
		// tell sisbot to play
		sisbot('home',data, function(err, resp) {
			console.log("Home", resp);
			cb(null, 'home');
		});
	},
  jogThetaRight: function(data,cb) {
		// tell sisbot to play
		sisbot('jogThetaRight',data, function(err, resp) {
			console.log("jogThetaRight", resp);
			cb(null, 'jogThetaRight');
		});
	},
  jogRhoOutward: function(data,cb) {
		// tell sisbot to play
		sisbot('jogRhoOutward',data, function(err, resp) {
			console.log("jogRhoOutward", resp);
			cb(null, 'jogRhoOutward');
		});
	},
  jogRhoInward: function(data,cb) {
		// tell sisbot to play
		sisbot('jogRhoInward',data, function(err, resp) {
			console.log("jogRhoInward", resp);
			cb(null, 'jogRhoInward');
		});
	},
  get_state: function(data, cb) {
		// tell sisbot to play
		sisbot('get_state',data, function(err, resp) {
			console.log("get_state", resp);
			cb(null, resp);
		});
  },
  get_speed: function(data, cb) {
		// tell sisbot to play
		sisbot('get_speed',data, function(err, resp) {
			console.log("Speed", resp);
			cb(null, resp);
		});
  },
  set_speed: function(data, cb) {
		// tell sisbot to play
		sisbot('set_speed',data, function(err, resp) {
			console.log("set_speed", resp);
			cb(null, resp);
		});
  },
	brightness: function(data, cb) {
		// tell sisbot to play
		sisbot('brightness',data, function(err, resp) {
			console.log("Brightness", resp);
			cb(null, resp);
		});
	}
};

var sisbot = function(method, data, cb) {
    var obj = {service: "sisbot", method: method, data: data};
    if (cb != undefined && cb != null) obj.cb = cb;
    api.ansible.request(obj);
}

module.exports = api;

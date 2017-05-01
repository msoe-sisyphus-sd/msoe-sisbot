var _						= require('underscore');
var exec 				= require('child_process').exec;
var CSON				= require('cson');
var fs 					= require('fs');
var iwconfig			= require('wireless-tools/iwconfig');
var iwlist			= require('wireless-tools/iwlist');
var exec 					= require('child_process').exec;

var SerialPort	= require('serialport').SerialPort;

var plotter 		= require('./plotter');
var playlist 		= require('./playlist');

var sisbot = {
  config: {},
  ansible: null,
	serial: null,
	plotter: plotter,

	_homed: true,
  _brightness: 0.8,
	playlist: playlist,
	_playing: true,

  init: function(config, session_manager) {
      var self = this;
      console.log("Init Sisbot");
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
	      this.ansible.init(config.services.sisbot.address, config.services.sisbot.ansible_port, true);
	      _.each(config.services.sisbot.connect, function(obj) {
	          console.log('obj', obj);
	          self.ansible.connect(obj, config.services[obj].address, config.services[obj].ansible_port, function(err, resp) {
	              if (resp == true) console.log("Sisbot Connected to " + obj);
	              else console.log(obj + " Sisbot Connect Error", err);
	          });
	      });
			}

			// plotter
	    this.plotter.setConfig(CSON.load(config.base_dir+'/'+config.folders.config+'/'+config.sisbot_config));
			plotter.onFinishTrack(function() {
				console.log("Track Finished");
				self.playNextTrack(null, null);
			});
	    plotter.onStateChanged(function(newState, oldState) {
				console.log("State changed to", newState, oldState);
				if (oldState == 'homing') self._homed = true;
				if (newState == 'waiting') {
					if (self._playing) self.playNextTrack(null, null);
				}
			});

			// connect
			this._connect();

			return this;
  },
	_connect() {
    if (this.serial && this.serial.isOpen()) return true;

		var self = this;
		console.log("Serial Connect", this.config.serial_path);
 		this.serial = new SerialPort(this.config.serial_path, {}, false);

		try {
      this.serial.open(function (error) {
      	self.plotter.useSerial(self.serial);

				console.info('connect: connected!');

				if (self.config.autoplay) {
					//this.playPlaylist('default', {shuffle: true,repeat: true});
					self.set_brightness({value:self._brightness}, null);

					// playlist
					self.setPlaylist({name: 'default', repeat:true, track_ids:['sine', 'circam2s', 'cwarp3b', 'dces4p', 'hep', 'india1p', 'para2b', 'tensig1$']}, null);
				}
			});
    } catch(err) {
      console.error('Connect err', err);
    }
	},
  // Execute a serial command, and log it to the console.
  _serialWrite(command) {
    console.log('SERIAL:',command);
    this.serial.write(command+'\r');
  },
  _validateConnection() {
    if (!this.serial || !this.serial.isOpen()) {
      console.error('No serial connection')
      return false;
    }
    return true;
  },
	play: function(data, cb) {
		console.log("Sisbot Play", data);
		if (this._validateConnection()) {
			this._playing = true;
			plotter.resume();
			if (cb)	cb(null, 'play');
		} else cb('No Connection', null);
	},
	pause: function(data, cb) {
		console.log("Sisbot Pause", data);
		if (this._validateConnection()) {
			this._playing = false;
			plotter.pause();
			if (cb)	cb(null, 'pause');
		} else cb('No Connection', null);
	},
	home: function(data, cb) {
		console.log("Sisbot Home", data);
		if (this._validateConnection()) {
			this._playing = false;
			plotter.home();
			if (cb)	cb(null, 'homing');
		} else cb('No Connection', null);
	},
	setPlaylist: function(data, cb) {
		console.log("Sisbot Set Playlist", data);

		// load playlist
		this.playlist.init(data);
		this._playing = true;

		// !! debug exit //
		if (cb) cb(null, 'setPlaylist');
		return;

		this.playNextTrack({}, null);

		if (cb)	cb(null, 'setPlaylist');
	},
	playTrack: function(data, cb) {
		console.log("Sisbot Play Track", data);
		if (this._validateConnection()) {
			this._playing = true;
	    if (this._homed) {
				var track_name = data.name;

				// load track
				if (track_name != null) {
					var track = JSON.parse(fs.readFileSync(this.config.base_dir+'/'+this.config.folders.content+'/'+this.config.folders.tracks+'/'+track_name+'.json', 'utf8'));

					this.plotter.playTrack(track);

					if (cb)	cb(null, 'next track '+track_name);
				} else {
					if (cb)	cb('no next track available', null);
				}
			} else {
				this.home(null, cb);
			}
		} else cb('No Connection', null);
	},
	playNextTrack: function(data, cb) {
		console.log("Sisbot Play Next Track", data);
		if (this._validateConnection()) {
			this._playing = true;
	    if (this._homed) {
				var track_name = this.playlist.getNextTrack();

				// load track
				if (track_name != null) {
					var track = JSON.parse(fs.readFileSync(this.config.base_dir+'/'+this.config.folders.content+'/'+this.config.folders.tracks+'/'+track_name+'.json', 'utf8'));

					this.plotter.playTrack(track);

					if (cb)	cb(null, 'next track '+track_name);
				} else {
					if (cb)	cb('no next track available', null);
				}
			} else {
				this.home(null, cb);
			}
		} else cb('No Connection', null);
	},
  jogThetaLeft: function(data,cb) {
		if (this._validateConnection()) {
			this._playing = false;
			plotter.jogThetaLeft();
			if (cb)	cb(null, 'left');
		} else cb('No Connection', null);
	},
  jogThetaRight: function(data,cb) {
		if (this._validateConnection()) {
			this._playing = false;
			plotter.jogThetaRight();
			if (cb)	cb(null, 'right');
		} else cb('No Connection', null);
	},
  jogRhoOutward: function(data,cb) {
		if (this._validateConnection()) {
			this._playing = false;
			plotter.jogRhoOutward();
			if (cb)	cb(null, 'out');
		} else cb('No Connection', null);
	},
  jogRhoInward: function(data,cb) {
		if (this._validateConnection()) {
			this._playing = false;
			plotter.jogRhoInward();
			if (cb)	cb(null, 'in');
		} else cb('No Connection', null);
	},
  get_state: function(data, cb) {
		var state = plotter.getState();
		var return_obj = {
			is_playing: false,
			is_homing: false,
			is_shuffle: false,
			is_loop: false,
			brightness: this._brightness,
			speed: this._speed,
			active_playlist: 'false',
			active_track: 'false',
			current_time: 0 // seconds
		};
    cb(null, return_obj);
  },
  set_speed: function(data, cb) {
		console.log("Set Speed", data.value);
		// 0.0-1.0f
    plotter.setSpeed(data.value);
    if (cb)	cb(null, plotter.getSpeed());
  },
	set_brightness: function(data, cb) {
		console.log('set brightness', data);

    // Don't continue if we're disconnected from the sisbot
    if (!this._validateConnection()) {
			cb('No Connection', null);
			return;
		}

		var value = data.value;
		if (value < 0) value = 0;
		if (value > 1) value = 1;

		this._brightness = value;
    // convert to an integer from 0 - 1023, parabolic scale.
    var pwm = Math.pow(2, value * 10) - 1;
    pwm = Math.floor(pwm);

    if (pwm == 0) {
      this._serialWrite('SE,0');
    } else {
      this._serialWrite('SE,1,'+pwm);
    }

		if (cb)	cb(null, value);
	},
	// work out with travis
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
	install_updates: function(data, cb) {
		cb(null, 'installing updates');
	},
	download_playlist: function(data, cb) {
		// save playlist
		// download listed tracks
	},
	download_track: function(data, cb) {
		cb(null, 'installing updates');
	},
	restart: function(data,cb) {
		cb(null, 'restarting sisyphus');
	}
};

module.exports = sisbot;

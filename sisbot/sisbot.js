var _						= require('underscore');
var exec 				= require('child_process').exec;
var CSON				= require('cson');
var fs 					= require('fs');
var iwconfig		= require('wireless-tools/iwconfig');
var iwlist			= require('wireless-tools/iwlist');
var exec 				= require('child_process').exec;

var SerialPort	= require('serialport').SerialPort;

var plotter 		= require('./plotter');
var playlist 		= require('./playlist');

var sisbot = {
  config: {},
  ansible: null,
	serial: null,
	plotter: plotter,

	playlist: playlist,
	tracks: { // change to autoload, or passed in by app
		circam2s:'r01',
		cwarp3b:'r01',
		dces4p:'r11',
		erase:'r01',
		hep:'r01',
		india1p:'r11',
		line:'r01',
		para2b:'r01',
		sine:'r00',
		tensig1:'r01',
		testpath1:'r01',
		testr:'r00',
		testth:'r00'
	},

	_autoplay: false,
	_homed: false,
  _brightness: 0.8,
	_playing: true,

	_is_hotspot: false,
	_is_internet_connected: false,
	_internet_check: 0,

  init: function(config, session_manager) {
      var self = this;
      console.log("Init Sisbot");

      this.config = config;
			if (this.config.autoplay) this._autoplay = this.config.autoplay;

			if (session_manager != null) {
	      this.ansible = session_manager;
	      if (config.cert) {
					this.ansible.setCert({
						key : config.base_certs + config.cert.key,
						cert: config.base_certs + config.cert.cert
					});
	      }
	      this.ansible.setHandler(this);
	      this.ansible.init(config.services.sisbot.address, config.services.sisbot.ansible_port, config.receiver);
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
				if (oldState == 'homing') {
					self._homed = true;
					self.playlist._rlast = 0; // reset

					if (newState == 'waiting' && self._autoplay) {
						self.playNextTrack(null, null); // autoplay after first home
						self._autoplay = false;
					}
				}
			});

			// connect
			this._connect();

			// wifi connect
			if (!this._is_hotspot) this._query_internet(5000); // check for internet connection after 5 seconds

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

				self.set_brightness({value:self._brightness}, null);

				if (self.config.autoplay) {
					//this.playPlaylist('default', {shuffle: true,repeat: true});

					// playlist
					self.setPlaylist({
							name: 'default',
							repeat:true,
							randomized:true,
							track_ids:['testpath1', 'testpath1', 'line', 'sine', 'circam2s', 'india1p', 'cwarp3b', 'dces4p', 'hep', 'india1p', 'para2b', 'tensig1'],
							tracks:self.tracks
					}, null);
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
		this.playlist.init(this.config, data);
		this._homed = false;

		this.playlist.set_random(data.randomized);
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
					this._playing = true;

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
				var track = this.playlist.getNextTrack();

				// load track
				if (track != null) {
					console.log("Sisbot play next track", track.name, track.verts[0], track.verts[track.verts.length-1]);
					this.plotter.playTrack(track);
					this._playing = true;
					this.playlist._rlast = track.lastR;

					if (cb)	cb(null, 'next track '+track.name);
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
	_validate_internet: function(data, cb) {
		exec('ping -c 1 -W 2 google.com', (error, stdout, stderr) => {
		  if (error) {
		    console.error('exec error:',error);
		    return;
		  }

			var returnValue = false;
			if (stdout.indexOf("1 packets transmitted") > -1) returnValue = true;
		  // console.log('stdout:', stdout);
		  // console.log('stderr:', stderr);

			if (cb) cb(null, true);
		});
	},
	_query_internet: function(time_to_check) {
		if (!this._is_hotspot) { // only bother if you are not a hotspot
			var self = this;
			_internet_check = setTimeout(function() {
				self._validate_internet(null, function(err, resp) {
					if (err) return console.log("Internet check err", err);
					if (resp) {
						self._is_hotspot = false;
						self._is_internet_connected = true;

						console.log("Internet connected.");

						// check again later
						self._query_internet(60*60*1000); // check again in an hour
					} else {
						console.log("Internet not connected, reverting to hotspot.");

						self._is_internet_connected = false;
						if (!self._is_hotspot) self.reset_to_hotspot();
					}
				})
			}, time_to_check);
		}
	},
	wifi: function(data, cb) {
		iwlist.scan(req.body, cb);
	},
	change_to_wifi: function(data, cb) {
		if (req.body.ssid && req.body.psk && req.body.ssid != 'false' && req.body.psk != "") {
			clearTimeout(this._internet_check);
			// regex, remove or error on double quotes
			exec('sudo /home/pi/sisbot-server/ease/stop_hotspot.sh "'+req.body.ssid+'" "'+req.body.psk+'"');
			this._is_hotspot = false;
			this._query_internet(15000); // check again in 15 seconds
			cb(null, req.body.ssid);
		}
		cb('ssid or psk error', null);
	},
	reset_to_hotspot: function(data, cb) {
		clearTimeout(this._internet_check);
		exec('sudo /home/pi/sisbot-server/ease/start_hotspot.sh');

		this._is_hotspot = true;
		this._is_internet_connected = false;
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

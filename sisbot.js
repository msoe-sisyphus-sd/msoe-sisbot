var _						= require('underscore');
var exec 				= require('child_process').exec;
var CSON				= require('cson');
var fs 					= require('fs');
var iwconfig		= require('wireless-tools/iwconfig');
var iwlist			= require('wireless-tools/iwlist');
var exec 				= require('child_process').exec;
var uuid				= require('uuid');

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
		'2CBDAE96-EC22-48B4-A369-BFC624463C5F': 'r01',
		'C3D8BC17-E2E1-4D6D-A91F-80FBB65620B8': 'r01',
		'2B34822B-0A27-4398-AE19-23A3C83F1220': 'r00',
		'93A90B6B-EAEE-48A3-9742-C688235D837D': 'r01',
		'B7407A2F-04C3-4C92-B907-4C3869DA86D6': 'r01',
		'7C046710-9F19-4423-B291-7394996F0913': 'r11',
		'D14E0B41-E572-4B69-9827-4A07C503D031': 'r01',
		'26FBFB10-4BC7-46BF-8D55-85AA52C19ADF': 'r11',
		'75518177-0D28-4B2A-9B73-29E4974FB702': 'r01'
	},

	id: uuid(),
	type: 'sisbot',
	pi_id: '',
	name: 'Sisyphus',
  brightness: 0.8,
	speed: 0.5,

	_firstplay: false,
	_autoplay: true,
	_homed: false,
	_homing: false,
	_playing: false,

	_is_hotspot: false,
	_is_internet_connected: false,
	_internet_check: 0,

  init: function(config, session_manager) {
      var self = this;
      console.log("Init Sisbot");

      this.config = config;
			if (this.config.autoplay) this._autoplay = this.config.autoplay;
			this.pi_id = 'pi_'+this.config.pi_serial;

			if (session_manager != null) {
	      this.ansible = session_manager;
	      if (config.cert) {
					this.ansible.setCert({
						key : config.base_certs + "/" + config.cert.key,
						cert: config.base_certs + "/" + config.cert.cert
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
	    this.plotter.setConfig(CSON.load(config.base_dir+'/'+config.folders.sisbot+'/'+config.folders.config+'/'+config.sisbot_config));
			plotter.onFinishTrack(function() {
				console.log("Track Finished");
				self.playNextTrack(null, null);
			});
	    plotter.onStateChanged(function(newState, oldState) {
				console.log("State changed to", newState, oldState, self._autoplay);
				if (newState == 'homing') self._homing = true;
				if (newState == 'waiting') self.playing = false;
				if (newState == 'playing') self.playing = true;

				if (oldState == 'homing') {
					self._homed = true;
					self.playlist._rlast = 0; // reset

					if (newState == 'waiting' && self._autoplay) {
						self.playNextTrack(null, null); // autoplay after first home
					}
				}

				// play next track after pausing (i.e. new playlist)
				if (newState == 'waiting' && oldState == 'playing' && self._autoplay) {
					console.log("Play new playlist!", self.playlist);
					self.playNextTrack(null, null); // autoplay after first home
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

				self.set_brightness({value:self.brightness}, null);

				if (self.config.autoplay) {
					//this.playPlaylist('default', {shuffle: true,repeat: true});

					// playlist
					self.setPlaylist({
							name: 'default',
							repeat:true,
							randomized:true,
							track_ids:['2CBDAE96-EC22-48B4-A369-BFC624463C5F', 'C3D8BC17-E2E1-4D6D-A91F-80FBB65620B8', '2B34822B-0A27-4398-AE19-23A3C83F1220', '93A90B6B-EAEE-48A3-9742-C688235D837D','B7407A2F-04C3-4C92-B907-4C3869DA86D6','7C046710-9F19-4423-B291-7394996F0913','D14E0B41-E572-4B69-9827-4A07C503D031','26FBFB10-4BC7-46BF-8D55-85AA52C19ADF','75518177-0D28-4B2A-9B73-29E4974FB702'],
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
	connect: function(data, cb) {
		var obj = {
			id: this.id,
			type: this.type,
			pi_id: this.pi_id,
			name: this.name,
		  brightness: this.brightness,
			speed: this.speed
		};

		cb(null, obj);
	},
	exists: function(data, cb) {
		cb(null, 'Ok');
	},
	play: function(data, cb) {
		console.log("Sisbot Play", data);
		if (this._validateConnection()) {
			this._playing = true;
			this._autoplay = true;
			plotter.resume();
			if (cb)	cb(null, 'play');
		} else cb('No Connection', null);
	},
	pause: function(data, cb) {
		console.log("Sisbot Pause", data);
		if (this._validateConnection()) {
			this._playing = false;
			this._autoplay = false;
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
		_.extend(data, {tracks: this.tracks}); // fix later,

		console.log("Sisbot Set Playlist", data);

		// load playlist
		this.playlist.init(this.config, data);
		this._homed = false;
		if (this._playing) plotter.pause();

		if (this.playlist.randomized) this.playlist.set_random(data.randomized);

		if (!this._playing && this._autoplay) this.playNextTrack({}, null);
		if (this._firstplay) this._autoplay = true;
		this._firstplay = true;

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
					var track = JSON.parse(fs.readFileSync(this.config.base_dir+'/'+this.config.folders.sisbot+'/'+this.config.folders.content+'/'+this.config.folders.tracks+'/'+track_name+'.json', 'utf8'));

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
			brightness: this.brightness,
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

		this.brightness = value;
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

			if (cb) cb(null, returnValue);
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
						self._query_internet(self.config.check_internet_interval);
					} else {
						console.log("Internet not connected, reverting to hotspot.");

						self._is_internet_connected = false;
						if (!self._is_hotspot) self.reset_to_hotspot();
					}
				})
			}, time_to_check);
		}
	},
	get_wifi: function(data, cb) {
		iwlist.scan(data, cb);
	},
	change_to_wifi: function(data, cb) {
		if (data.ssid && data.psk && data.ssid != 'false' && data.psk != "") {
			clearTimeout(this._internet_check);
			// regex, remove or error on double quotes
			// no spaces in password
			//var pwd_check =  data.psk.match(^([0-9A-Za-z@.]{1,255})$);
			exec('sudo /home/pi/sisbot-server/sisbot/stop_hotspot.sh "'+data.ssid+'" "'+data.psk+'"');
			this._is_hotspot = false;
			this._query_internet(7000); // check again in 7 seconds
			cb(null, data.ssid);
		} else {
			cb('ssid or psk error', null);
		}
	},
	is_network_connected: function(data, cb) {
		this._validate_internet(data, cb);
	},
	reset_to_hotspot: function(data, cb) {
		clearTimeout(this._internet_check);
		exec('sudo /home/pi/sisbot-server/sisbot/start_hotspot.sh');

		this._is_hotspot = true;
		this._is_internet_connected = false;
		cb(null, 'reset to hotspot');
	},
	git_pull: function(data, cb) {
		if (data.repo == 'sisbot' || data.repo == 'sisproxy' || data.repo == 'siscloud') {
			exec('sudo /home/pi/sisbot-server/sisbot/update.sh "'+data.repo+'"');
			cb(null, 'installing updates');
		} else {
			cb('repo not found', null);
		}
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

var _							= require('underscore');
var exec 					= require('child_process').exec;
var CSON					= require('cson');
var fs 						= require('fs');
var iwconfig			= require('wireless-tools/iwconfig');
var iwlist				= require('wireless-tools/iwlist');
var exec 					= require('child_process').exec;
var uuid					= require('uuid');
var Backbone			= require('backbone');

var SerialPort		= require('serialport').SerialPort;

var plotter 			= require('./plotter');
// var playlist 			= require('./playlist');
var Sisbot_state 	= require ('./models.sisbot_state');
var Playlist 			= require ('./models.playlist');
var Track 				= require ('./models.track');

var sisbot = {
  config: {},
  ansible: null,
	serial: null,
	plotter: plotter,

	collection: new Backbone.Collection(),
	current_state: null,

	_paused: false,
	_autoplay: false,

	// playlists: [
	// 	{
	// 		name: 'default',
	// 		repeat:true,
	// 		randomized:true,
	// 		track_ids:['2CBDAE96-EC22-48B4-A369-BFC624463C5F', 'C3D8BC17-E2E1-4D6D-A91F-80FBB65620B8', '2B34822B-0A27-4398-AE19-23A3C83F1220', '93A90B6B-EAEE-48A3-9742-C688235D837D','B7407A2F-04C3-4C92-B907-4C3869DA86D6','7C046710-9F19-4423-B291-7394996F0913','D14E0B41-E572-4B69-9827-4A07C503D031','26FBFB10-4BC7-46BF-8D55-85AA52C19ADF','75518177-0D28-4B2A-9B73-29E4974FB702'],
	// 	}
	// ],
	// tracks: [
	// 	{ id: '2CBDAE96-EC22-48B4-A369-BFC624463C5F', type:"r01", reversible:true },
	// 	{ id: 'C3D8BC17-E2E1-4D6D-A91F-80FBB65620B8', type:"r01", reversible:true },
	// 	{ id: '93A90B6B-EAEE-48A3-9742-C688235D837D', type:"r01", reversible:true },
	// 	{ id: 'B7407A2F-04C3-4C92-B907-4C3869DA86D6', type:"r01", reversible:true },
	// 	{ id: 'D14E0B41-E572-4B69-9827-4A07C503D031', type:"r01", reversible:true },
	// 	{ id: '75518177-0D28-4B2A-9B73-29E4974FB702', type:"r01", reversible:true },
	// 	{ id: '7C046710-9F19-4423-B291-7394996F0913', type:"r00", reversible:true },
	// 	{ id: '26FBFB10-4BC7-46BF-8D55-85AA52C19ADF', type:"r11", reversible:true },
	// ],

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

			// Load in the saved state
			var objs = [];
			if (fs.existsSync(config.base_dir+'/'+config.folders.sisbot+'/'+config.folders.content+'/'+config.sisbot_state)) {
				console.log("Load saved state:", config.base_dir+'/'+config.folders.sisbot+'/'+config.folders.content+'/'+config.sisbot_state);
				objs = JSON.parse(fs.readFileSync(config.base_dir+'/'+config.folders.sisbot+'/'+config.folders.content+'/'+config.sisbot_state, 'utf8'));
			} else {
				console.log("Load defaults");
				objs = this.config.default_data;
			}
			_.each(objs, function(obj) {
				switch (obj.type) {
					case "track":
						self.collection.add(new Track(obj));
						break;
					case "playlist":
						self.collection.add(new Playlist(obj));
						break;
					case "sisbot":
						self.collection.add(new Sisbot_state(obj));
						break;
					default:
						console.log("Unknown:", obj);
						self.collection.add(obj);
				}
			});
			this.current_state = this.collection.findWhere({type: "sisbot"});
			// force update pi_id, hardware could have changed
			this.current_state.set("pi_id", 'pi_'+this.config.pi_serial);
			// TODO: add ip address to current_state

			// assign collection and config to each track and playlist
			this.collection.each(function (obj) {
				obj.collection = self.collection;
				obj.config = self.config;

				if (obj.get('type') == 'track') {
					if (obj.get('firstR') < 0 || obj.get('lastR') < 0) obj.get_verts(); // load thr file to get the first/last rho values
				}
			});
			// console.log("Collection", this.collection.toJSON());

			// plotter
	    this.plotter.setConfig(CSON.load(config.base_dir+'/'+config.folders.sisbot+'/'+config.folders.config+'/'+config.sisbot_config));
			plotter.onFinishTrack(function() {
				console.log("Track Finished");
			});
	    plotter.onStateChanged(function(newState, oldState) {
				console.log("State changed to", newState, oldState, self._autoplay);
				if (newState == 'homing') self.current_state.set("state", "homing");
				if (newState == 'playing') self.current_state.set("state", "playing");
				if (newState == 'waiting') self.current_state.set("state", "waiting");

				if (oldState == 'homing') {
					self.current_state.set({is_homed: "true", _end_rho: 0}); // reset

					if (newState == 'waiting' && self._autoplay) {
						self.playNextTrack(null, null); // autoplay after first home
					}
				}

				// play next track after pausing (i.e. new playlist)
				if (newState == 'waiting' && oldState == 'playing' && !self._paused) {
					//console.log("Play new playlist!", self.playlist);
					self.playNextTrack(null, null); // autoplay after first home
				}
			});

			// connect
			this._connect();

			// wifi connect
			if (this.current_state.get("is_hotspot") == "false") this._query_internet(5000); // check for internet connection after 5 seconds

			return this;
  },
	_connect() {
    if (this.serial && this.serial.isOpen()) return true;

		var self = this;
		//console.log("Serial Connect", this.config.serial_path);
 		this.serial = new SerialPort(this.config.serial_path, {}, false);

		try {
      this.serial.open(function (error) {
      	self.plotter.useSerial(self.serial);
				console.info('Serial: connected!');

				self.current_state.set("is_serial_open", "true");
				self.set_brightness({value:self.current_state.get("brightness")}, null);

				if (self.config.autoplay) {
					//console.log("Autoplay:", self.current_state.get("playlist_id"));
					if (self.current_state.get("playlist_id") != "false") self.setPlaylist(self.collection.get(self.current_state.get("playlist_id")).toJSON(), null);
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
      console.error('No serial connection');
			this.current_state.set("is_serial_open", "false");
      return false;
    }
		this.current_state.set("is_serial_open", "true");
    return true;
  },
	connect: function(data, cb) {
		console.log("Sisbot Connect", data);
		cb(null, this.collection.toJSON());
	},
	exists: function(data, cb) {
		console.log("Sisbot Exists", data);
		cb(null, 'Ok');
	},
	save: function(data, cb) {
		console.log("Sisbot Save", data);
		// TODO: merge the given data into collection and save
		fs.writeFile(config.base_dir+'/'+config.folders.sisbot+'/'+config.folders.content+'/'+config.sisbot_state, this.collection.toJSON(), function(err) { if (err) return console.log(err); });
		cb(null, 'Saved');
	},
	play: function(data, cb) {
		console.log("Sisbot Play", data);
		if (this._validateConnection()) {
			this._paused = false;
			plotter.resume();
			if (cb)	cb(null, 'play');
		} else cb('No Connection', null);
	},
	pause: function(data, cb) {
		console.log("Sisbot Pause", data);
		if (this._validateConnection()) {
			this._paused = true;
			plotter.pause();
			if (cb)	cb(null, 'pause');
		} else cb('No Connection', null);
	},
	home: function(data, cb) {
		console.log("Sisbot Home", data);
		if (this._validateConnection()) {
			if (data && data.stop) this._autoplay = false; // home without playing anything afterward
			plotter.home();
			if (cb)	cb(null, 'homing');
		} else cb('No Connection', null);
	},
	setPlaylist: function(data, cb) {
		console.log("Sisbot Set Playlist", data);

		if (data == undefined || data == null) {
			console.log("No Playlist given");
			if (cb) cb('No playlist', null);
			return;
		}

		// save playlist
		var new_playlist = new Playlist(data);
		var playlist = this.collection.add(new_playlist, {merge: true});
		playlist.collection = this.collection;
		playlist.config = this.config;
		if (data.is_shuffle) playlist.set_random(data.is_shuffle);

		// update current_state
		this.current_state.set({is_homed: "false", playlist_id: data.id, is_shuffle: data.is_shuffle, is_loop: data.is_loop});
		if (this.current_state.get('state') == "playing") {
			plotter.pause();
		} else if (this.current_state.get('state') == "waiting") {
			this.playNextTrack(null, null);
		}

		if (cb)	cb(null, 'setPlaylist');
	},
	playTrack: function(data, cb) {
		console.log("Sisbot Play Track", data);
		if (data == undefined || data == null || data == "false") {
			console.log("No Track given");
			if (cb) cb("No track", null);
			return;
		}
		if (this.current_state.get('state') == "homing") return cb('Currently homing...', null);
		if (this._validateConnection()) {
			// re-home if forced
			if (data.home == "true") this.current_state.set("is_homed", "false");

			var track = this.collection.get(data.id);
			if (track != undefined) {
				this.current_state.set('track_id', data.id);

		    if (this.current_state.get("is_homed") == "true") {
					var track_obj = track.get_plotter_obj({start:this.current_state.get('_end_rho')});
					if (track_obj != "false") {
						this._paused = false;
						this.plotter.playTrack(track_obj);
						this.current_state.set('_end_rho', track.get('lastR'));

						if (cb)	cb(null, 'next track '+track_obj.name);
					} else {
						console.log("Continuous play not possible, skip this", track_obj.name);

						if (this.current_state.get("playlist_id") != "false") {
							this.playNextTrack(null, cb);
						} else if (cb) cb('Track not possible', null);
					}
				} else {
					this.home(null, cb);
				}
			} else {
				if (cb)	cb('track not available', null);
			}
		} else cb('No Connection', null);
	},
	playNextTrack: function(data, cb) {
		console.log("Sisbot Play Next Track", data);
		if (this.current_state.get('playlist_id') == "false") {
			console.log("No Playlist");
			if (cb) cb('No playlist', null);
			return;
		}
		if (this.current_state.get('state') == "homing") return cb('Currently homing...', null);
		var playlist = this.collection.get(this.current_state.get('playlist_id'));
		if (playlist != undefined) {
			if (this.current_state.get("is_homed") == "true") {
				var track = playlist.get_next_track();
				if (track != "false")	{
					this._autoplay = true; // make it play, even if a home is needed after homing
					this.playTrack(track.toJSON(), cb);
				}
			} else {
				this.home(null, cb);
			}
		} else {
			if (cb) cb('No playlist', null);
		}
	},
  jogThetaLeft: function(data,cb) {
		if (this.current_state.get('state') == "homing") return cb('Currently homing...', null);
		if (this._validateConnection()) {
			if (this.current_state.get('state') == "playing") this.pause();
			plotter.jogThetaLeft();
			if (cb)	cb(null, 'left');
		} else cb('No Connection', null);
	},
  jogThetaRight: function(data,cb) {
		if (this.current_state.get('state') == "homing") return cb('Currently homing...', null);
		if (this._validateConnection()) {
			plotter.jogThetaRight();
			if (cb)	cb(null, 'right');
		} else cb('No Connection', null);
	},
  jogRhoOutward: function(data,cb) {
		if (this.current_state.get('state') == "homing") return cb('Currently homing...', null);
		if (this._validateConnection()) {
			plotter.jogRhoOutward();
			if (cb)	cb(null, 'out');
		} else cb('No Connection', null);
	},
  jogRhoInward: function(data,cb) {
		if (this.current_state.get('state') == "homing") return cb('Currently homing...', null);
		if (this._validateConnection()) {
			plotter.jogRhoInward();
			if (cb)	cb(null, 'in');
		} else cb('No Connection', null);
	},
  get_state: function(data, cb) {
		console.log("Sisbot get state", data);
    cb(null, this.current_state);
  },
	_clamp: function(value, min, max) {
		var return_value = value;
		if (return_value < min) return_value = min;
		if (return_value > max) return_value = max;
		return return_value;
	},
  set_speed: function(data, cb) {
		console.log("Sisbot Set Speed", data.value);
		var speed = this._clamp(data.value, 0.0, 1.0); // 0.0-1.0f
    plotter.setSpeed(speed);
		this.current_state.set('speed', speed);
    if (cb)	cb(null, plotter.getSpeed());
  },
	set_brightness: function(data, cb) {
		console.log('Sisbot set brightness', data);

    // Don't continue if we're disconnected from the sisbot
    if (!this._validateConnection()) {
			return cb('No Connection', null);
		}

		var value = this._clamp(data.value, 0.0, 1.0);
		this.current_state.set('brightness', value);

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
		var self = this;
		exec('ping -c 1 -W 2 google.com', (error, stdout, stderr) => {
		  if (error) {
		    return console.error('exec error:',error);
		  }

			var returnValue = false;
			if (stdout.indexOf("1 packets transmitted") > -1) returnValue = true;
		  // console.log('stdout:', stdout);
		  // console.log('stderr:', stderr);

			self.current_state.set("is_internet_connected", returnValue);

			if (cb) cb(null, returnValue);
		});
	},
	_query_internet: function(time_to_check) {
		if (this.current_state.get("is_hotspot") == "false") { // only bother if you are not a hotspot
			var self = this;
			_internet_check = setTimeout(function() {
				self._validate_internet(null, function(err, resp) {
					if (err) return console.log("Internet check err", err);
					if (resp) {
						console.log("Internet connected.");

						// check again later
						self._query_internet(self.config.check_internet_interval);
					} else {
						console.log("Internet not connected, reverting to hotspot.");

						if (!self._is_hotspot) self.reset_to_hotspot();
					}
				})
			}, time_to_check);
		}
	},
	get_wifi: function(data, cb) {
		console.log("Sisbot get wifi", data);
		iwlist.scan(data, cb);
	},
	change_to_wifi: function(data, cb) {
		console.log("Sisbot change to wifi", data);
		if (data.ssid && data.psk && data.ssid != 'false' && data.psk != "") {
			clearTimeout(this._internet_check);
			// regex, remove or error on double quotes
			// no spaces in password
			//var pwd_check =  data.psk.match(^([0-9A-Za-z@.]{1,255})$);
			exec('sudo /home/pi/sisbot-server/sisbot/stop_hotspot.sh "'+data.ssid+'" "'+data.psk+'"');
			self.current_state.set("is_hotspot", "false");

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

		self.current_state.set("is_hotspot", "true");
		cb(null, 'reset to hotspot');
	},
	git_pull: function(data, cb) {
		console.log("Sisbot Git Pull", data);
		this.pause(null, null);
		exec('sudo /home/pi/sisbot-server/sisbot/update.sh');
		cb(null, 'installing updates');
	},
	download_playlist: function(data, cb) {
		console.log("Sisbot Download Playlist", data);
		// save playlist
		// download listed tracks
	},
	download_track: function(data, cb) {
		console.log("Sisbot Download Track", data);
		cb(null, 'downloading tracks');
	},
	restart: function(data,cb) {
		console.log("Sisbot Restart", data);
		cb(null, 'restarting sisyphus');
	}
};

module.exports = sisbot;

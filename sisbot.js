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
	_home_next: false,

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
				var playlist_id = self.current_state.get('active_playlist_id');
				if (playlist_id != "false") {
					var playlist = self.collection.get(playlist_id);
					self.current_state.set('active_track_id', playlist.get_next_track_id());
				} else if (self.current_state.get('is_loop') != "true") {
					self.current_state.set('active_track_id', 'false');
				}
			});
	    plotter.onStateChanged(function(newState, oldState) {
				console.log("State changed to", newState, oldState, self._autoplay);
				if (newState == 'homing') self.current_state.set("state", "homing");
				if (newState == 'playing') self.current_state.set("state", "playing");
				if (newState == 'waiting') {
					if (this._paused) self.current_state.set("state", "paused");
					if (!this._paused) self.current_state.set("state", "waiting");
				}

				if (oldState == 'homing') {
					self.current_state.set({is_homed: "true", _end_rho: 0}); // reset

					if (newState == 'waiting' && self._autoplay) {
						// autoplay after first home
						console.log("Play next ",self.current_state.get('active_track_id'));
						if (self.current_state.get('active_track_id') != "false") {
							self._play_track(self.collection.get(self.current_state.get('active_track_id')).toJSON(), null);
						}
					}
				}

				// play next track after pausing (i.e. new playlist)
				if (newState == 'waiting' && oldState == 'playing' && !self._paused) {
					if (this._home_next) {
						self.home(null, null);
					} else if (self.current_state.get('active_track_id') != "false") {
						console.log("Play next track!");
						self._play_track(self.collection.get(self.current_state.get('active_track_id')).toJSON(), null); // autoplay after first home
					}
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
					//console.log("Autoplay:", self.current_state.get("active_playlist_id"));
					if (self.current_state.get("active_playlist_id") != "false") self.set_playlist(self.collection.get(self.current_state.get("active_playlist_id")).toJSON(), null);
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
	state: function(data, cb) {
		cb(null, this.current_state.toJSON());
	},
	exists: function(data, cb) {
		console.log("Sisbot Exists", data);
		cb(null, 'Ok');
	},
	save: function(data, cb) {
		console.log("Sisbot Save", data);
		// TODO: merge the given data into collection and save
		fs.writeFile(this.config.base_dir+'/'+this.config.folders.sisbot+'/'+this.config.folders.content+'/'+this.config.sisbot_state, JSON.stringify(this.collection), function(err) { if (err) return console.log(err); });
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
			this._paused = false;
			plotter.home();
			if (cb)	cb(null, 'homing');
		} else cb('No Connection', null);
	},
	add_playlist: function(data, cb) {
		console.log("Sisbot Add Playlist", data);

		// save playlist
		var new_playlist = new Playlist(data);
		var playlist = this.collection.add(new_playlist, {merge: true});
		playlist.collection = this.collection;
		playlist.config = this.config;

		// add to current_state
		var playlists = this.current_state.get("playlist_ids");
		if (playlists.indexOf(playlist.get("id")) < 0) {
			playlists.push(playlist.get("id"));
			this.current_state.set("playlist_ids", playlists);
		}

		this.save(null, null);

		cb(null, this.current_state.toJSON());
	},
	remove_playlist: function(data, cb) {
		console.log("Sisbot Remove Playlist", data);

		// remove from collection
		this.collection.remove(data.id);

		// remove from current_state
		var playlists = this.current_state.get("playlist_ids");
		var clean_playlists = [];
		_.each(playlists, function(playlist_id) {
			if (playlist_id != data.id) clean_playlists.push(playlist_id);
		});
		this.current_state.set("track_ids", clean_playlists);

		this.save(null, null);

		cb(null, this.current_state.toJSON());
	},
	add_track: function(data, cb) {
		console.log("Sisbot Add Track", data);

		// pull out coordinates
		var verts = data.verts;
		if (verts == undefined || verts == "") return cb("No verts given", null);
		fs.writeFile(this.config.base_dir+'/'+this.config.folders.sisbot+'/'+this.config.folders.content+'/'+this.config.folders.tracks+'/'+data.id+'.thr', verts, function(err) { if (err) return cb(err, null); });
		delete data.verts;

		// save playlist
		var new_track = new Track(data);
		var track = this.collection.add(new_track, {merge: true});
		track.collection = this.collection;
		track.config = this.config;

		// add to current_state
		var tracks = this.current_state.get("track_ids");
		if (tracks.indexOf(track.get("id")) < 0) {
			tracks.push(track.get("id"));
			this.current_state.set("track_ids", tracks);
		}

		this.save(null, null);

		cb(null, this.current_state.toJSON());
	},
	remove_track: function(data, cb) {
		console.log("Sisbot Remove Track", data);

		// remove from collection
		this.collection.remove(data.id);

		// remove from current_state
		var tracks = this.current_state.get("track_ids");
		var clean_tracks = [];
		_.each(tracks, function(track_id) {
			if (track_id != data.id) clean_tracks.push(track_id);
		});
		this.current_state.set("track_ids", clean_tracks);

		this.save(null, null);

		cb(null, this.current_state.toJSON());
	},
	set_playlist: function(data, cb) {
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
		if (data.is_shuffle) playlist.set_shuffle(data.is_shuffle);

		// update current_state
		this.current_state.set({is_homed: "false", active_playlist_id: data.id, active_track_id: data.active_track_id, is_shuffle: data.is_shuffle, is_loop: data.is_loop});
		if (this.current_state.get('state') == "playing") {
			plotter.pause();
			this._home_next = true;
		} else if (this.current_state.get('state') == "waiting") {
			var track = this.collection.get(playlist.get('active_track_id'));
			if (track != undefined && track != "false")	{
				this._autoplay = true;
				this._play_track(track.toJSON(), null);
			}
		}

		this.save(null, null);

		if (cb)	cb(null, playlist.toJSON());
	},
	set_track: function(data, cb) {
		console.log("Sisbot Set Track", data);
		if (data == undefined || data == null) {
			console.log("No Track given");
			if (cb) cb('No track', null);
			return;
		}

		var new_track = new Track(data);
		var track = this.collection.add(new_track, {merge: true});
		track.collection = this.collection;
		track.config = this.config;

		// don't change, this is already playing
		if (track.get('id') == this.current_state.get("active_track_id") && this.current_state.get('state') == "playing") return cb('already playing', null);

		// update current_state
		this.current_state.set({is_homed: "false", active_playlist_id: "false", active_track_id: track.get("id"), is_shuffle: "false", is_loop: "false"});
		if (this.current_state.get('state') == "playing") {
			plotter.pause();
			this._home_next = true;
		} else if (this.current_state.get('state') == "waiting") {
			this._autoplay = true;
			this._play_track(track.toJSON(), null);
		}

		this.save(null, null);

		if (cb)	cb(null, track.toJSON());
	},
	_play_track: function(data, cb) {
		console.log("Sisbot Play Track", data);
		if (data == undefined || data == null || data == "false") {
			console.log("No Track given");
			if (cb) cb("No track", null);
			return;
		}
		if (this.current_state.get('state') == "homing") return cb('Currently homing...', null);
		if (this._validateConnection()) {
			if (this.current_state.get("is_homed") == "true") {
				var track = this.collection.get(data.id);
				if (track != undefined) {
			    if (this.current_state.get("is_homed") == "true") {
						var track_obj = track.get_plotter_obj({start:this.current_state.get('_end_rho')});
						if (track_obj != "false") {
							this._paused = false;
							this.plotter.playTrack(track_obj);
							this.current_state.set('_end_rho', track_obj.lastR); // pull from track_obj

							if (cb)	cb(null, 'next track '+track_obj.name);
						} else {
							console.log("Continuous play not possible, skip this", track_obj.name);

							if (this.current_state.get("active_playlist_id") != "false") {
								this.play_next_track(null, cb);
							} else if (cb) cb('Track not possible', null);
						}
					} else {
						this.home(null, cb);
					}
				} else {
					if (cb)	cb('track not available', null);
				}
			} else {
				this.home(null, cb);
			}
		} else cb('No Connection', null);
	},
	play_next_track: function(data, cb) {
		console.log("Sisbot Play Next Track", data);
		if (this.current_state.get('active_playlist_id') == "false") {
			console.log("No Playlist");
			if (cb) cb('No playlist', null);
			return;
		}
		if (this.current_state.get('state') == "homing") return cb('Currently homing...', null);
		if (this.current_state.get('active_playlist_id') == "false") console.log("There is no selected playlist");
		var playlist = this.collection.get(this.current_state.get('active_playlist_id'));
		if (playlist != undefined) {
			this._autoplay = true; // make it play, even if a home is needed after homing
			if (this.current_state.get("is_homed") == "true") {
				var track = playlist.get_next_track();
				if (track != "false")	{
					this._play_track(track.toJSON(), cb);
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
	set_loop: function(data, cb) {
		console.log("Sisbot set loop", data);

		this.current_state.set('is_loop', data.value);

		var active_playlist_id = this.current_state.get('active_playlist_id');
		if (active_playlist_id != "false") {
			var playlist = this.collection.get(active_playlist_id);
			playlist.set_loop(data.value);

			if (cb) cb(null, data.value);
		} else {
			if (cb) cb('No current playlist, no change', null);
		}

		this.save(null, null);
	},
	set_shuffle: function(data, cb) {
		console.log("Sisbot set shuffle", data);
		var active_playlist_id = this.current_state.get('active_playlist_id');
		if (active_playlist_id != "false") {
			var playlist = this.collection.get(active_playlist_id);
			playlist.set_shuffle(data.value);
			this.current_state.set('is_shuffle', data.value);

			this.save(null, null);

			if (cb) cb(null, playlist.toJSON());
		} else {
			if (cb) cb('No current playlist, no change', null);
		}
	},
  set_speed: function(data, cb) {
		console.log("Sisbot Set Speed", data.value);
		var speed = this._clamp(data.value, 0.0, 1.0); // 0.0-1.0f
    plotter.setSpeed(speed);
		this.current_state.set('speed', speed);

		this.save(null, null);

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

		this.save(null, null);

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
	install_updates: function(data, cb) {
		console.log("Sisbot Install Updates", data);
		this.pause(null, null);
		exec('/home/pi/sisbot-server/sisbot/update.sh');
		cb(null, 'installing updates');
	},
	// download_playlist: function(data, cb) {
	// 	console.log("Sisbot Download Playlist", data);
	// 	// save playlist
	// 	// download listed tracks
	// },
	// download_track: function(data, cb) {
	// 	console.log("Sisbot Download Track", data);
	// 	// save track
	//
	// 	cb(null, 'downloading tracks');
	// },
	restart: function(data,cb) {
		console.log("Sisbot Restart", data);
		cb(null, 'restarting sisyphus');
		exec('sudo reboot');
	}
};

module.exports = sisbot;

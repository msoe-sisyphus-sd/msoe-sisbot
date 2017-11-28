var os					= require('os');
var _					= require('underscore');
var exec 				= require('child_process').exec;
var spawn 				= require('child_process').spawn;
var CSON				= require('cson');
var fs 					= require('fs');
var iwconfig			= require('wireless-tools/iwconfig');
var iwlist				= require('wireless-tools/iwlist');
var uuid				= require('uuid');
var Backbone			= require('backbone');
var Ping				= require('ping-lite');
var request 			= require('request');
var webshot             = require('webshot');
var util                = require('util');
var bleno               = require('bleno');

/**************************** BLE *********************************************/

var ble_obj = {
    initialize: function () {
        bleno.on('stateChange', this.on_state_change);
        bleno.on('advertisingStart', this.on_advertising_start);
    },
    char            : false,
    ip_address      : new Buffer([0, 0, 0, 0]),
    update_ip_address: function (ip_address_str) {
        console.log('Updated IP ADDRESS', ip_address_str, ip_address_str.split('.').map(function(i) { return +i; }));
        this.ip_address = new Buffer(ip_address_str.split('.').map(function(i) { return +i; }));
    },
    on_state_change: function(state) {
        if (state === 'poweredOn')      bleno.startAdvertising('sisyphus', ['ec00']);
        else                            bleno.stopAdvertising();
    },
    on_advertising_start: function(error) {
        if (error)
            return console.log('### WE HAD ISSUE STARTING BLUETOOTH');

        bleno.setServices([
            new bleno.PrimaryService({
                uuid            : 'ec00',
                characteristics : [ new Sisyphus_Characteristic() ]
            })
        ]);
    }
};

var Sisyphus_Characteristic = function() {
    Sisyphus_Characteristic.super_.call(this, {
        uuid        : 'ec0e',
        properties  : ['read'],
        value       : null
    });
};

util.inherits(Sisyphus_Characteristic, bleno.Characteristic);

Sisyphus_Characteristic.prototype.onReadRequest = function(offset, callback) {
    console.log('Sisyphus_Characteristic - onReadRequest: value = ' + ble_obj.ip_address.toString('hex'));
    callback(this.RESULT_SUCCESS, ble_obj.ip_address);
};

ble_obj.initialize();

/**************************** BLE *********************************************/

var SerialPort;
if (process.env.NODE_ENV.indexOf("dummy") < 0) SerialPort	= require('serialport').SerialPort;

var plotter 			= require('./plotter');
var Sisbot_state        = require ('./models.sisbot_state');
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
	_move_to_rho: 0,
	_saving: false,

	_internet_check: 0,
	_internet_retries: 0,
	_changing_to_wifi: false,

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
				//console.log('obj', obj);
				self.ansible.connect(obj, config.services[obj].address, config.services[obj].ansible_port, function(err, resp) {
					if (resp == true) console.log("Sisbot Connected to " + obj);
					else console.log(obj + " Sisbot Connect Error", err);
				});
      		});
		}

		// Load in the saved state
		var objs = [];
		if (fs.existsSync(config.base_dir+'/'+config.folders.sisbot+'/'+config.folders.content+'/'+config.sisbot_state)) {
			//console.log("Load saved state:", config.base_dir+'/'+config.folders.sisbot+'/'+config.folders.content+'/'+config.sisbot_state);
			var saved_state = fs.readFileSync(config.base_dir+'/'+config.folders.sisbot+'/'+config.folders.content+'/'+config.sisbot_state, 'utf8');
			try {
				objs = JSON.parse(saved_state);
			} catch (err) {
				console.log("!!Blank save state, use defaults", err);
				objs = this.config.default_data;
			}
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
		// force values on startup
		this.current_state.set({
			id: 'pi_'+this.config.pi_serial,
			pi_id: 'pi_'+this.config.pi_serial,
			is_homed: "false",
			state: "waiting",
			is_available: "true",
			reason_unavailable: "false",
			is_serial_open: "false",
			installing_updates: "false",
			installing_updates_error: "",
			factory_resetting: "false",
			factory_resetting_error: "",
			installed_updates: "false",
			brightness: 0.7,
			speed: 0.35
		});
		this.current_state.set("local_ip", this._getIPAddress());
		if (this.current_state.get("local_ip") == "192.168.42.1") {
			this.current_state.set({is_hotspot: "true", is_internet_connected: "false"});
		} else {
			this.current_state.set("is_hotspot", "false");
		}
		this.current_state.set("hostname", os.hostname()+".local");

		// assign collection and config to each track and playlist
		this.collection.each(function (obj) {
			obj.collection = self.collection;
			obj.config = self.config;

			switch (obj.get('type')) {
				case 'track':
					if (obj.get('firstR') < 0 || obj.get('lastR') < 0) obj.get_verts(); // load thr file to get the first/last rho values
					break;
				case 'playlist':
					//obj.set_shuffle(obj.get('is_shuffle')); // update order, active tracks indexing
					break;
				default:
					// nothing
					break;
			}
		});

		// plotter
    	this.plotter.setConfig(CSON.load(config.base_dir+'/'+config.folders.sisbot+'/'+config.folders.config+'/'+config.sisbot_config));
		plotter.onFinishTrack(function() {
			console.log("Track Finished");
			if (self._home_next == true) return console.log("Home Next, skip playing next");
			var playlist_id = self.current_state.get('active_playlist_id');
			if (playlist_id != "false") {
				var playlist = self.collection.get(playlist_id);
				self.current_state.set('active_track', playlist.get_next_track({ start_rho: self.current_state.get('_end_rho') }));
			} else if (self.current_state.get('is_loop') != "true") {
				self.current_state.set('active_track', {id: 'false'});
			}
		});
    	plotter.onStateChanged(function(newState, oldState) {
			if (newState == 'homing') self.current_state.set("state", "homing");
			if (newState == 'playing') self.current_state.set("state", "playing");
			if (newState == 'waiting') {
				if (self._paused) self.current_state.set("state", "paused");
				if (!self._paused) self.current_state.set("state", "waiting");
			}
			console.log("State changed to", newState, "("+self.current_state.get("state")+")", oldState, self._autoplay);

			if (oldState == 'homing') {
				if (newState == 'home_th_failed') {
					// TODO: something, never run into this before
					return;
				}
				if (newState == 'home_rho_failed') {
					// move ball out and around a bit, and try again
					console.log("Fix failed home");
					var track_obj = {
						verts: [{th:0,r:0},{th:self.config.failed_home_th,r:self.config.failed_home_rho}],
						vel: 1,
						accel: 0.5,
						thvmax: 0.5
					};
					self._paused = false;
					self.plotter.playTrack(track_obj);
					self._home_next = true; // home after this outward movement
					return;
				}

				self._home_next = false; // clear home next
				self.current_state.set({is_homed: "true", _end_rho: 0}); // reset

				if (newState == 'waiting' && self._autoplay && self.current_state.get('installing_updates') == "false") {
					// autoplay after first home
					console.log("Play next ",self.current_state.get('active_track').name, self.current_state.get('active_track').firstR, "Rho:", self.current_state.get('_end_rho'));

					if (self.current_state.get('active_track').id != "false") {
						var track = self.current_state.get('active_track');
						// if (self.current_state.get("active_playlist_id") == "false") {
						if (track.firstR != undefined && track.firstR != 0) self._move_to_rho = track.firstR;
						// }
						// move to start rho
						if (self._move_to_rho != 0) {
							var track_obj = {
								verts: [{th:0,r:0},{th:self.config.auto_th,r:self._move_to_rho}],
								vel: 1,
								accel: 0.5,
								thvmax: 0.5
							};
							self._paused = false;
							self.plotter.playTrack(track_obj);
							self.current_state.set('_end_rho', self._move_to_rho); // pull from track_obj
							self._move_to_rho = 0;
						} else {
							self._play_track(track, null);
						}
					}
				}
			}

			// play next track after pausing (i.e. new playlist)
			if (newState == 'waiting' && oldState == 'playing' && !self._paused) {
				if (self._home_next) {
					console.log("Home Next");
					setTimeout(function() {
						self.home(null, null);
					}, 1000);
				} else if (self.current_state.get('active_track').id != "false") {
					console.log("Play next track! Rho: ", self.current_state.get('_end_rho'));
					self._play_track(self.current_state.get('active_track'), null); // autoplay after first home
				} else {
					console.log("No Next Track", self.current_state.get('active_track'));
				}
			}
		});

		// connect
		this._connect();

		// wifi connect
		if (this.current_state.get("is_hotspot") == "false") {
			this._query_internet(5000); // check for internet connection after 5 seconds
		} else {
			// check if we should try reconnecting to wifi
			if (this.current_state.get("wifi_network") != "" && this.current_state.get("wifi_password") != "") {
				this.change_to_wifi({ ssid: self.current_state.get("wifi_network"), psk: self.current_state.get("wifi_password") }, null);
			}
		}

		return this;
  	},
	_getIPAddress() {
	  var ip_address = '0.0.0.0';
	  var interfaces = os.networkInterfaces();


	  for (var devName in interfaces) {
	    var iface = interfaces[devName];

	    for (var i = 0; i < iface.length; i++) {
	      var alias = iface[i];
	      if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal)
	        ip_address = alias.address;
	    }
	  }

      // WE ADD BLUETOOTH HOOK HERE
      ble_obj.update_ip_address(ip_address);

	  return ip_address;
	},
	_connect() {
    	if (this.serial && this.serial.isOpen()) return true;

		var self = this;
		//console.log("Serial Connect", this.config.serial_path);
		if (this.config.serial_path == "false") return this.current_state.set("is_serial_open","true");

 		this.serial = new SerialPort(this.config.serial_path, {}, false);

		try {
	      	this.serial.open(function (error) {
	      	self.plotter.useSerial(self.serial);
			console.info('Serial: connected!');

			self.current_state.set("is_serial_open", "true");
			self.set_brightness({value:self.current_state.get("brightness")}, null);
			self.set_speed({value:self.current_state.get("speed")}, null);

			if (self.config.autoplay) {
				//console.log("Autoplay:", self.current_state.get("default_playlist_id"));
				if (self.current_state.get("default_playlist_id") != "false" && self.collection.get(self.current_state.get("default_playlist_id"))!=undefined) {
					var playlist = self.collection.get(self.current_state.get("default_playlist_id"));
					playlist.set({active_track_id: "false", active_track_index: -1});
					playlist.reset_tracks(); // start with non-reversed list
					playlist.set_shuffle(playlist.get('is_shuffle')); // update order, active tracks indexing
					playlist.set({active_track_index: 0});

					// error check, we don't want r11
					var start_index = playlist.get("active_track_index");
					var track_obj = playlist.get("tracks")[playlist.get('sorted_tracks')[start_index]];
					if (track_obj.firstR == 1) {
						console.log("R1 start detected", track_obj);
						// find the first track to start at r0
						var searching = true;
						_.each(playlist.get("sorted_tracks"), function(track_index, index) {
							if (searching) {
								var new_obj = playlist.get("tracks")[track_index];
								if (new_obj.firstR == 0 || new_obj.lastR == 0) {
									playlist.set({active_track_index: -1}); // so this track is allowed to reverse
									playlist.reset_tracks(); // reset their reversed state
									playlist.set({active_track_index: index});
									playlist.set_shuffle(playlist.get('is_shuffle')); // shuffle with active track as first
									searching = false;
								}
							}
						});
					}
					//console.log("Model Playlist Tracks", playlist.get("tracks"));

					var playlist_obj = playlist.toJSON();
					console.log("Playlist Active Index:", playlist_obj.active_track_index);
					playlist_obj.skip_save = true;
					playlist_obj.is_current = true; // we already set the randomized pattern
					playlist_obj.active_track_index = playlist_obj.sorted_tracks[0]; // make it start on the first of randomized list
					//console.log("Send Playlist Tracks", playlist_obj.tracks);

					self.set_playlist(playlist_obj, null);
				}
				// else {
				// 	var playlist = self.collection.get("F42695C4-AE32-4956-8C7D-0FF6A7E9D492").toJSON();
				// 	if (playlist != undefined) {
				// 		playlist.skip_save = true;
				// 		self.set_playlist(playlist, null);
				// 	}
				// }
			}
		});
    } catch(err) {
      console.error('Connect err', err);
    }
	},
	// VERSIONS OF CODE
	latest_software_version: function (data, cb) {
	  if (cb) cb(null, this.config.service_versions);
	},
	software_branch: function (data, cb) {
	  if (cb) cb(null, this.config.service_branches);
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
		if (cb) cb(null, this.collection.toJSON());
	},
	state: function(data, cb) {
		if (cb) cb(null, this.current_state.toJSON());
	},
	exists: function(data, cb) {
		console.log("Sisbot Exists", data);
		if (cb) cb(null, this.current_state.toJSON());
	},
	set_default_playlist: function(data, cb) {
		console.log("Sisbot Set Default Playlist", data);

		this.current_state.set("default_playlist_id", data.default_playlist_id);

		if (cb) cb(null, this.current_state.toJSON());
	},
	set_hostname: function(data,cb) {
		var self = this;

		console.log("Sisbot Set Hostname", data);
		ValidHostnameRegex = new RegExp("^[a-zA-Z][a-zA-Z0-9\-]*$");

		if (data.hostname.search(ValidHostnameRegex) == 0) {
			if (data.hostname+'.local' != self.current_state.get('hostname')) { // set new hostname
				exec('sudo /home/pi/sisbot-server/sisbot/set_hostname.sh "'+data.hostname+'"', (error, stdout, stderr) => {
					if (error) return console.error('exec error:',error);
					self.current_state.set({hostname: data.hostname+'.local',hostname_prompt: "true"});
					self.save(null, null);

					// restart
					self.reboot(null, cb);
				});
			} else { // don't prompt for hostname again
				self.current_state.set({hostname_prompt: "true"});
				self.save(null, null);

				if (cb)	cb(null, this.current_state.toJSON());
			}
		} else if (cb) {
			cb('Invalid hostname characters',null);
		}
	},
	save: function(data, cb) {
		console.log("Sisbot Save", data);
		var self = this;
		// TODO: merge the given data into collection and save
		if (!this._saving) {
		this._saving = true;
			fs.writeFile(this.config.base_dir+'/'+this.config.folders.sisbot+'/'+this.config.folders.content+'/'+this.config.sisbot_state, JSON.stringify(this.collection), function(err) {
				self._saving = false;
				if (err) return console.log(err);
			});
			if (cb) cb(null, 'Saved');
		} else {
			if (cb) cb('Another save in process, try again', null);
		}
	},
	play: function(data, cb) {
		console.log("Sisbot Play", data);
		if (this._validateConnection()) {
			if (this._paused) this.current_state.set("state", "playing");
			this._paused = false;
			plotter.resume();
			if (cb)	cb(null, this.current_state.toJSON());
		} else if (cb) cb('No Connection', null);
	},
	pause: function(data, cb) {
		console.log("Sisbot Pause", data);
		if (this._validateConnection()) {
			this._paused = true;
			this.current_state.set("state", "paused");
			plotter.pause();
			if (cb)	cb(null, this.current_state.toJSON());
		} else if (cb) cb('No Connection', null);
	},
	home: function(data, cb) {
		var self = this;
		console.log("Sisbot Home", data);
		if (this._validateConnection()) {
			if (data) { // special instructions?
				if (data.stop) this._autoplay = false; // home without playing anything afterward
				if (data.clear_tracks) this.current_state.set({active_playlist_id: "false", active_track: { id: "false" }}); // we don't keep track of where we are at anymore
			}

			if (this.current_state.get("state") == "playing") {
				this._home_next = true;
				this.pause(null, function(err, resp) {
					self._paused = false;
					if (cb)	cb(err, resp);
				});
			} else {
				this._paused = false;
				this.current_state.set("state", "homing");
				plotter.home();
				if (cb)	cb(null, this.current_state.toJSON());
			}
		} else if (cb) cb('No Connection', null);
	},
	add_playlist: function(data, cb) {
		console.log("Sisbot Add Playlist", data);

		// save playlist
		var new_playlist = new Playlist(data);
		var playlist = this.collection.add(new_playlist, {merge: true});
		playlist.collection = this.collection;
		playlist.config = this.config;
		playlist.set_shuffle(playlist.get('is_shuffle')); // update sorted list, tracks objects

		// add to current_state
		var playlists = this.current_state.get("playlist_ids");
		if (playlists.indexOf(playlist.get("id")) < 0) {
			playlists.push(playlist.get("id"));
			this.current_state.set("playlist_ids", playlists);
		}

		this.save(null, null);

		if (cb) cb(null, [this.current_state.toJSON(), playlist.toJSON()]); // send back current_state and the playlist
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

		if (cb) cb(null, this.current_state.toJSON());
	},
	add_track: function(data, cb) {
		var self = this;
		console.log("Sisbot Add Track", data);

		// pull out coordinates
		var verts = data.verts;
		if (verts == undefined || verts == "") {
			if (cb) return cb("No verts given", null);
			else return;
		}
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

		// save verts, then callback
		fs.writeFile(this.config.base_dir+'/'+this.config.folders.sisbot+'/'+this.config.folders.content+'/'+this.config.folders.tracks+'/'+data.id+'.thr', verts, function(err) {
			if (err) {
				if (cb) return cb(err, null);
				else return;
			}
			track.get_verts(); // so our first/last rho are forced correct

			self.save(null, null);
			self.thumbnail_generate({ id: data.id }, function(err, resp) {
				// do nothing. this generates the thumbnails in the app folder
				if (cb) cb(null, [self.current_state.toJSON(), track.toJSON()]); // send back current_state and the track
			});
		});

    /*********************** UPLOAD TRACK TO CLOUD ************************/
	},

    get_track_verts: function(data, cb) {
        console.log('track verts', data, cb);
        fs.readFile(this.config.base_dir+'/'+this.config.folders.sisbot+'/'+this.config.folders.content+'/'+this.config.folders.tracks+'/'+data.id+'.thr', 'utf-8', function(err, data) {
            if (cb) cb(err, data); // send back track verts
        });
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

		if (cb) cb(null, this.current_state.toJSON());
	},
    /*********************** GENERATE THUMBNAILS ******************************/
    thumbnail_generate: function (data, cb) {
        // @id
        var self        = this;
        var track_dir   = this.config.base_dir+'/'+this.config.folders.sisbot+'/'+this.config.folders.content+'/'+this.config.folders.tracks;

        fs.readFile(track_dir + '/' + data.id + '.thr', 'utf-8', function(err, raw_coors) {
            if (err) {
                if (cb) return cb('Could not generate thumbnails. No track file.', null);
								else return;
            }

            data.dimensions = 400;
            data.raw_coors  = raw_coors;
            var num_resp    = 2;
            var cb_err              = null;

            self._thumbnails_generate(data, function(err, resp) {
                if (err)        cb_err = err;
                check_cb();
            });

            data.dimensions = 50;
            data.raw_coors  = raw_coors;

            self._thumbnails_generate(data, function(err, resp) {
                if (err)        cb_err = err;
                check_cb();
            });

            function check_cb() {
                if (--num_resp == 0)
                    if (cb) cb(cb_err, null);
            }
        });
    },
    _thumbnails_generate: function(data, cb) {
        // id, host_url, raw_coors, dimensions

        var thumbs_dir  = this.config.base_dir + '/' + this.config.folders.cloud + '/img/tracks';
        var thumbs_file = thumbs_dir + '/' + data.id + '_' + data.dimensions + '.png';

        var opts = {
            siteType        : 'html',
            renderDelay     : 2500,
            captureSelector : '.print',
            screenSize: {
                width       : data.dimensions + 16,
                height      : data.dimensions
            },
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_4) AppleWebKit/600.7.12 (KHTML, like Gecko) Version/8.0.7 Safari/600.7.12',
            shotSize: {
                width       : 'window',
                height      : 'window'
            }
        };

        var base_url = 'http://' + this.current_state.get('local_ip') + ':' + this.config.servers.app.port + '/';
        var html = '<html><!DOCTYPE html>\
        <head>\
            <meta charset="utf-8" />\
            <meta name="format-detection" content="telephone=no" />\
            <meta name="msapplication-tap-highlight" content="no" />\
            <meta name="viewport" content="user-scalable=no, initial-scale=1, maximum-scale=1, minimum-scale=1" />\
            <meta charset="utf-8">\
            <meta http-equiv="X-UA-Compatible" content="IE=edge">\
            <meta name="viewport" content="width=device-width, initial-scale=1">\
            <meta name="google" value="notranslate">\
            <title>Ease</title>\
            <base href="' + base_url + '" />\
            <script src="js/libs/lib.jquery.min.js"></script>\
            <script src="js/libs/lib.underscore.min.js"></script>\
            <script src="js/libs/lib.d3.min.js"></script>\
            <script src="js/libs/lib.gen_thumbnails.js"></script>\
        </head><body><div class="print">\
                        <div class="d3" data-coors="' + data.raw_coors + '" data-dimensions="' + data.dimensions + '"></div>\
                </div></body></html>';

        console.log('#### MAKE WEBSHOT', thumbs_file, base_url);

        webshot(html, thumbs_file, opts, function(err) {
            if (cb) cb(err, null);
        });
    },
    /*********************** PLAYLIST *****************************************/
	set_playlist: function(data, cb) {
		console.log("Sisbot Set Playlist", data);

		if (data == undefined || data == null) {
			console.log("No Playlist given");
			if (cb) cb('No playlist', null);
			return;
		}

		var do_save = true;
		if (data.skip_save) {
			do_save = false;
			delete data.skip_save;
		}

		// save playlist
		var new_playlist = new Playlist(data);
		//if (data.is_current) new_playlist.unset("sorted_tracks"); // so we don't overwrite the old random list
		var playlist = this.collection.add(new_playlist, {merge: true});
		playlist.collection = this.collection;
		playlist.config = this.config;
		if (data.is_shuffle && !data.is_current) playlist.set_shuffle(data.is_shuffle);

		// update current_state
		this.current_state.set({
			is_homed: "false",
			active_playlist_id: data.id,
			active_track: playlist.get_current_track(),
			is_shuffle: data.is_shuffle,
			is_loop: data.is_loop
		});
		console.log("Current track", this.current_state.get('active_track'));
		if (this.current_state.get('state') == "playing") {
			plotter.pause();
			this._home_next = true;
		} else if (this.current_state.get('state') == "waiting" || this.current_state.get('state') == "paused") {
			var track = playlist.get_current_track();
			if (track != undefined && track != "false")	{
				this._autoplay = true;
				this._play_track(track, null);
			}
		}

		if (do_save) this.save(null, null);

		if (cb)	cb(null, playlist.toJSON());
	},
	set_track: function(data, cb) {
		if (data == undefined || data == null) {
			console.log("Sisbot Set Track: No Track given");
			if (cb) cb('No track', null);
			return;
		}
		console.log("Sisbot Set Track", data.name, data.firstR, data.lastR);

		var new_track = new Track(data);
		var track = this.collection.add(new_track, {merge: true});
		track.collection = this.collection;
		track.config = this.config;

		// don't change, this is already playing
		if (track.get('id') == this.current_state.get("active_track").id && this.current_state.get('state') == "playing") {
			if (cb) return cb('already playing', null);
			else return;
		}

		// update current_state
		this.current_state.set({
			is_homed: "false",
			active_playlist_id: "false",
			active_track: track.toJSON(),
			is_shuffle: "false",
			is_loop: "true"
		});
		if (this.current_state.get('state') == "playing") {
			plotter.pause();
			this._home_next = true;
		} else if (this.current_state.get('state') == "waiting" || this.current_state.get('state') == "paused") {
			this._autoplay = true;
			this._play_track(track.toJSON(), null);
		}

		this.save(null, null);

		if (cb)	cb(null, track.toJSON());
	},
	_play_track: function(data, cb) {
		var self = this;
		console.log("Sisbot Play Track", data.name, "r:"+data.firstR+data.lastR, "reversed:", data.reversed, "Table R:", self.current_state.get('_end_rho'));
		if (data == undefined || data == null || data == "false") {
			console.log("No Track given");
			if (cb) cb("No track", null);
			return;
		}
		if (this.current_state.get('state') == "homing") {
			if (cb) return cb('Currently homing...', null);
			else return;
		}
		if (this._validateConnection()) {
			if (this.current_state.get("is_homed") == "true") {
				var track = this.collection.get(data.id);
				if (track != undefined) {
			    if (this.current_state.get("is_homed") == "true") {
						_.extend(data, {start:self.current_state.get('_end_rho')});
						var track_obj = track.get_plotter_obj(data);
						if (track_obj != "false") {
							this._paused = false;
							this.plotter.playTrack(track_obj);
							this.current_state.set('_end_rho', track_obj.lastR); // pull from track_obj

							this.save(null, null);

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
		} else if (cb) cb('No Connection', null);
	},
	play_next_track: function(data, cb) {
		console.log("Sisbot Play Next Track", data);
		if (this.current_state.get('active_playlist_id') == "false") {
			console.log("No Playlist");
			if (cb) cb('No playlist', null);
			return;
		}
		if (this.current_state.get('state') == "homing") {
			if (cb) return cb('Currently homing...', null);
			else return;
		}
		if (this.current_state.get('active_playlist_id') == "false") console.log("There is no selected playlist");
		var playlist = this.collection.get(this.current_state.get('active_playlist_id'));
		if (playlist != undefined) {
			this._autoplay = true; // make it play, even if a home is needed after homing
			if (this.current_state.get("is_homed") == "true") {
				var track = playlist.get_next_track({ start_rho: this.current_state.get('_end_rho') });
				if (track != "false")	{
					this._play_track(track, cb);
				}
			} else {
				this.home(null, cb);
			}
		} else {
			if (cb) cb('No playlist', null);
		}
	},
  jogThetaLeft: function(data,cb) {
		if (this.current_state.get('state') == "homing") {
			if (cb) return cb('Currently homing...', null);
			else return;
		}
		if (this._validateConnection()) {
			if (this.current_state.get('state') == "playing") this.pause();
			this.current_state.set({state: "waiting", is_homed: "false", active_playlist_id: "false", active_track: { id: "false" }}); // we don't keep track of where we are at anymore
			plotter.jogThetaLeft();
			if (cb)	cb(null, this.current_state.toJSON());
		} else if (cb) cb('No Connection', null);
	},
  jogThetaRight: function(data,cb) {
		if (this.current_state.get('state') == "homing") {
			if (cb) return cb('Currently homing...', null);
			else return;
		}
		if (this._validateConnection()) {
			if (this.current_state.get('state') == "playing") this.pause();
			this.current_state.set({state: "waiting", is_homed: "false", active_playlist_id: "false", active_track: { id: "false" }}); // we don't keep track of where we are at anymore
			plotter.jogThetaRight();
			if (cb)	cb(null, this.current_state.toJSON());
		} else if (cb) cb('No Connection', null);
	},
  jogRhoOutward: function(data,cb) {
		if (this.current_state.get('state') == "homing") {
			if (cb) return cb('Currently homing...', null);
			else return;
		}
		if (this._validateConnection()) {
			if (this.current_state.get('state') == "playing") this.pause();
			this.current_state.set({state: "waiting", is_homed: "false", active_playlist_id: "false", active_track: { id: "false" }}); // we don't keep track of where we are at anymore
			plotter.jogRhoOutward();
			if (cb)	cb(null, this.current_state.toJSON());
		} else if (cb) cb('No Connection', null);
	},
  jogRhoInward: function(data,cb) {
		if (this.current_state.get('state') == "homing") {
			if (cb) return cb('Currently homing...', null);
			else return;
		}
		if (this._validateConnection()) {
			if (this.current_state.get('state') == "playing") this.pause();
			this.current_state.set({state: "waiting", is_homed: "false", active_playlist_id: "false", active_track: { id: "false" }}); // we don't keep track of where we are at anymore
			plotter.jogRhoInward();
			if (cb)	cb(null, this.current_state.toJSON());
		} else if (cb) cb('No Connection', null);
	},
  get_state: function(data, cb) {
		console.log("Sisbot get state", data);
    if (cb) cb(null, this.current_state);
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
		var percent = this._clamp(data.value, 0.0, 1.0); // 0.0-1.0f
		var speed = this.config.min_speed + percent * (this.config.max_speed - this.config.min_speed);
		console.log("Sisbot Set Speed", speed);
    	plotter.setSpeed(speed);
		this.current_state.set('speed', percent);

		this.save(null, null);

		if (cb)	cb(null, percent);
	},
	set_autodim: function(data, cb) {
		console.log('Sisbot set autodim', data);

		this.current_state.set('is_autodim', data.value);

		plotter.setAutodim(data.value);// notify plotter of autodim setting

		this.save(null, null);

		if (cb)	cb(null, percent);
	},
	set_brightness: function(data, cb) {
		console.log('Sisbot set brightness', data);

    	// Don't continue if we're disconnected from the sisbot
    	if (!this._validateConnection()) {
			if (cb) return cb('No Connection', null);
			else return;
		}

		var value = this._clamp(data.value, 0.0, 1.0);
		this.current_state.set('brightness', value);

		if (this.current_state.get('is_autodim') == "true") {
	    	plotter.setBrightness(value);// for autodim
		} else {
		    // convert to an integer from 0 - 1023, parabolic scale.
		    var pwm = Math.pow(2, value * 10) - 1;
		    pwm = Math.floor(pwm);

		    if (pwm == 0) {
		      this._serialWrite('SE,0');
		    } else {
		      this._serialWrite('SE,1,'+pwm);
		    }
		}

		this.save(null, null);

		if (cb)	cb(null, value);
	},
	_validate_internet: function(data, cb) {
		//console.log("Sisbot validate internet");
		var self = this;
		exec('ping -c 1 -W 2 google.com', (error, stdout, stderr) => {
			//if (error) return console.error('exec error:',error);

			var returnValue = "false";
			if (stdout.indexOf("1 packets transmitted") > -1) returnValue = "true";
			// console.log('stdout:', stdout);
			// console.log('stderr:', stderr);

			console.log("Internet Connected Check", returnValue);

			// update values
			self.current_state.set({
				is_internet_connected: returnValue,
				local_ip: self._getIPAddress()
			});

			if (self.current_state.get("is_internet_connected") != returnValue) {
				// change hotspot status
				if (self.current_state.get("local_ip") == "192.168.42.1") {
					self.current_state.set("is_hotspot", "true");
				} else {
					self.current_state.set("is_hotspot", "false");
				}
			}

            setTimeout(function () {
    			self.current_state.set({is_internet_connected: returnValue, local_ip: self._getIPAddress()});
            }, 10000);

			if (cb) cb(null, returnValue);
		});
	},
	_query_internet: function(time_to_check) {
		if (this.current_state.get("is_hotspot") == "false") { // only bother if you are not a hotspot
			var self = this;
			this._internet_check = setTimeout(function() {
				self._validate_internet(null, function(err, resp) {
					if (err) return console.log("Internet check err", err);
					if (resp == "true") {
						console.log("Internet connected.",self.current_state.get("is_internet_connected"));

            			self._changing_to_wifi = false;
						self.current_state.set({
							is_available: "true",
							reason_unavailable: "false",
							failed_to_connect_to_wifi: "false",
							wifi_forget: "false",
						 	wifi_error: "false"
						});
						self._internet_retries = 0; // successful, reset

						self.save(null, null);

						// check again later
						self._query_internet(self.config.check_internet_interval);
                        self._post_state_to_cloud();
					} else {
						self._internet_retries++;
						if (self._internet_retries < self.config.internet_retries) {
							self._query_internet(self.config.retry_internet_interval);
						} else if (!self._is_hotspot) {
							console.log("Internet not connected, reverting to hotspot.");
							self.current_state.set({ wifi_error: "true" });
							self.reset_to_hotspot(null,null);
						}
					}
				});
			}, time_to_check);
		}
	},
    _post_state_to_cloud: function () {
        // THIS IS HELPFUL FOR ANDROID DEVICES
        var self = this;

        console.log('LETS TRY AND GET TO CLOUD', this.current_state.toJSON());

        request.post('https://api.sisyphus.withease.io/sisbot_state/' + this.current_state.id,
            { form: { data: this.current_state.toJSON() } },
            function on_resp(error, response, body) {
                if (!error && response.statusCode == 200) {
                    console.log("Post to cloud", body);
                } else {
                    if (response) console.log("Request Not found:", response.statusCode);
                }
            }
        );
    },
	get_wifi: function(data, cb) {
		console.log("Sisbot get wifi", data);
		iwlist.scan(data, cb);
	},
	connect_to_wifi: function(data, cb) {
		// forward to old connection endpoint
		this.current_state.set({ wifi_forget: "true" });
		this.change_to_wifi(data, cb);
	},
	change_to_wifi: function(data, cb) {
		var self = this;
		console.log("Sisbot change to wifi", data);
		if (data.ssid == undefined || data.ssid == "" || data.ssid == "false") {
			if (cb) cb("No network name given", null);
		} else if (data.psk && (data.psk == "" || data.psk.length >= 8)) {
			clearTimeout(this._internet_check);
      		this._changing_to_wifi = true;
			this._internet_retries = 0; // clear retry count

			// Make sure password is valid
			//ValidPasswordRegex = new RegExp("^([a-zA-Z0-9\d$@$!%*?&]{8,64})$");
			if (/^([^\s"]{8,64})$/g.test(data.psk)) {
				self.current_state.set({
					is_available: "false",
					reason_unavailable: "connect_to_wifi",
					wifi_network: data.ssid,
					wifi_password: data.psk,
					is_hotspot: "false"
				});

				console.log("New State:", self.current_state.toJSON());
				self.save(null, null);

				if (cb) cb(null, self.current_state.toJSON());

				exec('sudo /home/pi/sisbot-server/sisbot/stop_hotspot.sh "'+data.ssid+'" "'+data.psk+'"', (error, stdout, stderr) => {
					if (error) return console.error('exec error:',error);

					self._query_internet(5000); // check again in 5 seconds
				});
			} else if (cb) {
				console.log("Invalid Password", data.psk);
				cb("Invalid password", null);
			}
		} else {
			if (cb) cb('ssid or psk error', null);
		}
	},
	is_internet_connected: function(data, cb) {
		this._validate_internet(data, cb);
	},
	stop_wifi_reminder: function(data, cb) {
		console.log("Sisbot Stop Wifi Reminder", data);
		this.current_state.set("do_not_remind", "true");
		if (cb) cb(null, this.current_state.toJSON());
	},
	disconnect_wifi: function(data, cb) {
		// This will remove old network/password
		this.current_state.set({ wifi_network: "", wifi_password: "", wifi_error: "false" });

		this.reset_to_hotspot(data, cb);
	},
	reset_to_hotspot: function(data, cb) {
		// This won't remove old network/password, so we can try reconnecting again later
		// Use disconnect_wifi if you want to remove old network/password
		var self = this;
		console.log("Sisbot Reset to Hotspot", data);
		clearTimeout(this._internet_check);
		this._internet_retries = 0; // clear retry count

		this.current_state.set({
			is_available: "false",
			reason_unavailable: "reset_to_hotspot",
			is_hotspot: "true",
			is_internet_connected: "false"
		});
		if (cb) cb(null, this.current_state.toJSON());

		exec('sudo /home/pi/sisbot-server/sisbot/start_hotspot.sh', (error, stdout, stderr) => {
			if (error) return console.error('exec error:',error);
			console.log("start_hotspot", stdout);
            var new_state = {
                is_available: "true",
                reason_unavailable: "false",
                local_ip: self._getIPAddress(),
                failed_to_connect_to_wifi: (self._changing_to_wifi == true) ? 'true' : 'false'
            };

			// forget bad network values (from cloud)
			if (self.current_state.get('wifi_forget') == 'true') {
				new_state.wifi_network = "";
				new_state.wifi_password = "";
				new_state.wifi_error = "false"; // not an error to remember
			}

            self._changing_to_wifi = false;
			self.current_state.set(new_state);

			self.save(null, null);

			// if a wifi connection error, try to reconnect in __ time
			if (self.current_state.get("wifi_error") == "true") {
				self._internet_check = setTimeout(function() {
					self._reconnect_to_wifi();
				}, self.config.wifi_error_retry_interval);
			}
		});
	},
	_reconnect_to_wifi: function() {
		var self = this;

		self.get_wifi({ iface: 'wlan0', show_hidden: true }, function(err, resp) {
			if (err) {
				console.log("Wifi list error:", err);

				// try again later
				self._internet_check = setTimeout(function() {
					self._reconnect_to_wifi();
				}, self.config.wifi_error_retry_interval);
				return;
			}

			// check if the wanted network is in the list
			if (resp) {
				var wifi_network = self.current_state.get("wifi_network");
				var network_found = false;
				_.each(resp, function(network_obj) {
					if (network_obj && network_obj.ssid && network_obj.ssid == wifi_network) {
						console.log("Found Network", wifi_network, "try to connect");
						network_found = true;
					}
				});

				if (network_found) { // connect!
					self.change_to_wifi({
						ssid: self.current_state.get("wifi_network"),
						psk: self.current_state.get("wifi_password")
					}, null);
				} else { // try again later
					self._internet_check = setTimeout(function() {
						self._reconnect_to_wifi();
					}, self.config.wifi_error_retry_interval);
				}
			} else { // try again later
				self._internet_check = setTimeout(function() {
					self._reconnect_to_wifi();
				}, self.config.wifi_error_retry_interval);
			}
		});
	},
	install_updates: function(data, cb) {
		var self = this;
		console.log("Sisbot Install Updates", data);
		if (this.current_state.get("is_internet_connected")!="true") {
			if (cb) cb("Not connected to internet", null);
			return console.log("Install error: not connected to internet");
		}

		this.current_state.set('installing_updates','true');
		this.pause(null, null);
		exec('/home/pi/sisbot-server/sisbot/update.sh '+this.config.service_branches.sisbot+' '+this.config.service_branches.app+' '+this.config.service_branches.proxy+' > /home/pi/sisbot-server/update.log', (error, stdout, stderr) => {
			self.current_state.set({installing_updates: 'false'});
		  	if (error) {
				if (cb) cb(error, null);
				return console.log('exec error:',error);
			}
			console.log("Install complete");
			self.current_state.set({installed_updates: 'true'}); // makes page reload

			self.save(null, null);

			self.restart(null,cb);
		});
	},
	local_sisbots: function(data, cb) {
		var self = this;
		var sisbots = [];

		// TODO: remove next line to do actual scan
		if (!this.config.testing) {
			if (cb) return cb(null, sisbots);
			else return;
		}

		// TODO: take local_ip, ping exists on 1-254 (except self)
		this.current_state.set("local_ip", this._getIPAddress());
		if (this.current_state.get("local_ip") == "192.168.42.1") {
			this.current_state.set({is_hotspot: "true"});
			if (cb) return cb(null, sisbots); // return empty list, this is a hotspot
			else return;
		}
		var ip = this.current_state.get("local_ip");
		var local = ip.substr(0,ip.lastIndexOf("."));
		console.log("Local address", local);

		// return array of IP addresses (not including self)
		var i=2;
		function loop_cb(err,resp) {
			if (err && err != "Not found") console.log("Err,",err);
			if (resp) {
				console.log("Sisbot found:", resp);
				sisbots.push(resp);
			}
			i++;
			if (i<255) {
				self._check_sisbot({local:local, i:i}, loop_cb);
			} else {
				console.log("Other sisbots found:", _.pluck(sisbots,"local_ip"));
				if (cb) cb(null, sisbots);
			}
		}
		this._check_sisbot({local:local, i:i}, loop_cb);
	},
	_check_sisbot: function(data,cb) {
		var self = this;

		var address = data.local+"."+data.i;
		if (address == this.current_state.get('local_ip')) {
			if (cb) return cb("Skip, self", null);
			else return;
		}

		var ping = new Ping(address);
		ping.on('error', function(err) {
		  // nothing, continue on our way
			if (cb) cb("Not found", null);
		});
		ping.on('result', function(err, ms) {
		  console.log(this._host+' responded.');
			request.post(
			    'http://'+address+'/sisbot/exists',
			    { },
			    function (error, response, body) {
		        if (!error && response.statusCode == 200) {
							console.log("Request Exists:", response, body);
	            if (cb) cb(null, body);
		        } else {
							if (response) console.log("Request Not found:", response.statusCode);
							if (cb) cb("Not found", null);
						}
			    }
			);
		});
		ping.send(); // or ping.start();
	},
	factory_reset: function(data, cb) {
		console.log("Sisbot Factory Reset", data);
		this.current_state.set({is_available: "false", reason_unavailable: "resetting"});
		if (cb) cb(null, this.current_state.toJSON());
		var ls = spawn('./factory_reset.sh',[],{cwd:"/home/pi/sisbot-server/sisbot/",detached:true,stdio:'ignore'});
		ls.on('error', (err) => {
			console.log('Failed to start child process.');
		});
		ls.on('close', (code) => {
			console.log("child process exited with code",code);
		});
	},
	restart: function(data,cb) {
		console.log("Sisbot Restart", data);
		this.current_state.set({is_available: "false", reason_unavailable: "restarting"});
		if (cb) cb(null, this.current_state.toJSON());
		var ls = spawn('./restart.sh',[],{cwd:"/home/pi/sisbot-server/sisbot/",detached:true,stdio:'ignore'});
		ls.on('error', (err) => {
		  console.log('Failed to start child process.');
		});
		ls.on('close', (code) => {
		  console.log("child process exited with code",code);
		});
	},
	reboot: function(data,cb) {
		console.log("Sisbot Reboot", data);
		this.current_state.set({is_available: "false", reason_unavailable: "rebooting"});
		if (cb) cb(null, this.current_state.toJSON());
		exec('sudo reboot', (error, stdout, stderr) => {
		  if (error) return console.log('exec error:',error);
		});
	}
};


module.exports = sisbot;

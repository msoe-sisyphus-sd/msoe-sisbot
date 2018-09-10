var os 			= require('os');
var _ 			= require('underscore');
var exec 		= require('child_process').exec;
var spawn 		= require('child_process').spawn;
var CSON 		= require('cson');
var fs 			= require('fs');
var iwconfig 	= require('wireless-tools/iwconfig');
var iwlist 		= require('wireless-tools/iwlist');
var uuid 		= require('uuid');
var Backbone 	= require('backbone');
var Ping 		= require('ping-lite');
var request 	= require('request');
var webshot 	= require('webshot');
var util 		= require('util');
var scheduler 	= require('node-schedule');
var bleno 		= require('bleno');
var io 			= require('socket.io');
var moment 		= require('moment');
var log4js    = require('log4js');


/**************************** Logging *********************************************/
log4js.configure({
  appenders: { sisbot: { type: 'file', filename: 'sisbot.log' } },
  categories: { default: { appenders: ['sisbot'], level: 'debug' } }
});
const logger = log4js.getLogger('sisbot');


/**************************** BLE *********************************************/

var ble_obj = {
    initialize: function(sisbot_id) {
    		logEvent(1, "ble_obj initialize()");
        this.sisbot_id = sisbot_id;

        bleno.on('stateChange', this.on_state_change);
        bleno.on('advertisingStart', this.on_advertising_start);
    },
    char: false,
    ip_address: new Buffer([0, 0, 0, 0]),
    update_ip_address: function(ip_address_str) {
    		logEvent(1, "ble_obj update_ip_address()");
        logEvent(1, 'Updated IP ADDRESS', ip_address_str, ip_address_str.split('.').map(function(i) {
            return +i;
        }));
        this.ip_address = new Buffer(ip_address_str.split('.').map(function(i) {
            return +i;
        }));
    },
    on_state_change: function(state) {
    		logEvent(1, "ble_obj on_state_change()");
        var ble_id = ble_obj.sisbot_id.substr(ble_obj.sisbot_id.length - 7);
        logEvent(1, 'BLE Sisbot ID', ble_id);
        if (state === 'poweredOn') bleno.startAdvertising('sisbot' + ble_id, ['ec00']);
        else bleno.stopAdvertising();
    },
    on_advertising_start: function(error) {
    		logEvent(1, "ble_obj on_advertising_start()");
        if (error) return logEvent(2, '### WE HAD ISSUE STARTING BLUETOOTH');

        bleno.setServices([
            new bleno.PrimaryService({
                uuid: 'ec00',
                characteristics: [new Sisyphus_Characteristic()]
            })
        ]);
    }
};

var Sisyphus_Characteristic = function() {
    Sisyphus_Characteristic.super_.call(this, {
        uuid: 'ec0e',
        properties: ['read'],
        value: null
    });
};

util.inherits(Sisyphus_Characteristic, bleno.Characteristic);

Sisyphus_Characteristic.prototype.onReadRequest = function(offset, callback) {
    logEvent(1, 'Sisyphus_Characteristic - onReadRequest: value = ' + ble_obj.ip_address.toString('hex'));
    callback(this.RESULT_SUCCESS, ble_obj.ip_address);
};

/**************************** SISBOT ******************************************/

var SerialPort;
if (process.env.NODE_ENV.indexOf("dummy") < 0) SerialPort = require('serialport').SerialPort;

var plotter = require('./plotter');
var Sisbot_state = require('./models.sisbot_state');
var Playlist = require('./models.playlist');
var Track = require('./models.track');

var sisbot = {
	config: {},
	ansible: null,
	serial: null,
	plotter: plotter,
	socket_update: null,

	sleep_timer: null,
	wake_timer: null,

	collection: new Backbone.Collection(),
	current_state: null,

	connectionErrors: 0,
	error_messages: [],

	_paused: false,
	_play_next: false,
	_autoplay: false,
	_home_next: false,
  _sensored: true, // use a sensored home
  _home_delay: 0,
	_moved_out: false, // small ball adjustment before homing
	_attach_track: false, // for tables with multiple balls
	_detach_track: false, // for tables with multiple balls
	_detach_first: false, // for tables with multiple balls, after first home
	_move_to_rho: 0,
	_saving: false,

	_thumbnail_queue: [],

	_internet_check: 0,
	_internet_retries: 0,
	_changing_to_wifi: false,

	_hostname_queue: {},
	_hostname_schedule: null,

	init: function(config, session_manager, socket_update) {
		var self = this;
  	this.config = config;
		logEvent(1, "Init Sisbot");
		logger.info("Initialzie sisbot");


		this.socket_update = socket_update;

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
		}

		// Load in the saved state
		var objs = [];
		if (fs.existsSync(config.base_dir+'/'+config.folders.sisbot+'/'+config.folders.content+'/'+config.sisbot_state)) {
			logEvent(1, "Load saved state:", config.base_dir+'/'+config.folders.sisbot+'/'+config.folders.content+'/'+config.sisbot_state);
			var saved_state = fs.readFileSync(config.base_dir+'/'+config.folders.sisbot+'/'+config.folders.content+'/'+config.sisbot_state, 'utf8');
			try {
				objs = JSON.parse(saved_state);
			} catch (err) {
				logEvent(3, "!!Blank save state, use defaults", err);
				objs = this.config.default_data;
			}
		} else {
			logEvent(1, "Load defaults");
			objs = this.config.default_data;
		}

    var cson_config = CSON.load(config.base_dir+'/'+config.folders.sisbot+'/'+config.folders.config+'/'+config.sisbot_config);


    //var tracks = this.current_state.get("track_ids");
    var tracks = [];
    //var playlists = this.current_state.get("playlist_ids");
    //var playlists = [];

    logEvent(1, "looping through loaded state");

		_.each(objs, function(obj) {
			switch (obj.type) {
				case "track":
          var is_2ball = cson_config.twoBallEnabled;
          var is_2ball_track = false;
          logEvent(1,"reading track from state ", obj.name);
          if (obj.name == 'Attach') { is_2ball_track = true; }
          if (obj.name == 'Detach') { is_2ball_track = true; }
          logEvent(1, "track switch 2ball ", is_2ball , " track_type ", is_2ball_track);

          if (is_2ball || is_2ball_track == false)
          {
            logEvent(1, "adding track named to self.collection ", obj.name);
            var newTrack = new Track(obj);
  					var track = self.collection.add(newTrack);
            if (track.get('verts')) {
              logEvent(2, "Track saved verts", track.get('name'));
              track.unset('verts');
            }
            if (tracks.indexOf(track.get("id")) < 0) {
              tracks.push(track.get("id"));
            }
          }

					break;
				case "playlist":
          var newPlaylist = new Playlist(obj);
          logEvent(1,"reading in playlist during init " + newPlaylist.get('name'));
          if (newPlaylist.get('name') == "2Ball Demo")
          {
            logEvent(1,"Found the 2Ball Demo playlist");
            if (cson_config.twoBallEnabled) {
              logEvent(1,"Two ball config, allowed to see this playlist");
              self.collection.add(newPlaylist);
              // if (playlists.indexOf(playlist.get("id")) < 0) {
              //   playlists.push(playlist.get("id"));
              // }
            }
          }
          else
          {
            logEvent(1,"saving playlist to collection " + newPlaylist.get('name'));
  					self.collection.add(newPlaylist);
            // if (playlists.indexOf(playlist.get("id")) < 0) {
            //   playlists.push(playlist.get("id"));
            // }
          }
					break;
				case "sisbot":
          logEvent(1,"getting sisbot state");
					self.collection.add(new Sisbot_state(obj));
					break;
				default:
					logEvent(1, "Unknown:", obj);
					self.collection.add(obj);
			}
      


		});


		this.current_state = this.collection.findWhere({type: "sisbot"});

    logEvent(1,"setting track_ids to ", tracks);
    this.current_state.set("track_ids", tracks);
    logEvent(1,"done setting track_ids");
    // this.current_state.set("playlist_ids", playlists);
    

		// make sure the hostname is correct
		var regex = /^[^a-zA-Z]*/; // make sure first character is a-z
		var regex2 = /[^0-9a-zA-Z\-]+/g; // greedy remove all non alpha-numerical or dash chars
		var clean_hostname = this.current_state.get('name').replace(regex,"").replace(regex2,"");
		if (this.current_state.get('hostname') != clean_hostname+'.local') {
			self.set_hostname({hostname: clean_hostname}, null);
			logEvent(2, "Fix incorrect hostname");
			return; // stop here
		}

        // INITIALIZE BLUETOOTH
        process.env['BLENO_DEVICE_NAME'] = 'sisbot ' + this.current_state.id;
        ble_obj.initialize(this.current_state.id);

		// force do_not_remind if old Version (1.0)
		var old_version = +this.current_state.get('software_version');
		if (old_version && old_version < 1.1) {
			this.current_state.set('do_not_remind', 'false');
		}

		// force values on startup
		this.current_state.set({
			id: 'pi_'+this.config.pi_serial,
			pi_id: 'pi_'+this.config.pi_serial,
			is_homed: "false",
      _end_rho: 0, // on startup, we should be at 0
			state: "waiting",
			is_available: "true",
			reason_unavailable: "false",
			is_serial_open: "false",
			installing_updates: "false",
			installing_updates_error: "",
			factory_resetting: "false",
			factory_resetting_error: "",
			installed_updates: "false",
			brightness: 0.5,
			speed: 0.2,
			is_internet_connected: "false",
			software_version: this.config.version
		});
		this.current_state.set("local_ip", this._getIPAddress());
		if (this.current_state.get("local_ip") == "192.168.42.1") {
			this.current_state.set("is_hotspot", "true");
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
          logEvent(1,"setting up all tracks " + obj.get('name'));
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
    var cson_config = CSON.load(config.base_dir+'/'+config.folders.sisbot+'/'+config.folders.config+'/'+config.sisbot_config);
  	this.plotter.setConfig(cson_config);
    if (cson_config.max_speed) this.config.max_speed = cson_config.max_speed; // overwrite config.js max_speed if table allows
		if (cson_config.twoBallEnabled) {
      logEvent(1, "Enable two ball");
			this._detach_first = true;
      this.current_state.set('is_multiball','true'); // allow frontend to know

			if (cson_config.attach_track) {
        logEvent(1, "Generate Attach track", cson_config.attach_track);
        var a_verts = cson_config.attach_track.split(',').join('\n');
        this.add_track({id:'attach',name:'Attach',verts:a_verts},null);
        // this._attach_track = cson_config.attach_track;
      }

			if (cson_config.detach_track) {
        logEvent(1, "Generate Detach track", cson_config.detach_track);
        var d_verts = cson_config.detach_track.split(',').join('\n');
        this.add_track({id:'detach',name:'Detach',verts:d_verts},null);
        // this._detach_track = cson_config.detach_track;
			}
		}
		plotter.onServoThFault(function() {
      if (self.current_state.get('reason_unavailable') != 'servo_th_fault') logEvent(2, "Servo Th Fault!");
			self.pause(null, null);
			self.current_state.set("reason_unavailable", "servo_th_fault");
			self.socket_update(self.current_state.toJSON()); // notify all connected UI
			clearTimeout(self._internet_check); // stop internet checks
		});
		plotter.onServoRhoFault(function() {
      if (self.current_state.get('reason_unavailable') != 'servo_rho_fault') logEvent(2, "Servo Rho Fault!");
			self.pause(null, null);
			self.current_state.set("reason_unavailable", "servo_rho_fault");
			self.socket_update(self.current_state.toJSON()); // notify all connected UI
			clearTimeout(self._internet_check); // stop internet checks
		});
		plotter.onServoThRhoFault(function() {
      if (self.current_state.get('reason_unavailable') != 'servo_th_rho_fault') logEvent(2, 'Servo Th and Rho Fault!');
			self.pause(null, null);
			self.current_state.set("reason_unavailable", "servo_th_rho_fault");
			self.socket_update(self.current_state.toJSON()); // notify all connected UI
			clearTimeout(self._internet_check); // stop internet checks
		});
		plotter.onFinishTrack(function() {
			logEvent(1, "Track Finished");
			if (self._home_next == true) return logEvent(1, "Home Next, skip playing next");

			var playlist_id = self.current_state.get('active_playlist_id');
			if (playlist_id != "false") {
				var playlist = self.collection.get(playlist_id);
				// make sure playlist was not deleted
				if (!playlist) {
					self.current_state.set('active_playlist_id', 'false');
					return self.socket_update(self.current_state.toJSON());
				}

				if (self.current_state.get('repeat_current') != 'true') {
					if (self.current_state.get('is_paused_between_tracks') == 'true') {
						self._paused = true;
						self.current_state.set('is_waiting_between_tracks', 'true');
						// self._play_next = true;
					} else {
						var nextTrack = playlist.get_next_track({ start_rho: self.current_state.get('_end_rho') });
						self.current_state.set('active_track', nextTrack);
						if (nextTrack.id != 'false' && nextTrack.name != undefined) {
							if (nextTrack.name.toLowerCase().indexOf('attach') == 0 || nextTrack.name.toLowerCase().indexOf('detach') == 0) self._home_next = true;
						}
					}
				}
				self.current_state.set('repeat_current', 'false');

				// update UI
				self.socket_update([self.current_state.toJSON(), playlist.toJSON()]);
			} else {
				// Single Track
				if (self.current_state.get('repeat_current') != 'true') {
					self._paused = true;
					self.current_state.set({
						is_waiting_between_tracks: 'true'
					});
				}
				self.current_state.set('repeat_current', 'false');

				// update UI
				self.socket_update(self.current_state.toJSON());
			}
		});
  	plotter.onStateChanged(function(newState, oldState) {
			if (newState == 'homing') self.current_state.set("state", "homing");
			if (newState == 'playing' && !self._home_next) self.current_state.set("state", "playing");
			if (newState == 'waiting') {
				if (self._paused) self.current_state.set("state", "paused");
				if (!self._paused) self.current_state.set("state", "waiting");
			}
			logEvent(1, "State changed to", newState, "("+self.current_state.get("state")+")", oldState, self._autoplay);

			if (oldState == 'homing') {
				if (newState == 'home_th_failed') {
					// TODO: something, never run into this before
					return;
				}
				if (newState == 'home_rho_failed') {
					// move ball out and around a bit, and try again
					logEvent(2, "Failed home!");
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

        self._sensored = false; // don't sensored home next
				self._home_next = false; // clear home next
				self.current_state.set({is_homed: "true", _end_rho: 0}); // reset

				if (newState == 'waiting' && self._autoplay && self.current_state.get('installing_updates') == "false") {
					// autoplay after first home
					logEvent(1, "Play next ",self.current_state.get('active_track').name, self.current_state.get('active_track').firstR, "Rho:", self.current_state.get('_end_rho'));

					// _detach_first?
					if (self._detach_first) {
						var track = self.collection.get('detach'); // detach id is always 'detach'
            logEvent(1, "Detach First", track.toJSON());

            self.current_state.set('repeat_current', 'true'); // don't step over wanted first track

						self._play_track(track.toJSON(), null);

						self._detach_first = false;
					} else if (self.current_state.get('active_track').id != "false") {
            self._play_given_track(self.current_state.get('active_track'));
					}
				}
			}

			// play next track after pausing (i.e. new playlist)
			if (newState == 'waiting' && oldState == 'playing' && !self._paused) {
				if (self._home_next) {
					logEvent(1, "Home Next");
					setTimeout(function() {
						self.home(null, null);
					}, 1000);
				} else if (self.current_state.get('active_track').id != "false") {
					logEvent(1, "Play next track. Rho: ", self.current_state.get('_end_rho'));
					self._play_track(self.current_state.get('active_track'), null); // autoplay after first home
				} else {
					logEvent(1, "No Next Track", self.current_state.get('active_track'));
				}
			}

			// update UI
			self.socket_update(self.current_state.toJSON());
		});

		// connect
		this._connect();

		// wifi connect
		if (this.current_state.get("is_hotspot") == "false") {
			// this.current_state.set("is_internet_connected", "false"); // assume false, so sockets connect
			this._query_internet(5000); // check for internet connection after 5 seconds
		} else {
			// check if we should try reconnecting to wifi
			if (this.current_state.get("wifi_network") != "" && this.current_state.get("wifi_network") != "false" && this.current_state.get("wifi_password") != "" && this.current_state.get("wifi_password") != "false") {
				this.change_to_wifi({ ssid: self.current_state.get("wifi_network"), psk: self.current_state.get("wifi_password") }, null);
			}
		}

		// sleep/wake timers
		this.set_sleep_time(this.current_state.toJSON(), null);

		return this;
	},
	_setupAnsible() {
		var self = this;
		_.each(self.config.services.sisbot.connect, function(service_name) {
			//logEvent(1, 'service_name', service_name);
			if (!self.ansible.sockets[service_name]) {
				self.ansible.connect(service_name, self.config.services[service_name].address, self.config.services[service_name].ansible_port, function(err, resp) {
					if (resp == true) {
						logEvent(1, "Sisbot Connected to " + service_name);
						logEvent(1, "Sisbot connections", _.keys(self.ansible.sockets));
						if (self.config.services[service_name].is_register) {
							var service_connected = self.current_state.get("service_connected");
							service_connected[service_name] = "false";
							self.current_state.set('service_connected', service_connected);

							logEvent(1, "Register to", service_name);
							setTimeout(self._register, 100, self, service_name);
						}
					} else logEvent(2, service_name + " Sisbot Connect Error", err);
				});
			}
  		});
	},
	_teardownAnsible() {
		var self = this;
		_.each(self.config.services.sisbot.connect, function(service_name) {
			logEvent(1, 'Disconnect', service_name);
			self.ansible.disconnect(service_name);
		});

		logEvent(1, "Ansible teardown complete");
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
	/***************************** Ansible connection ************************/
	_register: function(self, service) {
		logEvent(1, "_Register", service);
		self.ansible.request({
			service: service,
			method: "register",
			data: {
				id: self.current_state.id,
				hostname: self.current_state.get("hostname"),
				service_name: service
			},
			cb: function(err,resp) {
				logEvent(1, "Register Response",err,resp);
				if (err) return logEvent(2, "Err:", err);
				self._ready(resp);
			}
		});
	},
	_ready: function(data) {
		var self = this;
		logEvent(1, "Sisbot Ready", data);
		this.connectionErrors = 0;

		//send_stats();
		// this.stats_reporter = setInterval(send_stats, 300000);
		logEvent(2, "Send errors", this.error_messages.length);
		if (this.error_messages.length > 0) {
			_.each(this.error_messages, function(message) {
				logEvent(2, "Send error", message);
				self.ansible.request(message);
			});
			this.error_messages = [];
		}

		// this._request_config();

		var service_connected = self.current_state.get("service_connected");
		service_connected.api = "true"
		self.current_state.set("service_connected", service_connected);

		this.socket_update(self.current_state.toJSON());
	},
	_connectionError: function(service) {
		var service_connected = this.current_state.get("service_connected");

		// make sure connection has not been disconnected on purpose
		if (service_connected[service] != undefined && service_connected[service] == "true") {
			this.connectionErrors++;
			logEvent(2, "Connection Error",service,this.connectionErrors, this.current_state.id);

			// request new config if connectionErrors == 100?
			if (this.connectionErrors >= this.config.retry_count) {
				// change the ansible address/port
			}

			// create error message to send when able
			this.error_messages.push({
				service: service,
				method: "sisbot_error",
				data: {
					service:						service,
					sisbotID: 						this.current_state.id,
					address: 						this.current_state.get("address"),
					version: 						this.current_state.get("version"),
					error:							"Could not connect "+service
				}
			});
		}
	},
	_connectionClosed: function(service) {
		logEvent(1, "Connection Closed", service, this.connectionErrors, this.current_state.id);

		var service_connected = this.current_state.get("service_connected");
		if (service_connected[service] != undefined) {
			service_connected[service] = "false";
	        this.current_state.set("service_connected", service_connected);

			this.socket_update(this.current_state.toJSON());
		}

		this._connectionError(service);
	},
	/***************************** Plotter ************************/
	_connect: function() {
    	if (this.serial && this.serial.isOpen()) return true;

		var self = this;
		//logEvent(1, "Serial Connect", this.config.serial_path);
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
					//logEvent(1, "Autoplay:", self.current_state.get("default_playlist_id"));
					if (self.current_state.get("default_playlist_id") != "false" && self.collection.get(self.current_state.get("default_playlist_id"))!=undefined) {
						var playlist = self.collection.get(self.current_state.get("default_playlist_id"));
						playlist.set({active_track_id: "false", active_track_index: -1});
						playlist.reset_tracks(); // start with non-reversed list
						playlist.set_shuffle({ is_shuffle: "true", start_rho: 0 }); // update order, active tracks indexing
						playlist.set({active_track_index: 0});

						var playlist_obj = playlist.toJSON();
						logEvent(1, "Playlist Active Index:", playlist_obj.active_track_index);
						playlist_obj.skip_save = true;
						playlist_obj.is_current = true; // we already set the randomized pattern

						self.set_playlist(playlist_obj, function(err, resp) {
							if (err) return logEvent(1, "Set initial playlist", err);
							self.socket_update(resp);
						});
					}
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
	_serialWrite: function(command) {
		logEvent(1, 'SERIAL:',command);
		this.serial.write(command+'\r');
	},
	_validateConnection: function() {
    if (this.current_state.get('reason_unavailable').indexOf('_fault') >= 0) {
		  logEvent(2, 'Fault state, not a valid connection');
      return false;
    }
		if (!this.serial || !this.serial.isOpen()) {
		  logEvent(2, 'No serial connection');
		  this.current_state.set("is_serial_open", "false");
		  return false;
		}
		this.current_state.set("is_serial_open", "true");
		return true;
	},
	connect: function(data, cb) {
		// logEvent(1, "Sisbot Connect", data);
		if (cb) cb(null, this.collection.toJSON());
	},
	state: function(data, cb) {
		// logEvent(1, "Sisbot state");
		var return_objs = [this.current_state.toJSON()];

		var playlist_id = this.current_state.get('active_playlist_id');
		if (playlist_id != 'false') return_objs.push(this.collection.get(playlist_id).toJSON());

		if (cb) cb(null, return_objs);
		// if (cb) cb(null, this.current_state.toJSON());
	},
	get_collection: function(data, cb) {
		var self = this;
		var return_objs = [];

		this.collection.each(function(model) {
			if (model.id != self.current_state.id) return_objs.push(model.toJSON());
		});
		return_objs.push(this.current_state.toJSON()); // sisbot state last
		// logEvent(1, "Sisbot state  get_collection", return_objs);

		if (cb) cb(null, return_objs);
	},
	exists: function(data, cb) {
		// logEvent(1, "Sisbot Exists", data);
		if (cb) cb(null, this.current_state.toJSON());
	},
  test_unavailable: function(data, cb) {
		logEvent(1, "Test Reason Unavailable", data);
    // pause if given fault reason
    if (data.value.indexOf('_fault') >= 0) {
      this.pause(null, null);
    }
    this.current_state.set('reason_unavailable', data.value);

    this.socket_update(this.current_state.toJSON()); // notify all connected UI
    clearTimeout(this._internet_check); // stop internet checks

    if (cb) cb(null, this.current_state.toJSON());
  },
	set_default_playlist: function(data, cb) {
		logEvent(1, "Sisbot Set Default Playlist", data);

		this.current_state.set("default_playlist_id", data.default_playlist_id);

		if (cb) cb(null, this.current_state.toJSON());
	},
	set_hostname: function(data,cb) {
		var self = this;

		logEvent(1, "Sisbot Set Hostname", data, process.platform);
		ValidHostnameRegex = new RegExp("^[a-zA-Z][a-zA-Z0-9\-]*$");

    if (process.platform != 'linux') {
      if (cb)	cb(null, this.current_state.toJSON());
      return;
    }

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
	set: function(data, cb) {
		logEvent(1, "Incoming Set", data);
		if (cb) cb(null, data);
	},
	save: function(data, cb) {
		var self = this;
		// logEvent(1, "Sisbot Save", data);
		if (!this._saving) {
			this._saving = true;

			var returnObjects = [];

			// TODO: merge the given data into collection and save
			if (data != null) {
				if (!_.isArray(data)) data = [data];
				_.each(data, function(obj) {
					// extra checks if passing sisbot changes
					if (obj.id == self.current_state.id) {
						if (obj.state) delete obj.state; // don't listen to updates to this, plotter is in control of this
						if (obj.is_autodim != self.current_state.get('is_autodim')) self.set_autodim({value: "true"}, null);
						if (obj.brightness != self.current_state.get('brightness')) self.set_brightness({value: obj.brightness}, null);
						if (obj.name != self.current_state.get('name')) {
							var regex = /^[^a-zA-Z]*/; // make sure first character is a-z
							var regex2 = /[^0-9a-zA-Z\-]+/g; // greedy remove all non alpha-numerical or dash chars
							var clean_hostname = obj.name.replace(regex,"").replace(regex2,"");
							self.set_hostname({hostname: clean_hostname}, null);
						}
						if (obj.share_log_files != self.current_state.get('share_log_files')) self.set_share_log_files({value: obj.share_log_files}, null);
					}
					returnObjects.push(self.collection.add(obj, {merge:true}).toJSON());
				});
			}

			fs.writeFile(this.config.base_dir+'/'+this.config.folders.sisbot+'/'+this.config.folders.content+'/'+this.config.sisbot_state, JSON.stringify(this.collection), function(err) {
				self._saving = false;
				if (err) return logEvent(2, err);
			});

			if (cb) cb(null, returnObjects);
		} else {
			if (cb) cb('Another save in process, try again', null);
		}
	},
	play: function(data, cb) {
		var self = this;

		if (this._validateConnection()) {
  		logEvent(1, "Sisbot Play", data);
			if (this._paused) this.current_state.set("state", "playing");
			this._paused = false;

			// move on to next track if we paused between tracks
			if (this.current_state.get('is_waiting_between_tracks') == 'true') {
			// if (this._play_next) {
				var playlist_id = this.current_state.get('active_playlist_id');
				if (playlist_id != "false") {
					var playlist = this.collection.get(playlist_id);

					var nextTrack = playlist.get_next_track({ start_rho: self.current_state.get('_end_rho') });
					this.current_state.set('active_track', nextTrack);
					if (nextTrack.id != 'false' && nextTrack.name != undefined) {
						if (nextTrack.name.toLowerCase().indexOf('attach') == 0 || nextTrack.name.toLowerCase().indexOf('detach') == 0) self._home_next = true;
					}

					// this.current_state.set('active_track', playlist.get_next_track({ start_rho: this.current_state.get('_end_rho') }));
					this.socket_update(playlist.toJSON());
				}

				if (self._home_next) {
					this.current_state.set('state', 'waiting'); // fix so it does the home correctly
					logEvent(1, "Home Next", this.current_state.get("state"));
					setTimeout(function() {
						self.home(null, null);
					}, 100);
				} else {
					this._play_track(this.current_state.get('active_track'), null);
				}

				this.current_state.set('is_waiting_between_tracks', 'false');

				// this._play_next = false;
			} else {
				plotter.resume();
			}

			this.socket_update(this.current_state.toJSON());
			if (cb)	cb(null, this.current_state.toJSON());
		} else if (cb) cb('No Connection', null);
	},
	pause: function(data, cb) {
		if (this._validateConnection()) {
  		logEvent(1, "Sisbot Pause", data);
			this._paused = true;
			this.current_state.set("state", "paused");
			plotter.pause();
			if (cb)	cb(null, this.current_state.toJSON());
		} else if (cb) cb('No Connection', null);
	},
	home: function(data, cb) {
		var self = this;

		if (this._validateConnection()) {
	    logEvent(1, "Sisbot Home", data);
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

				////////// DR Homing:
	      if (this._sensored == false){
    			var thetaPosition, rhoPosition;

    			thetaPosition = self.plotter.getThetaPosition();
    			logEvent("shortest theta dist away from home = " + thetaPosition + " rads");
    			rhoPosition = plotter.getRhoPosition();
    			logEvent("rho dist away form home = " + rhoPosition + " normalized");

    			var track_obj = {
						verts: [{th: thetaPosition, r: rhoPosition},{th:0,r:0}],
						vel: 1,
						accel: 0.5,
						thvmax: 0.5
					};
					self._paused = false;
					logEvent("doing DEAD RECKONING homing...");
					console.log("doing DEAD RECKONING homing...");
					self.plotter.playTrack(track_obj);
					self._home_next = true; // home after this outward movement

					self._sensored = true; //next time round, sensored home

  				if (cb)	cb(null, this.current_state.toJSON());
	      } else {
          // delay, then check if we need to move out
          self._home_delay = setTimeout(function() {
            self._delayed_home(data, cb);
          }, 500); // wait a half second
        }
			}
		} else if (cb) cb('No Connection', null);
	},
  _delayed_home: function(data, cb) {
    var self = this;

    //
		if (this._validateConnection()) {
      var thHome = self.plotter.getThetaHome();
			
      var rhoHome = self.plotter.getRhoHome();
			
      logEvent(1, "Sensor Values", thHome, rhoHome);
			console.log("Sensor Values", thHome, rhoHome);
			//testing this:
			thHome = false;
			rhoHome = false;
			console.log("setting homes false here");

      /////////////////////
      if (thHome && rhoHome) {
        logEvent(1, "DEAD RECKONING Home Successful");
				console.log("DEAD RECKONING Home Successful");
        this._sensored = false;
        this._home_next = false;
				this.current_state.set({state: "waiting", is_homed: "true", _end_rho: 0});

        // play next track as intended
        if (self.current_state.get('active_track').id != "false") {
					logEvent(1, "Force next track, start Rho: ", self.current_state.get('_end_rho'));
					self._play_given_track(self.current_state.get('active_track'), null);
				} else {
					logEvent(1, "No Next Track", self.current_state.get('active_track'));
				}

        // send callback to UI
        if (cb)	cb(null, this.current_state.toJSON());
      } else {
        this._sensored = true; // force sensored home

/*****/	this._moved_out = true; // inelegant way to get rid of move out (for now)

        if (this._moved_out) {
					console.log("not at home after DR, doing sensored...");
          self.plotter.home();
          this._moved_out = false;
        } else {
          this._moved_out = true; // call plotter.home() next time instead
          this._home_next = true; // home again after this outward movement
          var track_obj = {
            verts: [{th:0,r:0}],
            vel: 1,
            accel: 0.5,
            thvmax: 0.5
          };
          if (thHome == true) {
            logEvent(1, "Homing... Fix theta and rho");
            track_obj.verts.push({th:self.config.auto_home_th, r:self.config.auto_home_rho});
          } else {
            logEvent(1, "Homing... Fix rho");
            track_obj.verts.push({th:0, r:self.config.auto_home_rho});
          }
          self.plotter.playTrack(track_obj);
        }
        if (cb)	cb(null, this.current_state.toJSON());
      }
    } else if (cb) cb('No Connection', null);
  },
	add_playlist: function(data, cb) {
		logEvent(1, "Sisbot Add Playlist", data);

		// save playlist
		var new_playlist = new Playlist(data);
		var playlist = this.collection.add(new_playlist, {merge: true});
		playlist.collection = this.collection;
		playlist.config = this.config;
		playlist.set_shuffle({ is_shuffle: playlist.get('is_shuffle') }); // update sorted list, tracks objects

		// add to current_state
		var playlists = this.current_state.get("playlist_ids");
		if (playlists.indexOf(playlist.get("id")) < 0) {
			playlists.push(playlist.get("id"));
			this.current_state.set("playlist_ids", playlists);
		}

		this.save(null, null);

		if (cb) cb(null, [playlist.toJSON(), this.current_state.toJSON()]); // send back current_state and the playlist

		// tell all connected devices
		self.socket_update([playlist.toJSON(), this.current_state.toJSON()]);
	},
	remove_playlist: function(data, cb) {
		if (data.type != 'playlist') {
			if (cb) cb("Wrong data type", null);
			return logEvent(2, "Remove Playlist sent wrong data type", data.type);
		}

		logEvent(1, "Sisbot Remove Playlist", data);

		// remove from collection
		this.collection.remove(data.id);

		// remove from current_state
		var playlists = this.current_state.get("playlist_ids");
		var clean_playlists = [];
		_.each(playlists, function(playlist_id) {
			if (playlist_id != data.id) clean_playlists.push(playlist_id);
		});
		this.current_state.set("playlist_ids", clean_playlists);

		this.save(null, null);

		if (cb) cb(null, this.current_state.toJSON());
	},
	add_track: function(data, cb) {
		var self = this;
		logEvent(1, "Sisbot Add Track", data.id, data.name);

		// pull out coordinates
		var verts = data.verts;
		if (verts == undefined || verts == "") {
			logEvent(2, "No verts given", data.id, data.name);
			if (cb) return cb('No verts given for '+data.name, null);
			else return;
		}
		delete data.verts;

		// save playlist
		var new_track = new Track(data);
		var new_verts = new_track.get_verts_from_data(verts); // so our first/last rho are forced correct

		if (new_verts.length < 1) {
			logEvent(2, "Incorrect verts given", data.id, data.name);
			if (cb) return cb('Incorrect verts given for '+data.name, null);
			else return;
		}

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

			self.save(null, null);

			var generate_first = (self._thumbnail_queue.length <= 0);

			// generate three sizes
			self._thumbnail_queue.push({ id: data.id, dimensions: 400 });
			self._thumbnail_queue.push({ id: data.id, dimensions: 100 });
			self._thumbnail_queue.push({ id: data.id, dimensions: 50 });

			// generate thumbnail now, if first (and only) in queue
			if (generate_first) {
				self.thumbnail_generate(self._thumbnail_queue[0], function(err, resp) {
					// send back current_state and the track
					if (cb) cb(null, [track.toJSON(), self.current_state.toJSON()]);

					// tell all connected devices
					self.socket_update([track.toJSON(), self.current_state.toJSON()]);
				});
			} else {
				if (cb) cb(null, [track.toJSON(), self.current_state.toJSON()]); // send back current_state without track
			}
		});
    },
    /*********************** UPLOAD TRACK TO CLOUD ************************/
    get_track_verts: function(data, cb) {
        logEvent(1, 'track verts', data, cb);
        fs.readFile(this.config.base_dir + '/' + this.config.folders.sisbot + '/' + this.config.folders.content + '/' + this.config.folders.tracks + '/' + data.id + '.thr', 'utf-8', function(err, data) {
            if (cb) cb(err, data); // send back track verts
        });
    },
    remove_track: function(data, cb) {
		if (data.type != 'track') {
			if (cb) cb("Wrong data type", null);
			return logEvent(2, "Remove Track sent wrong data type", data.type);
		}

		var self = this;
        logEvent(1, "Sisbot Remove Track", data);

        // remove from collection
        this.collection.remove(data.id);

        // remove from current_state
        var all_tracks = this.current_state.get("track_ids");
        var clean_tracks = [];
        _.each(all_tracks, function(track_id) {
            if (track_id != data.id) clean_tracks.push(track_id);
        });
        this.current_state.set("track_ids", clean_tracks);

    		// remove from playlists
    		var playlists = this.current_state.get("playlist_ids");
    		var return_objs = [];
    		_.each(playlists, function(playlist_id) {
    			var playlist = self.collection.get(playlist_id);
    			var did_remove = false;

    			var tracks = playlist.get("tracks");
    	        var clean_tracks = [];
    			// remove all instances of the track_id
    			_.each(tracks, function(track_obj) {
    				if (track_obj.id != data.id) clean_tracks.push(track_obj);
    				else did_remove = true;
    			});

    			if (did_remove) {
    		        playlist.set("tracks", clean_tracks);

    				// fix the sorted order, or just reshuffle
    				playlist.set_shuffle({ is_shuffle: playlist.get('is_shuffle') });

    				return_objs.push(playlist.toJSON());
    			}
    		});

    		// add sisbot_state
    		return_objs.push(this.current_state.toJSON());

        this.save(null, null);

        if (cb) cb(null, return_objs);
    },
    /*********************** GENERATE THUMBNAILS ******************************/
	_regenerate_thumbnails: function(data, cb) {
		var self = this;

		function gen_next_track() {
			if (all_tracks.length > 0)
				self.thumbnail_generate({id: all_tracks.pop()}, gen_next_track);
			else
				if (cb) cb(null, "Complete");
		}

		var all_tracks = this.current_state.get("track_ids");
		if (all_tracks.length > 0)
			self.thumbnail_generate({id: all_tracks.pop()}, gen_next_track);
	},
	thumbnail_preview_generate: function(data, cb) {
		logEvent(1, "Thumbnail preview", data.name);

        var self = this;

		// add to front of queue
		if (self._thumbnail_queue.length == 0) self._thumbnail_queue.push(data);
		else {
			if (cb) data.cb = cb;
			self._thumbnail_queue.splice(1, 0, data);
		}

		if (self._thumbnail_queue.length == 1) {
			self.thumbnail_generate(self._thumbnail_queue[0], function(err, resp) {
				// send back current_state and the track
				if (cb) cb(null, { 'id':data.id });
			});
		} else {
		    logEvent(1, "Thumbnails queue", self._thumbnail_queue.length);
			// if (cb) cb(null, null);
		}
	},
  thumbnail_generate: function(data, cb) {
		logEvent(1, "Thumbnail generate", data.id);
        // @id
        var self = this;
		var coordinates = [];

		if (data.id != 'preview') {
			var track = this.collection.get(data.id);
			coordinates = track.get_verts();
		} else {
			var temp_track = new Track(data);
			coordinates = temp_track.get_verts_from_data(data.raw_coors);
		}

		// reduce coordinates if too long
		logEvent(1, "Given Points:", coordinates.length, "Max:", self.config.max_thumbnail_points);
		if (coordinates.length > self.config.max_thumbnail_points) {
			var total_count = coordinates.length;
			var remove_every = Math.ceil(1/(self.config.max_thumbnail_points/coordinates.length));
			for (var i=total_count-2-remove_every; i > 1; i -= remove_every) {
				coordinates.splice(i+1, remove_every-1);
			}
		}
		logEvent(1, "Total Points: ", coordinates.length);

		data.raw_coors = '';
		_.each(coordinates, function(obj) {
			data.raw_coors += obj.th+' '+obj.r+'\n';
		});

		self._thumbnails_generate(data, function(err, resp) {
            if (err) {
				if (cb) cb(cb_err, null);
			}

			if (cb) cb(null, { id: data.id, dimensions: data.dimensions }); // don't send back verts

			self._thumbnail_queue.shift(); // remove first in queue
			if (self._thumbnail_queue.length > 0) {
				logEvent(1, "Generate thumbnails left", self._thumbnail_queue.length);
				// generate next thumbnail in _thumbnail_queue
				self.thumbnail_generate(self._thumbnail_queue[0], null);
			} else {
				logEvent(1, "All thumbnails generated");
			}
        });
    },
    _thumbnails_generate: function(data, cb) {
        // id, host_url, raw_coors, dimensions

        var thumbs_dir = this.config.base_dir + '/' + this.config.folders.cloud + '/img/tracks';
        var thumbs_file = thumbs_dir + '/' + data.id + '_' + data.dimensions + '.png';

        var opts = {
            siteType: 'html',
            renderDelay: 2500,
            captureSelector: '.print',
            screenSize: {
                width: data.dimensions + 16,
                height: data.dimensions
            },
            phantomPath: '/home/pi/phantomjs/bin/phantomjs',
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_4) AppleWebKit/600.7.12 (KHTML, like Gecko) Version/8.0.7 Safari/600.7.12',
            shotSize: {
                width: 'window',
                height: 'window'
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

        logEvent(1, '#### MAKE WEBSHOT', thumbs_file, base_url);

        webshot(html, thumbs_file, opts, function(err) {
	        logEvent(1, '#### WEBSHOT FINISHED', thumbs_file, err);
			if (data.cb) data.cb(err, { 'id':data.id });
            if (cb) cb(err, null);
        });
    },
    /*********************** PLAYLIST *****************************************/
	set_playlist: function(data, cb) {
		logEvent(1, "Sisbot Set Playlist", data);

		if (data == undefined || data == null) {
			logEvent(1, "No Playlist given");
			if (cb) cb('No playlist', null);
			return;
		}

		var do_save = true;
		if (data.skip_save) {
			do_save = false;
			delete data.skip_save;
		}

		// check if we are shuffled, and need to grab track from next_tracks
		if (data.is_shuffle && data.is_current && do_save) { // skip_save is used on bootup, don't pull from next tracks in that case
			var current_playlist = this.collection.get(this.current_state.get('active_playlist_id'));
			if (current_playlist != undefined && current_playlist.id == data.id && current_playlist.get('is_shuffle') == data.is_shuffle) {
				// compare active_track_index to given index
				if (current_playlist.get('active_track_index') >= data.active_track_index) {
					// logEvent(1, "Grab track from next_tracks", current_playlist.get('active_track_index'));
					var sorted_tracks = current_playlist.get('next_tracks');

					// reset randomized tracks
					var next_tracks = current_playlist._randomize({
						start_index: sorted_tracks[sorted_tracks.length-1]
					});

					data.sorted_tracks = sorted_tracks;
					data.next_tracks = next_tracks;
				}
			}
		}

		// save playlist
		var new_playlist = new Playlist(data);
		//if (data.is_current) new_playlist.unset("sorted_tracks"); // so we don't overwrite the old random list
		var playlist = this.collection.add(new_playlist, {merge: true});
		playlist.collection = this.collection;
		playlist.config = this.config;
		if (data.is_shuffle && !data.is_current) playlist.set_shuffle({ is_shuffle: data.is_shuffle });

		// clean playlist tracks
		if (!data.is_shuffle) {
			var active_index = data.active_track_index;
			playlist.set('active_track_index', -1); // allow this track to start at 1, if it is supposed to
			playlist._update_tracks();
			playlist.set('active_track_index', active_index);
		}

		// update current_state
		this.current_state.set({
			is_homed: "false",
			active_playlist_id: data.id,
			active_track: playlist.get_current_track(),
			is_shuffle: data.is_shuffle,
			is_loop: data.is_loop,
			is_waiting_between_tracks: "false"
		});
		logEvent(1, "Current track", this.current_state.get('active_track'));
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

		// tell sockets
		this.socket_update([playlist.toJSON(), this.current_state.toJSON()]);
		if (do_save) this.save(null, null);

		if (cb)	cb(null, playlist.toJSON());
	},
	set_track: function(data, cb) {
		if (data == undefined || data == null) {
			logEvent(2, "Sisbot Set Track: No Track given");
			if (cb) cb('No track', null);
			return;
		}
		logEvent(1, "Sisbot Set Track", data.name, data.firstR, data.lastR);

    // make sure verts are not a part of this
    if (data.verts) delete data.verts;

		var new_track = new Track(data);
		var track = this.collection.add(new_track, {merge: true});
		track.collection = this.collection;
		track.config = this.config;

		// don't change, this is already playing
		if (track.get('id') == this.current_state.get("active_track").id && this.current_state.get('state') == "playing") {
			if (cb) return cb('already playing', null);
			else return;
		}

		// make sure track firstR/lastR are not -1
		if (track.get('firstR') < 0 || track.get('lastR') < 0) track.get_verts();

		// update current_state
		this.current_state.set({
			is_homed: "false",
			active_playlist_id: "false",
			active_track: track.toJSON(),
			is_shuffle: "false",
			is_loop: "true",
			is_waiting_between_tracks: "false"
		});
		if (this.current_state.get('state') == "playing") {
			plotter.pause();
			this._home_next = true;
		} else if (this.current_state.get('state') == "waiting" || this.current_state.get('state') == "paused") {
			this._autoplay = true;
			this._play_track(track.toJSON(), null);
		}

		// this.socket_update(this.current_state.toJSON());
		this.save(null, null);

		if (cb)	cb(null, [this.current_state.toJSON(), track.toJSON()]);
	},
	_play_track: function(data, cb) {
		var self = this;
		logEvent(1, "Sisbot Play Track", data.name, "r:"+data.firstR+data.lastR, "reversed:", data.reversed, "Table R:", self.current_state.get('_end_rho'), this.current_state.get('state'));
		if (data == undefined || data == null || data == "false") {
			logEvent(2, "No Track given");
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
						var track_obj = track.get_plotter_obj(data, self.config.auto_track_start_rho);
						if (track_obj != "false") {
							this._paused = false;

              // compare to be sure we can start this track
              if (self.current_state.get('_end_rho') !== track_obj.firstR) {
                logEvent(1, "Track mismatch, move to start rho", track_obj.firstR);
                this._play_given_track(track_obj, null);
              } else {
  							this.plotter.playTrack(track_obj);
  							this.current_state.set('_end_rho', track_obj.lastR); // pull from track_obj

  							this.save(null, null);
              }

              self.socket_update([track.toJSON(),self.current_state.toJSON()]);
							if (cb)	cb(null, [track.toJSON(),self.current_state.toJSON()]);
						} else {
							logEvent(2, "Continuous play not possible, skip this");

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
  _play_given_track: function(data, cb) { // play the track, and force move to its start rho if needed
    var self = this;
    var track = data;
    if (track == undefined) return logEvent(2, "No Given Track");
    var move_to_rho = false; // do we even need to?

    // if (self.current_state.get("active_playlist_id") == "false") {
    if (track.firstR != undefined && track.firstR != self.current_state.get('_end_rho')) move_to_rho = track.firstR;
    // }
    // move to start rho
    if (move_to_rho !== false) {
      var track_obj = {
        verts: [{th:0,r:plotter.getRhoPosition()},{th:self.config.auto_th,r:move_to_rho}],
        vel: 1,
        accel: 0.5,
        thvmax: 0.5
      };
      self._paused = false;
      self.plotter.playTrack(track_obj);
      self.current_state.set({_end_rho: move_to_rho, repeat_current: 'true'}); // pull from track_obj
      // self._move_to_rho = move_to_rho;
    } else {
      self._play_track(track, null);
    }

    if (cb) cb(null, self.current_state.toJSON());
  },
	play_next_track: function(data, cb) {
		logEvent(1, "Sisbot Play Next Track", data);
		var self = this;
		if (this.current_state.get('active_playlist_id') == "false") {
			logEvent(2, "No Playlist");
			if (cb) cb('No playlist', null);
			return;
		}
		if (this.current_state.get('state') == "homing") {
			if (cb) return cb('Currently homing...', null);
			else return;
		}
		if (this.current_state.get('active_playlist_id') == "false") logEvent(2, "There is no selected playlist");
		var playlist = this.collection.get(this.current_state.get('active_playlist_id'));
		if (playlist != undefined) {
			this._autoplay = true; // make it play, even if a home is needed after homing
			if (this.current_state.get("is_homed") == "true") {
				var track = playlist.get_next_track({ start_rho: self.current_state.get('_end_rho') });
				if (track != "false")	{
          this.current_state.set('active_track', track); // make sure UI is up-to-date
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
		logEvent(1, "Sisbot state", return_objs);

		if (cb) cb(null, this.current_state.toJSON());
	},
	_clamp: function(value, min, max) {
		var return_value = value;
		if (return_value < min) return_value = min;
		if (return_value > max) return_value = max;
		return return_value;
	},
	set_loop: function(data, cb) {
		logEvent(1, "Sisbot set loop", data);

		this.current_state.set('is_loop', data.value);

		var active_playlist_id = this.current_state.get('active_playlist_id');
		if (active_playlist_id != "false") {
			var playlist = this.collection.get(active_playlist_id);
			playlist.set_loop(data.value);

			if (cb) cb(null, [playlist.toJSON(), this.current_state.toJSON()]);
		} else {
			if (cb) cb('No current playlist, no change', null);
		}

		this.save(null, null);
	},
	set_shuffle: function(data, cb) {
		logEvent(1, "Sisbot set shuffle", data);
		var active_playlist_id = this.current_state.get('active_playlist_id');
		if (active_playlist_id != "false") {
			var playlist = this.collection.get(active_playlist_id);
			playlist.set_shuffle({ is_shuffle: data.value });
			this.current_state.set('is_shuffle', data.value);

			this.save(null, null);

			if (cb) cb(null, [playlist.toJSON(), this.current_state.toJSON()]);
		} else {
			if (cb) cb('No current playlist, no change', null);
		}
	},
	set_speed: function(data, cb) {
		var percent = this._clamp(+data.value, 0.0, 1.0); // 0.0-1.0f
		var speed = this.config.min_speed + percent * (this.config.max_speed - this.config.min_speed);
		logEvent(1, "Sisbot Set Speed", speed);
    	plotter.setSpeed(speed);
		this.current_state.set('speed', percent);

		this.save(null, null);

		if (cb)	cb(null, this.current_state.toJSON());
	},
	set_autodim: function(data, cb) {
		logEvent(1, 'Sisbot set autodim', data);

		this.current_state.set('is_autodim', data.value);
		plotter.setAutodim(data.value);// notify plotter of autodim setting

		this.set_brightness({ value: this.current_state.get("brightness") });

		this.save(null, null);

		if (cb)	cb(null, this.current_state.toJSON());
	},
	set_brightness: function(data, cb) {
		logEvent(1, 'Sisbot set brightness', data);

    	// Don't continue if we're disconnected from the sisbot
    	if (!this._validateConnection()) {
			if (cb) return cb('No Connection', null);
			else return;
		}

		var value = this._clamp(+data.value, 0.0, 1.0);
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

		if (cb)	cb(null, this.current_state.toJSON());
	},
	set_pause_between_tracks: function(data, cb) {
		// { is_paused_between_tracks: "true" }
		logEvent(1, 'Sisbot set pause between tracks', data);

		this.current_state.set('is_paused_between_tracks', data.is_paused_between_tracks);

		this.save(null, null);

		if (cb)	cb(null, this.current_state.toJSON());
	},
	set_share_log_files: function(data, cb) {
		logEvent(1, 'Sisbot set share log files', data);

		// toggle on/off ansible if different
		if (data.value != this.current_state.get('share_log_files')) {
			if (data.value == 'true') {
				if (this.current_state.get('is_internet_connected') == 'true') this._setupAnsible();
			} else this._teardownAnsible();
		}

		this.current_state.set('share_log_files', data.value);

		if (cb)	cb(null, this.current_state.toJSON());
	},
	/* --------------- WIFI ---------------------*/
	_validate_internet: function(data, cb) {
		//logEvent(1, "Sisbot validate internet");
		var self = this;
		exec('ping -c 1 -W 2 google.com', (error, stdout, stderr) => {
			//if (error) return console.error('exec error:',error);

			var returnValue = "false";
			if (stdout.indexOf("1 packets transmitted") > -1) returnValue = "true";
			// logEvent(1, 'stdout:', stdout);
			// logEvent(1, 'stderr:', stderr);

			logEvent(1, "Internet Connected Check", returnValue, self.current_state.get("local_ip"));

			// if (self.current_state.get("is_internet_connected") != returnValue) {
				// change hotspot status
				// if (self.current_state.get("local_ip") == "192.168.42.1") {
				// 	self.current_state.set("is_hotspot", "true");
				// } else {
				// 	self.current_state.set("is_hotspot", "false");
				// }
			// }

			// make sure connected to remote
			if (returnValue == "true" && self.current_state.get("share_log_files") == "true") self._setupAnsible();

			// update values
			self.current_state.set({
				is_internet_connected: returnValue,
				local_ip: self._getIPAddress()
			});

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
					if (err) return logEvent(2, "Internet check err", err);
					if (resp == "true") {
						logEvent(1, "Internet connected.",self.current_state.get("is_internet_connected"));
            append_log('Internet connected: ' + self.current_state.get("is_internet_connected"));

      			self._changing_to_wifi = false;
						self.current_state.set({
							is_available: "true",
							failed_to_connect_to_wifi: "false",
							wifi_forget: "false",
						 	wifi_error: "false"
						});
						// leave current state alone if fault
						if (self.current_state.get('reason_unavailable').indexOf('_fault') < 0) {
							self.current_state.set("reason_unavailable", "false");
						}
						self._internet_retries = 0; // successful, reset

						self.save(null, null);

						// check again later
						self._query_internet(self.config.check_internet_interval);

						self.socket_update(self.current_state.toJSON());

						// TODO: only post if IP address changed
                        self._post_state_to_cloud();
					} else {
						self._internet_retries++;
						if (self._internet_retries < self.config.internet_retries) {
                            append_log('Internet retry: ' + self.config.retry_internet_interval);
							self._query_internet(self.config.retry_internet_interval);
						} else {
							logEvent(2, "Internet not connected, reverting to hotspot.");
                            append_log('Internet not connected, reverting to hotspot: ');
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

        // logEvent(1, 'LETS TRY AND GET TO CLOUD', this.current_state.toJSON());
		var state = this.current_state.toJSON();
		delete state.wifi_password;
		delete state.wifi_network;

        request.post('https://api.sisyphus.withease.io/sisbot_state/' + this.current_state.id, {
                form: {
                    data: state
                }
            },
            function on_resp(error, response, body) {
                if (!error && response.statusCode == 200) {
                    logEvent(1, "Post to cloud", body);
                } else {
                    if (response) logEvent(2, "Request Not found:", response.statusCode);
                }
            }
        );
    },
	get_wifi: function(data, cb) {
		logEvent(1, "Sisbot get wifi", data);
		iwlist.scan(data, cb);
	},
	connect_to_wifi: function(data, cb) {
		// forward to old connection endpoint
		this.current_state.set({ wifi_forget: "true" });
		this.change_to_wifi(data, cb);
	},
	change_to_wifi: function(data, cb) {
		var self = this;
		logEvent(1, "Sisbot change to wifi", data.ssid);
		if (data.ssid == undefined || data.ssid == "" || data.ssid == "false") {
			if (cb) cb("No network name given", null);
		} else if (data.psk && (data.psk == "" || data.psk.length >= 8)) {
			clearTimeout(this._internet_check);
  		this._changing_to_wifi = true;
			this._internet_retries = 0; // clear retry count

			// Make sure password is valid
			// ValidPasswordRegex = new RegExp("^([^\s\"]{8,64})$");
			if (/^([^\r\n"]{8,64})$/g.test(data.psk)) {
				self.current_state.set({
					is_available: "false",
          reason_unavailable: "connect_to_wifi",
					wifi_network: data.ssid,
					wifi_password: data.psk,
					is_hotspot: "false",
					failed_to_connect_to_wifi: "false",
					is_internet_connected: "true"
				});

				// logEvent(1, "New State:", self.current_state.toJSON());
				self.save(null, null);

				if (cb) cb(null, self.current_state.toJSON());

				// disconnect all socket connections first
				self.socket_update("disconnect");

				logEvent(1, "Connect To Wifi", data.ssid);

                setTimeout(function () {
                    exec('sudo /home/pi/sisbot-server/sisbot/stop_hotspot.sh "'+data.ssid+'" "'+data.psk+'"', (error, stdout, stderr) => {
    					if (error) return console.error('exec error:',error);
    				});
                }, 100);

				self._query_internet(8000); // check again in 8 seconds
			} else if (cb) {
				logEvent(2, "Invalid Password", data.psk);
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
		logEvent(1, "Sisbot Stop Wifi Reminder", data);
		this.current_state.set("do_not_remind", "true");
		if (cb) cb(null, this.current_state.toJSON());
	},
	disconnect_wifi: function(data, cb) {
		// This will remove old network/password
		this.current_state.set({
			wifi_network: "false",
			wifi_password: "false",
			wifi_error: "false",
			is_internet_connected: "false",
			reason_unavailable: "disconnect_from_wifi"
		});

		// make sure we don't throw an error, we wanted to disconnect
		this._changing_to_wifi = false;

		// this.save(null, null);

		this.reset_to_hotspot(data, cb);
	},
	reset_to_hotspot: function(data, cb) {
		// This won't remove old network/password, so we can try reconnecting again later
		// Use disconnect_wifi if you want to remove old network/password
		var self = this;
		logEvent(1, "Sisbot Reset to Hotspot", data);
        append_log('Sisbot Reset to Hotspot: ' + JSON.stringify(data));
		clearTimeout(this._internet_check);
		this._internet_retries = 0; // clear retry count

		this.current_state.set({
			is_available: "false",
			reason_unavailable: "reset_to_hotspot",
			is_hotspot: "true",
			is_internet_connected: "false"
		});

		// forget bad network values (from cloud)
		if (this.current_state.get('wifi_forget') == 'true') {
			this.current_state.set({
				wifi_network: "false",
				wifi_password: "false",
				wifi_error: "false", // not an error to remember
				wifi_forget: "false"
			});
		}

		if (cb) cb(null, this.current_state.toJSON());

		// disconnect all socket connections first
		this.socket_update("disconnect");

		// disconnect Ansible
		this._teardownAnsible();

		logEvent(1, "Start_hotspot");
		exec('sudo /home/pi/sisbot-server/sisbot/start_hotspot.sh', (error, stdout, stderr) => {
			if (error) return logEvent(2, 'exec error:',error);
			logEvent(1, "start_hotspot", stdout);
            append_log('Start Hotspot: ' + stdout);

            var new_state = {
                is_available: "true",
                reason_unavailable: "false",
                local_ip: self._getIPAddress(),
                failed_to_connect_to_wifi: (self._changing_to_wifi == true) ? 'true' : 'false'
            };

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
				logEvent(2, "Wifi list error:", err);

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
						logEvent(1, "Found Network", wifi_network, "try to connect");
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
	/* ------------- Onboarding ---------------- */
	onboard_complete(data, cb) {
		var self = this;
		logEvent(1, "Onboard Complete", data);

		// update cron jobs (includes save)
		this.set_sleep_time(data, null);

		// change hostname?
		var change_hostname = false;
		if (data.name != this.current_state.get('name')) {
			// fix hostname
			var regex = /^[^a-zA-Z]*/; // make sure first character is a-z
			var regex2 = /[^0-9a-zA-Z\-]+/g; // greedy remove all non alpha-numerical or dash chars
			this._hostname_queue = { hostname: data.name.replace(regex,"").replace(regex2,"") };
			change_hostname = true;
		}

		// save given data
		this.current_state.set(data);

		if (change_hostname) this.set_hostname(this._hostname_queue, cb);
		else if (cb) cb(null, this.current_state.toJSON());
	},
	/* ------------- Sleep Timer ---------------- */
	set_sleep_time: function(data, cb) {
		var self = this;
		logEvent(1, "Set Sleep Time:", data.sleep_time, data.wake_time, data.timezone_offset, this.current_state.get('is_sleeping'));

		// cancel old timers
		if (this.sleep_timer != null) {
			this.sleep_timer.cancel();
			this.sleep_timer = null;
		}
		if (this.wake_timer != null) {
			this.wake_timer.cancel();
			this.wake_timer = null;
		}

		// set timer
		if (data.sleep_time != "false") {
			var sleep = moment(data.sleep_time+' '+data.timezone_offset, 'H:mm A Z');
			var cron = sleep.minute()+" "+sleep.hour()+" * * *";
			logEvent(1, "Sleep", sleep.format('mm HH'), cron);

			this.sleep_timer = scheduler.scheduleJob(cron, function(){
				self.sleep_sisbot(null, null);
			});
		}
		if (data.wake_time != "false") {
			var wake = moment(data.wake_time+' '+data.timezone_offset, 'H:mm A Z');
			var cron = wake.minute()+" "+wake.hour()+" * * *";
			logEvent(1, "Wake", wake.format('mm HH'), cron);

			this.wake_timer = scheduler.scheduleJob(cron, function(){
				self.wake_sisbot(null, null);
			});
		}

		// save to state
		this.current_state.set({
			sleep_time: data.sleep_time,
			wake_time: data.wake_time,
			timezone_offset: data.timezone_offset,
			is_nightlight: data.is_nightlight,
			nightlight_brightness: data.nightlight_brightness
		});

		this.save(null, null);

		if (cb) cb(null, this.current_state.toJSON());
	},
	wake_sisbot: function(data, cb) {
		logEvent(1, "Wake Sisbot", this.current_state.get('is_sleeping'));
		if (this.current_state.get('is_sleeping') != 'false') {
			// turn lights back on
			this.set_autodim({value: this.current_state.get('_is_autodim')}, null);
			this.set_brightness({value: this.current_state.get('_brightness')}, null); // reset to remembered value

			// play track
			this.play(null, null);

			this.current_state.set('is_sleeping', 'false');

			this.socket_update(this.current_state.toJSON());
		}
		if (cb) cb(null, this.current_state.toJSON());
	},
	sleep_sisbot: function(data, cb) {
		logEvent(1, "Sleep Sisbot", this.current_state.get('is_sleeping'));
		if (this.current_state.get('is_sleeping') == 'false') {
			// fade lights out
			this.current_state.set('_is_autodim', this.current_state.get('is_autodim')); // remember, so wake resets it
			this.current_state.set('_brightness', this.current_state.get('brightness')); // remember, so wake resets it

			if (this.current_state.get('is_nightlight') == 'true') {
				this.set_autodim({value: 'false'}, null);
				this.set_brightness({value: this.current_state.get('nightlight_brightness')}, null);
			} else this.set_brightness({value: 0}, null);

			// pause track
			this.pause(null, null);

			this.current_state.set('is_sleeping', 'true');

			this.socket_update(this.current_state.toJSON());
		}
		if (cb) cb(null, this.current_state.toJSON());
	},
	/* ------------------------------------------ */
	get_log_file: function(data, cb) {
		logEvent(1, "Get log file", data);
		if (this.config.folders.logs) {
			if (/([.]{2}\/)/g.test(data.filename)) { // make sure we are not trying to leave the folder
				if (cb) cb('Invalid characters', null);
			} else if (fs.existsSync(this.config.folders.logs+data.filename.toLowerCase()+'.log')) {
				logEvent(1, "Get log file", data.filename);
				var file = fs.readFileSync(this.config.folders.logs+data.filename.toLowerCase()+'.log', 'utf8');

				// append current proxy, if PROXY
				if (data.filename.toLowerCase().indexOf('proxy') > -1 && data.date === moment().format('MM/DD/YYYY'))
					file += fs.readFileSync(this.config.folders.logs+'proxy.log', 'utf8');

				if (cb) cb(null, file);
			} else if (data.filename.toLowerCase().indexOf('proxy') > -1) {
				// send proxy log
				logEvent(1, "Get log file", 'proxy.log');
				var file = fs.readFileSync(this.config.folders.logs+'proxy.log', 'utf8');
				if (cb) cb(null, file);
			} else {
				if (cb) cb('Log not available', null);
			}
		} else if (cb) cb('No logs found', null);
	},
	/* ------------------------------------------ */
	install_updates: function(data, cb) {
		var self = this;
		logEvent(1, "Sisbot Install Updates", data);
		if (this.current_state.get("is_internet_connected") != "true") {
			if (cb) cb("Not connected to internet", null);
			return logEvent(2, "Install error: not connected to internet");
		}

		this.current_state.set('installing_updates','true');
		this.pause(null, null);

		// send response first
		if (cb) cb(null, this.current_state.toJSON());

		exec('/home/pi/sisbot-server/sisbot/update.sh '+this.config.service_branches.sisbot+' '+this.config.service_branches.app+' '+this.config.service_branches.proxy+' false > /home/pi/sisbot-server/update.log', (error, stdout, stderr) => {
			self.current_state.set({installing_updates: 'false'});
		  	if (error) {
				// if (cb) cb(error, null);
				return logEvent(2, 'exec error:',error);
			}
			logEvent(1, "Install complete");

			self.save(null, null);

			self.reboot(null,null);
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
		logEvent(1, "Local address", local);

		// return array of IP addresses (not including self)
		var i=2;
		function loop_cb(err,resp) {
			if (err && err != "Not found") logEvent(2, "Err,",err);
			if (resp) {
				logEvent(1, "Sisbot found:", resp);
				sisbots.push(resp);
			}
			i++;
			if (i<255) {
				self._check_sisbot({local:local, i:i}, loop_cb);
			} else {
				logEvent(1, "Other sisbots found:", _.pluck(sisbots,"local_ip"));
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
		  logEvent(1, this._host+' responded.');
			request.post(
			    'http://'+address+'/sisbot/exists',
			    { },
			    function (error, response, body) {
		        if (!error && response.statusCode == 200) {
					logEvent(1, "Request Exists:", response, body);
		            if (cb) cb(null, body);
			        } else {
						if (response) logEvent(2, "Request Not found:", response.statusCode);
						if (cb) cb("Not found", null);
					}
			    }
			);
		});
		ping.send(); // or ping.start();
	},
	factory_reset: function(data, cb) {
		logEvent(1, "Sisbot Factory Reset", data);
		this.current_state.set({is_available: "false", reason_unavailable: "resetting"});
		if (cb) cb(null, this.current_state.toJSON());
		var ls = spawn('./factory_reset.sh',[],{cwd:"/home/pi/sisbot-server/",detached:true,stdio:'ignore'});
		ls.on('error', (err) => {
			logEvent(2, 'Failed to start child process.');
		});
		ls.on('close', (code) => {
			logEvent(1, "child process exited with code",code);
		});
	},
	restart: function(data,cb) {
		logEvent(1, "Sisbot Restart", data);
		this.current_state.set({is_available: "false", reason_unavailable: "restarting"});
		if (cb) cb(null, this.current_state.toJSON());
		var ls = spawn('./restart.sh',[],{cwd:"/home/pi/sisbot-server/sisbot/",detached:true,stdio:'ignore'});
		ls.on('error', (err) => {
		  logEvent(2, 'Failed to start child process.');
		});
		ls.on('close', (code) => {
		  logEvent(1, "child process exited with code",code);
		});
	},
	reboot: function(data,cb) {
		logEvent(1, "Sisbot Reboot", data);
		this.current_state.set({is_available: "false", reason_unavailable: "rebooting"});
		this.socket_update(this.current_state.toJSON());

		if (cb) cb(null, this.current_state.toJSON());

		// disconnect all socket connections first
		this.socket_update("disconnect");

		setTimeout(function() {
			exec('sudo reboot', (error, stdout, stderr) => {
			  if (error) return logEvent(2, 'exec error:',error);
			});
		}, 500);
	}
};

var logEvent = function() {
	// save to the log file for sisbot
	if (sisbot.config.folders.logs) {
		var filename = sisbot.config.folders.logs + '/' + moment().format('YYYYMMDD') + '_sisbot.log';
		// var filename = '/var/log/sisyphus/' + moment().format('YYYYMMDD') + '_sisbot.log';

		var line = moment().format('YYYYMMDD HH:mm:ss Z');
		_.each(arguments, function(obj, index) {
			if (_.isObject(obj)) line += "\t"+JSON.stringify(obj);
			else line += "\t"+obj;
		});

		fs.appendFile(filename, line + '\n', function(err, resp) {
		  if (err) console.log("Log err", err);
		});

    // redline errors
    if (arguments[0] == 2 || arguments[0] == '2') line = '\x1b[31m'+line+'\x1b[0m';
		console.log(line); // !! comment out in master !!
	} else console.log(arguments);
}

var append_log = function(line) {
    // fs.appendFile('travis.log' , line, function (err) {
    //   if (err) throw err;
    // });
}

module.exports = sisbot;

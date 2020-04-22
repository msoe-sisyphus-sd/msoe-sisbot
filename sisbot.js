var os 			= require('os');
var _ 			= require('underscore');
var exec 		= require('child_process').exec;
var spawn 		= require('child_process').spawn;
var CSON 		= require('cson');
var fs 			= require('fs');
var iw 		   = require('./iw');
var uuid 		= require('uuid');
var Backbone 	= require('backbone');
var Ping 		= require('ping-lite');
var request 	= require('request');
var webshot 	= require('webshot');
var util 		= require('util');
var scheduler 	= null; //require('node-schedule');
var bleno 		= require('bleno');
var io 			= require('socket.io');
var moment 		= require('moment');
var unix_dg   = require('unix-dgram');
var GPIO      = require('onoff').Gpio;

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
    var self = this;
    var ip_array = ip_address_str.split('.');
    var new_ip = false;
    ip_array.map(function(val, i) {
      if (self.ip_address[i] !== +val) new_ip = true;
    });
    if (new_ip) {
      logEvent(1, 'BLE Updated IP ADDRESS', ip_address_str, ip_array.map(function(i) {
        return +i;
      }));
      this.ip_address = new Buffer(ip_array.map(function(i) {
        return +i;
      }));
    }
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
if (process.env.NODE_ENV.indexOf("dummy") < 0) SerialPort = require('serialport');

var plotter = require('./plotter');
var Sisbot_state = require('./models.sisbot_state');
var Playlist = require('./models.playlist');
var Track = require('./models.track');

var sisbot = {
	config: {},
	ansible: null,
	serial: null,
  lcp_socket: null,
	plotter: plotter,
	socket_update: null,
  py: null, // python process for LEDs

  gpios: {},
  _gpio_timer: null,

  ntp_sync: false, // do we have the correct time?
	sleep_timer: null,
	wake_timer: null,

	collection: new Backbone.Collection(),
	current_state: null,

	connectionErrors: 0,
	error_messages: [],

  isServo: false,
  homeFirst: true,

  led_count: 0,
  led_default_offset: 0,

  _first_home: true, // make sure we do a sensored home on startup
	_paused: false,
  _pause_timestamp: null,
	_play_next: false,
	_autoplay: false,
	_home_next: false,
  _home_requested: false,
  _sensored: true, // use a sensored home
  _home_delay: 0,
	_moved_out: false, // small ball adjustment before homing
	_attach_track: false, // for tables with multiple balls
	_detach_track: false, // for tables with multiple balls
	_detach_first: false, // for tables with multiple balls, after first home
	_move_to_rho: 0,
	_saving: false,

  _thumbnail_playing: false, // was the table playing prior to generating thumbnail?
  _sleep_playing: false, // was the table playing when put to sleep?

  _save_queue: [],
	_thumbnail_queue: [],

  _first_retry: false,
	_network_check: 0,
	_network_retries: 0, // for connecting to known network, cancel after config.wifi_error_retries times
  _internet_lanonly_check: false,
	_changing_to_wifi: false,
	_iw_retries: 0,
  _old_ip: null,

	_hostname_queue: {},
	_hostname_schedule: null,

	init: function(config, session_manager, socket_update) {
		var self = this;
  	this.config = config;
		logEvent(1, "Init Sisbot");

		this.socket_update = socket_update;

    // clean log files if in dev mode
    // if (process.env.NODE_ENV.indexOf('_dev') >= 0) this.clean_log_files(null, null);

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

    this.isServo =  (typeof cson_config.isServo === 'undefined') ? false : cson_config.isServo;
    logEvent(1, "this.isServo: " + this.isServo);
    this.homeFirst = (typeof cson_config.homeFirst === 'undefined') ? true : cson_config.homeFirst;
    logEvent(1, "this.homeFirst: " + this.homeFirst);
    this._autoplay = cson_config.autoplay;
    logEvent(1, "CSON Autoplay", cson_config.autoplay);

    this.pause_play_lockout_msec = (typeof cson_config.pause_play_lockout_msec === 'undefined') ? 3000 : cson_config.pause_play_lockout_msec;

    //var tracks = this.current_state.get("track_ids");
    var tracks = [];
    //var playlists = this.current_state.get("playlist_ids");
    var playlists = [];

    logEvent(1, "looping through loaded state");

		_.each(objs, function(obj) {
			switch (obj.type) {
				case "track":
          var is_2ball = cson_config.twoBallEnabled;
          var is_2ball_track = false;
          logEvent(1,"reading track from state ", obj.name);
          if (obj.name == 'Attach') { is_2ball_track = true; }
          if (obj.name == 'Detach') { is_2ball_track = true; }
          if (obj.id == '2CBDAE96-EC22-48B4-A369-BFC624463C5F') obj.is_deletable = 'false'; // force Erase track to not be deletable
          logEvent(1, "track switch 2ball ", is_2ball , " track_type ", is_2ball_track);

          // fix is_reversible
          try {
            if (!obj.is_reversible && obj.reversible) obj.is_reversible = obj.reversible;
          } catch (err) {
            logEvent(2, "is_reversible error", err);
          }

          if (is_2ball || is_2ball_track == false) {
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

          // fix the created_by_name for original tracks
          try {
            var default_track = _.where(self.config.default_data, {id: obj.id}); // find in default_data

            if (default_track && default_track.length == 1) {
              // fix created_by_name
              var created_by_name = track.get('created_by_name');
              if (!created_by_name || created_by_name == 'false' || created_by_name == 'Sisyphus Industries') {
                if (default_track[0].created_by_name) {
                  logEvent(1, "Default track found, update created_by_name", default_track[0]);
                  track.set('created_by_name', default_track[0].created_by_name);
                }
              }

              // Fix default_vel if different (Erase in particular)
              var default_vel = track.get('default_vel');
              if (default_vel && default_track[0].default_vel && default_vel != default_track[0].default_vel) {
                logEvent(2, "Default track, update default_vel", default_track[0].name, default_track[0].default_vel);
                track.set('default_vel', default_track[0].default_vel);
              }
            }
          } catch (err) {
            logEvent(2, "Created_by_name error", err);
          }

					break;
        case "artist":
          if (obj.tracks) { // mistakenly made as a playlist, fix this
            logEvent(2, "Artist model saved as playlist, fixing...", obj);
            // change to new id, type
            obj.id = uuid();
            obj.type = "playlist";
            var newPlaylist = new Playlist(obj);
  					var playlist = self.collection.add(newPlaylist);
            if (playlists.indexOf(playlist.get("id")) < 0) {
              playlists.push(playlist.get("id"));
            }
          }
          break;
				case "playlist":
          var newPlaylist = new Playlist(obj);
          logEvent(1,"reading in playlist during init " + newPlaylist.get('name'));
          if (newPlaylist.get('name') == "2Ball Demo") {
            logEvent(1,"Found the 2Ball Demo playlist");
            if (cson_config.twoBallEnabled) {
              logEvent(1,"Two ball config, allowed to see this playlist");
              var playlist = self.collection.add(newPlaylist);
              if (playlists.indexOf(playlist.get("id")) < 0) {
                playlists.push(playlist.get("id"));
              }
            }
          } else {
            logEvent(1,"saving playlist to collection " + newPlaylist.get('name'));
  					var playlist = self.collection.add(newPlaylist);
            if (playlists.indexOf(playlist.get("id")) < 0) {
              playlists.push(playlist.get("id"));
            }
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

    // logEvent(1,"setting track_ids to ", tracks);
    this.current_state.set("track_ids", tracks);
    // logEvent(1,"done setting track_ids");
    this.current_state.set("playlist_ids", playlists);

    logEvent(1, "CSON:", config.sisbot_config);
    this.current_state.set('cson', config.sisbot_config);

    if (cson_config.autodim !== undefined) this.current_state.set('is_autodim_allowed', cson_config.autodim.toString());
    else this.current_state.set('is_autodim_allowed', 'true');
    logEvent(1, "Autodim: ", this.current_state.get('is_autodim_allowed'));
    if (this.current_state.get('is_autodim_allowed') == 'false') this.current_state.set('is_autodim', 'false'); // force autodim off

		// make sure the hostname is correct
		var regex = /^[^a-zA-Z]*/; // make sure first character is a-z
		var regex2 = /[^0-9a-zA-Z\-]+/g; // greedy remove all non alpha-numerical or dash chars
		var clean_hostname = this.current_state.get('name').replace(regex,"").replace(regex2,"");
		if (this.current_state.get('hostname') != clean_hostname+'.local') {
      logEvent(1,"need to set hostname");

			self._set_hostname({hostname: clean_hostname}, null);
			logEvent(2, "Fix incorrect hostname");
			return; // stop here
		}

    // INITIALIZE BLUETOOTH
    logEvent(1,"bluetooth init");
    process.env['BLENO_DEVICE_NAME'] = 'sisbot ' + this.current_state.id;
    ble_obj.initialize(this.current_state.id);

		// force do_not_remind if old Version (1.0)
		var old_version = +this.current_state.get('software_version');
		if (old_version && old_version < 1.1) {
			this.current_state.set('do_not_remind', 'false');
		}

    logEvent(1,"set initial state");
		// force values on startup
		this.current_state.set({
			id: 'pi_'+this.config.pi_serial,
			pi_id: 'pi_'+this.config.pi_serial,
			is_homed: "false",
      _end_rho: 0, // on startup, we should be at 0
			state: "waiting",
			is_available: "true",
			reason_unavailable: "false",
      fault_status: "false",
			is_serial_open: "false",
			installing_updates: "false",
      update_status: "false",
			installing_updates_error: "",
			factory_resetting: "false",
			factory_resetting_error: "",
			installed_updates: "false",
			// is_internet_connected: "false",
      // is_network_connected: "false",
			software_version: this.config.version
		});
    if (this.isServo) this.current_state.set('is_servo', 'true');
		this.current_state.set("mac_address", this._getMacAddress());
		// this.current_state.set("local_ip", this._getIPAddress());
		if (this.current_state.get("local_ip") == "192.168.42.1") {
			this.current_state.set("is_hotspot", "true");
		} else {
      logEvent(1, "Starting IP:", this.current_state.get("local_ip"));
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

    // override CSON values if User changed them
    var table_settings = this.current_state.get('table_settings');
    _.each(table_settings, function(value, key) {
      if (value != undefined && value != '') {
        logEvent(1, "Table Setting:", key, value);
        logEvent(1, "CSON Match:", cson_config[key]);
        if (value == 'true') cson_config[key] = true;
        else if (value == 'false') cson_config[key] = false;
        else cson_config[key] = value;
        logEvent(1, "New CSON Value:", key, cson_config[key]);
      }
    });

		// plotter
    logEvent(1, "Plotter");
    // var cson_config = CSON.load(config.base_dir+'/'+config.folders.sisbot+'/'+config.folders.config+'/'+config.sisbot_config);
  	this.plotter.setConfig(cson_config);

    // overwrite config.js max_speed if table allows
    if (cson_config.max_speed) this.config.max_speed = cson_config.max_speed;

    // two ball
		if (cson_config.twoBallEnabled) {
      logEvent(1, "Enable two ball");
			this._detach_first = true;
      this.current_state.set('is_multiball','true'); // allow frontend to know

			if (cson_config.attach_track) {
        logEvent(1, "Generate Attach track", cson_config.attach_track);
        var a_verts = cson_config.attach_track.split(',').join('\n');
        this.add_track({id:'attach',name:'Attach',verts:a_verts,is_deletable:'false'},null);
        // this._attach_track = cson_config.attach_track;
      }

			if (cson_config.detach_track) {
        logEvent(1, "Generate Detach track", cson_config.detach_track);
        var d_verts = cson_config.detach_track.split(',').join('\n');
        this.add_track({id:'detach',name:'Detach',verts:d_verts,is_deletable:'false'},null);
        // this._detach_track = cson_config.detach_track;
			}
		}

    // RGBW
    if (cson_config.useRGBW) {
      logEvent(1, "Use RGBW", this.current_state.get('led_primary_color'), this.current_state.get('led_secondary_color'));
      this.current_state.set('led_enabled','true');
      if (cson_config.rgbwCount) this.led_count = cson_config.rgbwCount;
      if (cson_config.rgbwOffset) this.led_default_offset = cson_config.rgbwOffset;

      // Force the default patterns to be available
      this.current_state.set('led_pattern_ids', ['white','solid','fade','spread','comet','rainbow','paint','demo']);
    } else {
      logEvent(1, "No RGBW");
      this.current_state.set('led_enabled','false');
      this.current_state.set('is_rgbw','false');
    }

		plotter.onServoThFault(function(is_fault) {
      if (is_fault && self.current_state.get('fault_status') != 'servo_th_fault') logEvent(2, "Servo Th Fault!");
			if (is_fault) {
        self.pause(null, null);
        self.current_state.set("fault_status", "servo_th_fault");
      } else {
        if (self.current_state.get('fault_status') == 'servo_th_fault') self.current_state.set("fault_status", "false");
        else if (self.current_state.get('fault_status') == 'servo_th_rho_fault') self.current_state.set("fault_status", "servo_rho_fault");
      }
      // logEvent(1, "onServoThFault() Socket Update");
      var min_resp = _.pick(self.current_state.toJSON(), ['id','fault_status','state']);
      self.socket_update(min_resp); // notify all connected UI
			clearTimeout(self._network_check); // stop internet checks
		});
		plotter.onServoRhoFault(function(is_fault) {
      if (is_fault && self.current_state.get('fault_status') != 'servo_rho_fault') logEvent(2, "Servo Rho Fault!");
			if (is_fault) {
  			self.pause(null, null);
  			self.current_state.set("fault_status", "servo_rho_fault");
      } else {
        if (self.current_state.get('fault_status') == 'servo_rho_fault') self.current_state.set("fault_status", "false");
        else if (self.current_state.get('fault_status') == 'servo_th_rho_fault') self.current_state.set("fault_status", "servo_th_fault");
      }
      // logEvent(1, "onServoRhoFault() Socket Update");
      var min_resp = _.pick(self.current_state.toJSON(), ['id','fault_status','state']);
      self.socket_update(min_resp); // notify all connected UI
			clearTimeout(self._network_check); // stop internet checks
		});
		plotter.onServoThRhoFault(function() {
      if (self.current_state.get('fault_status') != 'servo_th_rho_fault') logEvent(2, 'Servo Th and Rho Fault!');
			self.pause(null, null);
			self.current_state.set("fault_status", "servo_th_rho_fault");
      // logEvent(1, "onServoThRhoFault() Socket Update");
      var min_resp = _.pick(self.current_state.toJSON(), ['id','fault_status','state']);
      self.socket_update(min_resp); // notify all connected UI
			clearTimeout(self._network_check); // stop internet checks
		});
		plotter.onFinishTrack(function() {
      var finished_track = self.current_state.get('active_track');
			logEvent(1, "Track Finished", finished_track.id);

			if (self._home_next == true) return logEvent(1, "Home Next, skip playing next");

      // update balls
      self.current_state.set('ball_count', self.plotter.getBalls());
      logEvent(1, "Ball_count", self.current_state.get('ball_count'));

      // force homing if rho is at zero, and we don't know if it is valid
      if (!self.plotter.getRhoHome() && self.current_state.get('_end_rho') == 0) {
        logEvent(1, "Rho at zero, validate home th, rho", self.plotter.getThetaHome(), self.plotter.getRhoHome());
        self._home_next = true;
      }

			var playlist_id = self.current_state.get('active_playlist_id');
			if (playlist_id != "false") {
				var playlist = self.collection.get(playlist_id);
				// make sure playlist was not deleted
				if (!playlist) {
					self.current_state.set('active_playlist_id', 'false');
          // logEvent(1, "onFinishTrack() no playlist Socket Update", JSON.stringify(self.current_state.toJSON()).length);
          var min_resp = _.pick(self.current_state.toJSON(), ['id', 'active_playlist_id', 'ball_count','state']);
					return self.socket_update(min_resp);
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
        // logEvent(1, "onFinishTrack() playlist Socket Update", JSON.stringify([self.current_state.toJSON(),playlist.toJSON()]).length);
        var min_state = _.pick(self.current_state.toJSON(), ['id','state', 'active_playlist_id', 'ball_count','repeat_current','is_waiting_between_tracks','active_track']);
        var min_playlist = _.pick(playlist.toJSON(), ['id','is_shuffle','is_loop','active_track_index','active_track_id','tracks','sorted_tracks','next_tracks']);
        self.socket_update([min_state, min_playlist]);
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
        // logEvent(1, "onFinishTrack() single track Socket Update", JSON.stringify(self.current_state.toJSON()).length);
        var min_resp = _.pick(self.current_state.toJSON(), ['id','state', 'active_playlist_id', 'ball_count','repeat_current','is_waiting_between_tracks']);
        self.socket_update(min_resp);
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
            name: 'FAILED_HOME',
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

        logEvent(1, "Sensor Values th, rho", self.plotter.getThetaHome(), self.plotter.getRhoHome());

        self._sensored = false; // don't sensored home next
				self._home_next = false; // clear home next
        self._home_requested = false; // allow home button again
        self._first_home = false; // first homing is complete
				self.current_state.set({is_homed: "true", _end_rho: 0}); // reset

        // !!! Check if is_sleeping
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
            self._home_requested = false;
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
      // logEvent(1, "onStateChanged() Socket Update", JSON.stringify(self.current_state.toJSON()).length);
      var min_resp = _.pick(self.current_state.toJSON(), ['id', 'state', '_end_rho', 'repeat_current', 'is_homed']);
      self.socket_update(min_resp);
		});

		// connect
    if (this.current_state.get('led_enabled') == 'false') {
      // pulse led strip once
  		spawn('./pulse_leds.sh',[1],{cwd:"/home/pi/sisbot-server/sisbot",detached:true,stdio:'ignore'});

      // delay connect until after lights are done fading
      setTimeout(function() {
        self._connect();
      }, 2250);
    } else this._connect();

		// wifi connect
		if (this.current_state.get("is_hotspot") == "false") {
      logEvent(1, "Init: Not hotspot, check in 15 sec...");
      // this._internet_lanonly_check = false;
      this._first_retry = true; // if it fails, retry connecting to known network sooner
			this._query_internet(this.config.wifi_check_network_timeout); // check for internet connection after 15 seconds
		} else {
			// check if we should try reconnecting to wifi
			if (this.current_state.get("wifi_network") != "" && this.current_state.get("wifi_network") != "false" && this.current_state.get("wifi_password") != "" && this.current_state.get("wifi_password") != "false") {
        logEvent(1, "Init: Is hotspot, try to connect to wifi...");
				this.change_to_wifi({ ssid: self.current_state.get("wifi_network"), psk: self.current_state.get("wifi_password") }, null);
			}
		}

		// sleep/wake timers
    if (this.current_state.get("is_hotspot") == 'false') this.setup_timers(this.current_state.toJSON(), null);

    // make sure update_status file exists, starts as 'false'
    fs.writeFile(config.base_dir+'/'+config.folders.sisbot+'/update_status', 'false', function(err) {
      if (err) return logEvent(2, "Software update_status file error", err);
      fs.chmodSync(config.base_dir+'/'+config.folders.sisbot+'/update_status', 0o666);

      // Software update status
      fs.watch(self.config.base_dir+'/'+self.config.folders.sisbot+'/update_status', _update_status);
    });

    // Check for missing thumbnails
    this.find_missing_thumbnails({}, null);

    // Set up GPIOs
    this.set_gpio({
        gpio: 2,
        gpio_type: 'in',
        cb: function(err, resp) {
          if (err) return logEvent(2, "GPIO callback err", err);
          self._gpio_testing(resp, null);
        }
      }, function(err,resp) {
        logEvent(1, "GPIO button set:", err, resp);
      });
    this.set_gpio({ gpio: 3, gpio_type: 'out', initial_state: 1 }, function(err,resp) {
      logEvent(1, "GPIO Red LED set:", err, resp);
    });
    this.set_gpio({ gpio: 4, gpio_type: 'out', initial_state: 1 }, function(err,resp) {
      logEvent(1, "GPIO Green LED set:", err, resp);
    });

		return this;
	},
	_setupAnsible: function() {
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
	_teardownAnsible: function() {
		var self = this;
		_.each(self.config.services.sisbot.connect, function(service_name) {
			logEvent(1, 'Disconnect', service_name);
			self.ansible.disconnect(service_name);
		});

		logEvent(1, "Ansible teardown complete");
	},
	_getIPAddress: function() {
	  var ip_address = '0.0.0.0';
	  var interfaces = os.networkInterfaces();

	  for (var devName in interfaces) {
	    var iface = interfaces[devName];

	    for (var i = 0; i < iface.length; i++) {
	      var alias = iface[i];
        // logEvent(1, "IP Address alias:", devName, alias);
	      if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal)
	        ip_address = alias.address;
	    }
	  }

    // WE ADD BLUETOOTH HOOK HERE
    ble_obj.update_ip_address(ip_address);

	  return ip_address;
	},
	_getMacAddress: function() {
	  var mac_address = 'false';
	  var interfaces = os.networkInterfaces();

    logEvent(1, "Interfaces", interfaces);
	  for (var devName in interfaces) {
	    var iface = interfaces[devName];

	    for (var i = 0; i < iface.length; i++) {
	      var alias = iface[i];
	      if (alias.family === 'IPv4' && alias.mac !== '00:00:00:00:00:00' && !alias.internal) {
          logEvent(1, "Mac Address alias:", devName, alias.mac);
	        mac_address = alias.mac;
        }
	    }
	  }

	  return mac_address;
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

    // logEvent(1, "_ready() Socket Update", JSON.stringify(self.current_state.toJSON()).length);
    var min_resp = _.pick(self.current_state.toJSON(), ['id','state','service_connected']);
    this.socket_update(min_resp);
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

      // logEvent(1, "_connectionClosed() Socket Update", JSON.stringify(this.current_state.toJSON()).length);
      var min_resp = _.pick(this.current_state.toJSON(), ['id','state','service_connected']);
      this.socket_update(min_resp);
		}

		this._connectionError(service);
	},
  /***************************** GPIO **************************************/
  set_gpio: function(data, cb) {
    var self = this;

    // create the gpio obj
    if (data.gpio != "false") {
      logEvent(1, "Set GPIO", data);

      // gpio setup
      var button = new GPIO(data.gpio, data.gpio_type, 'both');
      this.gpios['gpio'+data.gpio] = {
        gpio: button,
        data: {
          current_state: data.initial_state,
          gpio: data.gpio,
          gpio_type: data.gpio_type
        }
      }

      // watcher
      if (data.gpio_type == 'in') {
        // get current value
        self.read_gpio(self.gpios['gpio'+data.gpio].data, function(err, resp) {
          logEvent(1, "GPIO Value", resp);
          self.gpios['gpio'+data.gpio].data.current_state = resp;

          // respond with values
          if (cb) cb(null, self.gpios['gpio'+data.gpio].data);
        });

        if (data.cb) {
          this.gpios['gpio'+data.gpio].cb = data.cb;

          // watch for future changes
          button.watch(function (err, value) {
            if (err) return console.log(err);

            self._gpio_change(data.gpio, value);
          });
        }
      } else { // output gpio
        this.write_gpio({gpio:data.gpio,state:data.initial_state}, null);

        if (cb) cb(null, self.gpios['gpio'+data.gpio].data);
      }
    }
  },
  unset_gpio: function(data, cb) {
    logEvent(1, "Unset GPIO", data);
    try {
      var gpio_obj = this.gpios['gpio'+data.gpio];
      gpio_obj.gpio.unwatchAll();
      gpio_obj.gpio.unexport();

      delete this.gpios['gpio'+data.gpio]; // remove from gpios list
    } catch(err) {
      logEvent(2, "Unset GPIO Error", data.gpio, err);
    }
  },
  read_gpio: function(data, cb) {
    logEvent(1, "Read GPIO", data, _.keys(this.gpios));
    try {
      var gpio_obj = this.gpios['gpio'+data.gpio];
      gpio_obj.gpio.read(cb);
    } catch(err) {
      logEvent(2, "Read GPIO Error", data.gpio, err);
    }
  },
  write_gpio: function(data, cb) {
    logEvent(1, "Write GPIO", data);
    // {gpio, state}
    try {
      var gpio_obj = this.gpios['gpio'+data.gpio];
      gpio_obj.gpio.write(data.state,cb);
    } catch(err) {
      logEvent(2, "Write GPIO Error", data.gpio, err);
    }
  },
  _gpio_change: function(gpio, value) {
    var self = this;

    logEvent(1, "GPIO Change", gpio, value);
    self.gpios['gpio'+gpio].data.current_state = value;

    // TODO: do something about press/release
    if (self.gpios['gpio'+gpio].cb && _.isFunction(self.gpios['gpio'+gpio].cb))
      self.gpios['gpio'+gpio].cb(null, self.gpios['gpio'+gpio].data);
  },
  _gpio_testing: function(data, cb) {
    var self = this;
    logEvent(1, "GPIO button changed:", data);

    // turn Green light on/off
    if (data.current_state == 0) self.write_gpio({gpio:4,state:0}); // on
    else self.write_gpio({gpio:4,state:1}); // off

    if (data.current_state == 0) {
      // logEvent(1, "Not hotspot, revert?");

      self._gpio_timer = setTimeout(function() {
        self.write_gpio({gpio:4,state:1}); // turn off green
        self._flash_red(null, null); // flash red

        // clear passcode
        var passcode = self.current_state.get('passcode');
        if (passcode && passcode != 'false') {
          logEvent(1, "GPIO: Clear Passcode");
          self.current_state.set('passcode', 'false'); // clear passcode
        }

        // recheck for hotspot
        if (self.current_state.get('is_hotspot') == 'false') {
          logEvent(1, "GPIO: Not hotspot, revert to hotspot");
          self.disconnect_wifi(null, null); // disconnect if not in firmware update
        }
      }, self.config.gpio_hold_time);
    } else {
      clearTimeout(self._gpio_timer);
    }
  },
  _flash_red: function(data, cb) {
    var count = 2; // flashes 3 times
    var self = this;

    function red_on() {
      self.write_gpio({gpio:3,state:0}); // on

      setTimeout(function() {
        red_off();
      }, 1000);
    }

    function red_off() {
      self.write_gpio({gpio:3,state:1}); // off

      if (count > 0) {
        count--;
        setTimeout(function() {
          red_on();
        }, 1000);
      }
    }

    red_on();
  },
  /***************************** Connect PI light controller  program ******************/
  // _reconnect_lcp: function() {
  //   this.lcp_socket = unix_dg.createSocket('unix_dgram');
  //   // this.lcp_socket.bind('/tmp/sisyphus_sockets');
  //   // this.lcp_socket.on('error', console.error);
  //   this.plotter.useLCPSocket(this.lcp_socket, this._reconnect_lcp);
  // },

  _connect_lcp: function() {
    logEvent(1, 'connecting to light controller program');
    this.lcp_socket = unix_dg.createSocket('unix_dgram');
    // this.lcp_socket.bind('/tmp/sisyphus_sockets');
    // this.lcp_socket.on('error', console.error);
    this.plotter.useLCPSocket(this.lcp_socket);

    // turn on LEDs now if enabled by config
    if (this.current_state.get('led_enabled') == 'true') this.set_led({is_rgbw:'true'});
  },
  get_led_patterns: function(data, cb) {
    var self = this;
    logEvent(1, "Get LED Pattern Filenames", data);

    // read contents of configs dir
    fs.readdir(this.config.base_dir+'/'+this.config.folders.leds, function(err, resp) {
      if (err) return cb(err, null);

      var return_values = [];

      // only include .py files
      _.each(resp, function(filename) {
        if (filename.match(/.py$/)) return_values.push(filename);
      });

      // cut out special files
      return_values = _.without(return_values, 'calibrate.py', 'led_main.py', 'led_startup.py', 'none.py', 'software_update.py', 'colorFunctions.py', 'easing.py');
      if (cb) cb(err, return_values);
    });
  },
  set_led: function(data, cb) {
    var self = this;
    // Enable/disable LED lights
    logEvent(1, 'Set led', data);

    // kill running python file
    if (this.py) this.py.kill();

    // start/stop python script
    if (data.is_rgbw == 'true') {
      // tell plotter to turn off original strip
      this.plotter.setLED(false);

      var args = [];
      if (this.led_count) {
        args.push('-n');
        args.push(this.led_count);
      }
      if (this.led_default_offset) {
        args.push('-o');
        args.push(this.led_default_offset);
      }
      logEvent(1, "Start LED", args);
  		this.py = spawn('./start_leds.sh',args,{cwd:"/home/pi/sisbot-server/sisbot",detached:true,stdio:'ignore'});
      this.py.on('error', (err) => {
  			logEvent(2, 'Failed to start python process.', err);
  		});
  		this.py.on('close', (code) => {
  			logEvent(1, "python process exited with code", code);
  		});

      // set initial values
      setTimeout(function() {
        // set pattern
        var pattern = self.current_state.get('led_pattern');
        if (pattern && pattern != 'false') self.set_led_pattern({id:pattern,led_primary_color:self.current_state.get('led_primary_color'), led_secondary_color:self.current_state.get('led_secondary_color')});

        // set offset
        var offset = self.current_state.get('led_offset');
        if (offset != 0) self.set_led_offset({offset:offset});
      }, 2000);
    } else {
      // tell plotter to use original strip
      this.plotter.setLED(true);
    }

    if (cb) cb(null, data);
  },
  set_led_offset: function(data, cb) {
    // Set LED offset
    logEvent(1, 'Set led offset', data);

    if (_.isFinite(data.offset)) {
      // keep within range
      data.offset = +data.offset % 360;

      var buf1 = Buffer.from('o', 0, 1);
      var buf2 =  Buffer.alloc(4);
      buf2.writeFloatBE(data.offset, 0);

      var totalLength = buf1.length + buf2.length;
      message = Buffer.concat([buf1, buf2], totalLength);

      try {
        this.lcp_socket.send(message, 0, totalLength, '/tmp/sisyphus_sockets');
      } catch(err) {
        logEvent(2, "LCP Offset error", err);
      }
    }

    if (cb) cb(null, data);
  },
  set_led_pattern: function(data, cb) {
    var self = this;
    logEvent(1, "Set led pattern", data);

    // set pattern
    this.lcpWrite({ value: 'i'+data.id }, function(err, resp) {
      if (err) return logEvent(2, "LCP Error", err);

      // change colors
      self.set_led_color(data, function(err, resp) {
        self.current_state.set('led_pattern', data.id)
          .set('led_primary_color', data.led_primary_color)
          .set('led_secondary_color', data.led_secondary_color);

        self.save(null, null);

        var min_resp = _.pick(self.current_state.toJSON(), ['id','state','led_enabled','led_pattern','led_offset','led_primary_color','led_secondary_color']);

        if (cb) cb(null, min_resp);
      });

    });
  },
  set_led_color: function(data, cb) {
    // Set LED colors
    logEvent(1, 'Set led color', data);
    var is_change = false;

    //
    if (data.led_primary_color) {
      logEvent(1, "Set primary color", JSON.stringify(data.led_primary_color));
      var primary = {};

      // split from hex into components
      if (_.isString(data.led_primary_color)) {
        red = parseInt(data.led_primary_color.substr(1, 2), 16);
        green = parseInt(data.led_primary_color.substr(3, 2), 16);
        blue = parseInt(data.led_primary_color.substr(5, 2), 16);
        white = 0;
        if (data.led_primary_color.length > 7) white = parseInt(data.led_primary_color.substr(7, 2), 16);

        // logEvent(1, "Primary Colors: ", red, green, blue);
        primary = { red: red, green: green, blue: blue, white: white };
      } else primary = data.led_primary_color;

      var arr = new Uint8Array(5);
      arr[0] = 67; // C
      if (primary.red) arr[1] = Math.max(0,Math.min(+primary.red, 255));
      if (primary.green) arr[2] = Math.max(0,Math.min(+primary.green, 255));
      if (primary.blue) arr[3] = Math.max(0,Math.min(+primary.blue, 255));
      if (primary.white) arr[4] = Math.max(0,Math.min(+primary.white, 255));

      var buf = Buffer.from(arr.buffer);

      try {
        this.lcp_socket.send(buf, 0, 5, '/tmp/sisyphus_sockets');
      } catch(err) {
        logEvent(2, "LCP primary color error", err);
      }
      is_change = true;
    }
    if (data.led_secondary_color) {
      logEvent(1, "Set secondary color", JSON.stringify(data.led_secondary_color));
      var secondary = {};

      // split from hex into components
      if (_.isString(data.led_secondary_color)) {
        red = parseInt(data.led_secondary_color.substr(1, 2), 16);
        green = parseInt(data.led_secondary_color.substr(3, 2), 16);
        blue = parseInt(data.led_secondary_color.substr(5, 2), 16);
        white = 0;
        if (data.led_secondary_color.length > 7) white = parseInt(data.led_secondary_color.substr(7, 2), 16);

        // logEvent(1, "Secondary Colors: ", red, green, blue);
        secondary = { red: red, green: green, blue: blue, white: white };
      }
      var arr = new Uint8Array(5);
      arr[0] = 99; // c
      if (secondary.red) arr[1] = Math.max(0,Math.min(+secondary.red, 255));
      if (secondary.green) arr[2] = Math.max(0,Math.min(+secondary.green, 255));
      if (secondary.blue) arr[3] = Math.max(0,Math.min(+secondary.blue, 255));
      if (secondary.white) arr[4] = Math.max(0,Math.min(+secondary.white, 255));

      var buf = Buffer.from(arr.buffer);

      try {
        this.lcp_socket.send(buf, 0, 5, '/tmp/sisyphus_sockets');
      } catch(err) {
        logEvent(2, "LCP secondary color error", err);
      }
      is_change = true;
    }

    // call save if told here
    if (is_change && data._save) {
      if (data.led_primary_color) this.current_state.set('led_primary_color', data.led_primary_color);
      if (data.led_secondary_color) this.current_state.set('led_secondary_color', data.led_secondary_color);
      logEvent(0, "Save color change", data.led_primary_color, data.led_secondary_color);
      this.save(null, null);
    }

    var min_resp = _.pick(this.current_state.toJSON(), ['id','state','led_primary_color','led_secondary_color']);
    if (cb) cb(null, min_resp);
  },
  lcpWrite: function(data, cb) {
    logEvent(1, 'LCP-write:',data.value);

    if (typeof this.lcp_socket === 'undefined' || this.lcp_socket === null) {
      logEvent(1, 'lcpWrite: FAIL lcp is not initialized');
      errv = {"fail":"lcp socket is not initialized"}
      resp = errv;
      if (cb) cb(errv,resp);
      return;
    }
    var rval = {};
    var errv = null;
    try {
      message = Buffer(data.value);
      this.lcp_socket.send(message, 0, message.length, '/tmp/sisyphus_sockets');
      rval.lcp_send = data.value;
    } catch(err) {
      // console.error('LCP write err', err);
      logEvent(2, 'LCP socket write err:' + err);
      rval.lcp_send_err = err;
      errv = {"err":"LCP socket write threw an error"}
    }

    if (cb) cb(errv, rval);
  },
	/***************************** Plotter ************************/
	_connect: function() {
  	if (this.serial && this.serial.isOpen) return true;

		var self = this;
		logEvent(1, "Serial Connect", this.config.serial_path);
		if (this.config.serial_path == "false") return this.current_state.set("is_serial_open","true");
		logEvent(1, "Before Serial");
		try {
    	this.serial = new SerialPort(this.config.serial_path, { autoOpen: false }, function (err) {
    	  if (err) {
    	    return logEvent(2, 'Serial Error: ', err.message)
    	  }
    	});
    	this.serial.open(function (error) {
      	self.plotter.useSerial(self.serial);
				logEvent(1, 'Serial: connected!', error, self.serial.isOpen);

				self.current_state.set("is_serial_open", "true");

        // Autodim
    		self.plotter.setAutodim(self.current_state.get('is_autodim'));

        // position socket
        self._connect_lcp();

				self.set_brightness({value:self.current_state.get("brightness")}, null);
				self.set_speed({value:self.current_state.get("speed")}, null);

				if (self._autoplay) {
					logEvent(1, "Autoplay:", self.current_state.get("active_playlist_id"));
          var playlist_id = self.current_state.get("active_playlist_id");
          if (!playlist_id || playlist_id == 'false') {
  					logEvent(1, "No Active Playlist, find:", self.current_state.get("default_playlist_id"));
            playlist_id = self.current_state.get('default_playlist_id');
          }

					if (playlist_id != "false" && self.collection.get(playlist_id) != undefined) {
						var playlist = self.collection.get(playlist_id);
            if (!playlist) logEvent(2, "Playlist not found:", playlist_id);
            else logEvent(1, "Playlist found", playlist.get('name'));
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
              // logEvent(1, "_connect() Socket Update", JSON.stringify(resp).length);
    					// self.socket_update(resp);
						});
					} else {
            logEvent(2, "Active Playlist not Found:", playlist_id);
          }
				} else {
          logEvent(1, "Do not Autoplay, just home");
          self.home();
        }
			});
    } catch(err) {
      logEvent(2, 'Plotter connect err', err);
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
    if (this.current_state.get('fault_status') != 'false') {
		  logEvent(2, 'Fault state, not a valid connection');
      return false;
    }
		if (!this.serial || !this.serial.isOpen) {
		  logEvent(2, 'No serial connection');
		  this.current_state.set("is_serial_open", "false");

      var min_resp = _.pick(this.current_state.toJSON(), ['id','state','is_serial_open']);
      this.socket_update(min_resp); // notify all connected UI
		  return false;
		}
    var _was_serial_open = this.current_state.get("is_serial_open");
		this.current_state.set("is_serial_open", "true");

    if (_was_serial_open  == 'false') {
      var min_resp = _.pick(this.current_state.toJSON(), ['id','state','is_serial_open']);
      this.socket_update(min_resp); // notify all connected UI
    }
		return true;
	},
	connect: function(data, cb) {
		logEvent(1, "Sisbot Connect()", data);

    // check for time data
    if (data && data.device_time) {
      logEvent(1, "Device time compare", data.device_time, moment().format('X'));

      if (!this.ntp_sync) {
        var self = this;

        var command = "date";
        logEvent(1, "Set local time", command);

        // TODO: run command, set ntp_sync = true;
    		var ls = spawn(command,['--set','@'+data.device_time],{cwd:"/home/pi/",detached:true,stdio:'ignore'});
    		ls.on('error', (err) => {
    			logEvent(2, 'Failed to set start date.');
    		});
    		ls.on('close', (code) => {
          if (code == 0) {
            self.ntp_sync = true;
            self.setup_timers(self.current_state.toJSON(), null); // setup sleep/wake/clear_logs
          }
    		});
      }
    }

		if (cb) cb(null, this.collection.toJSON());
	},
  state: function(data, cb) {
    logEvent(1, "Sisbot state");
    var ret_state = this.current_state.toJSON();
    delete ret_state.wifi_password;
    delete ret_state.wifi_network;
    // TODO: test removing playlist_ids, track_ids
    delete ret_state.playlist_ids;
    delete ret_state.track_ids;

    var return_objs = [ret_state];

		var playlist_id = this.current_state.get('active_playlist_id');
		if (playlist_id != 'false') {
      var ret_playlist = this.collection.get(playlist_id).toJSON();
      // TODO: test removing tracks
      delete ret_playlist.tracks;

      return_objs.push(ret_playlist);
    }

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
    var state = this.current_state.toJSON();
    state = _.pick(state, ['id','state', 'type', 'pi_id', 'name', 'hostname', 'local_ip', 'cson', 'mac_address']);
		if (cb) cb(null, state);
	},
  test_unavailable: function(data, cb) {
		logEvent(1, "Test Reason Unavailable", data);
    // pause if given fault reason
    if (data.value.indexOf('_fault') >= 0) {
      this.pause(null, null);
    }
    this.current_state.set('reason_unavailable', data.value);

    // logEvent(1, "test_unavailable() Socket Update", JSON.stringify(this.current_state.toJSON()).length);
    var min_resp = _.pick(this.current_state.toJSON(), ['id','state','reason_unavailable']);
    this.socket_update(min_resp); // notify all connected UI
    clearTimeout(this._network_check); // stop internet checks

    if (cb) cb(null, this.current_state.toJSON());
  },
	set_default_playlist: function(data, cb) {
		logEvent(1, "Sisbot Set Default Playlist", data);

		this.current_state.set("default_playlist_id", data.default_playlist_id);

		if (cb) cb(null, this.current_state.toJSON());
	},
  _set_cson: function(data, cb) {
    var self = this;
    // logEvent(2, "Set CSON", data);

    // double-check that the given name is in configs directory
    if (fs.existsSync(self.config.base_dir+'/'+self.config.folders.sisbot+'/'+self.config.folders.config+'/'+data.cson)) {
      // update whichcson.js file
      var cson = 'module.exports = "'+data.cson+'";\n';
      fs.writeFile(self.config.base_dir+'/'+self.config.folders.sisbot+'/'+self.config.folders.config+'/whichcson.js', cson, function(err) {
        logEvent(1, "CSON Set", data);
        if (cb) cb(err, data);
      });
    }
  },
  set_hostname: function(data,cb) {
    logEvent(1, "set hostname", data);

    if (this.isServo && this.homeFirst) {
      var homedata = {
        stop : true,
        clear_tracks: true
      };

      logEvent(1, "set_hostname, SERVO so calling Home() first");
      self = this;
      this.home(homedata, null);
      logEvent(1, "next call wait_for_home");

      self = this;
      setTimeout(function() {
        logEvent(1, "calling wait_for_home data is = ", data);
        self._wait_for_home(data, cb, self._set_hostname, self, false);
      }, 2000);

      return;
    }
    logEvent(1, "not servo set hostname now", data);
    this._set_hostname(data,cb);
  },
  _set_hostname: function(data,cb) {
		var self = this;

		logEvent(1, "Sisbot Set Hostname", data, process.platform);
		ValidHostnameRegex = new RegExp("^[a-zA-Z][a-zA-Z0-9\-]*$");

    if (process.platform != 'linux') {
      if (cb)	cb(null, this.current_state.toJSON());
      return;
    }

    logEvent(1, "Sisbot Set Hostname checking regex");
		if (data.hostname.search(ValidHostnameRegex) == 0) {
			if (data.hostname+'.local' != self.current_state.get('hostname')) { // set new hostname
        logEvent(1, "Sisbot Set Hostname exec script ", data.hostname);
				exec('sudo /home/pi/sisbot-server/sisbot/set_hostname.sh "'+data.hostname+'"', (error, stdout, stderr) => {
					if (error) return logEvent(2, 'set_hostname exec error:', error);
					self.current_state.set({hostname: data.hostname+'.local',hostname_prompt: "true"});
					self.save(null, null);

					// restart
					self._reboot(null, cb);
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
		if (!this._saving) {
		  if (this.config.debug) logEvent(1, "Sisbot Save", data);
			this._saving = true;

			var returnObjects = [];

			// TODO: merge the given data into collection and save
			if (data != null) {
				if (!_.isArray(data)) data = [data];
				_.each(data, function(obj) {
					// extra checks if passing sisbot changes
					if (obj.id == self.current_state.id) {
						if (obj.state) delete obj.state; // don't listen to updates to this, plotter is in control of this
						if (obj.table_settings && obj.table_settings.cson != self.current_state.get('cson')) self._set_cson(obj.table_settings, null);
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

      var path = this.config.base_dir+'/'+this.config.folders.sisbot+'/'+this.config.folders.content+'/'+this.config.sisbot_state;
      // save to tmp file
      fs.writeFile(path+'.tmp', JSON.stringify(this.collection), function(err) {
				if (err) {
          self._saving = false;
          return logEvent(2, err);
        }

        // double-check integrity of saved file
        if (fs.existsSync(path+'.tmp')) {
          var saved_state = fs.readFileSync(path+'.tmp', 'utf8');
          try {
            objs = JSON.parse(saved_state);

            // make sure objs is not empty
            if (_.size(objs) >= 1) {
              // move tmp file to real location
          		exec('mv '+path+'.tmp '+path, (error, stdout, stderr) => {
        			  self._saving = false;
          			if (error) return logEvent(2, 'save() exec error:',error);
          			if (stderr) return logEvent(2, 'save() exec stderr:',stderr);
                if (self.config.debug) logEvent(1, 'Save move complete');

                // call next in queue if available
                if (self._save_queue.length > 0) {
                  // logEvent(1, "Save queue:", self._save_queue.length);
                  var next_save = self._save_queue.shift();
                  self.save(next_save.data, next_save.cb);
                }
              });
            }
          } catch (err) {
    			  self._saving = false;
            return logEvent(3, "!!Blank save state, don't overwrite", err);
          }
        } else {
          self._saving = false;
          return logEvent(3, "Temp save file missing!");
        }
			});

			if (cb) cb(null, returnObjects);
		} else {
      // save into a queue
      this._save_queue.push({data:data, cb:cb});
		}
	},
	play: function(data, cb) {
		var self = this;

		if (this._validateConnection()) {
  		logEvent(1, "Sisbot Play", data);
      if (this._pause_timestamp != null && (Date.now() - this._pause_timestamp) < this.pause_play_lockout_msec) {
        logEvent(1,"Sisbot refused to Play, Still in lockout time window after a Pause command");
        var min_resp = _.pick(this.current_state.toJSON(), ['id','state']);
        if (cb) cb('Still waiting for Pause to complete', min_resp);
        return;
      }

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
          // logEvent(1, "Play() Socket Update", JSON.stringify(playlist.toJSON()).length);
          var min_playlist = _.pick(playlist.toJSON(), ['id','active_track_index','active_track_id','tracks']);
					this.socket_update(min_playlist);
				}

				if (self._home_next) {
					this.current_state.set('state', 'waiting'); // fix so it does the home correctly
					logEvent(1, "Home Next", this.current_state.get("state"));
					setTimeout(function() {
            self._home_requested = false;
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

      // logEvent(1, "Play() Socket Update 2", JSON.stringify(this.current_state.toJSON()).length);
      var min_resp = _.pick(this.current_state.toJSON(), ['id','is_waiting_between_tracks','state','active_track']);
      this.socket_update(min_resp);

			if (cb)	cb(null, min_resp);
		} else if (cb) cb('No Connection', null);
	},
	pause: function(data, cb) {
		if (this._validateConnection()) {
  		logEvent(1, "Sisbot Pause", data);
			this._paused = true;
      this._pause_timestamp = Date.now();
			this.current_state.set("state", "paused");
			plotter.pause();

      var min_resp = _.pick(this.current_state.toJSON(), ['id','state']);
			if (cb)	cb(null, min_resp);
		} else if (cb) cb('No Connection', null);
	},
	home: function(data, cb) {
		var self = this;

		if (this._validateConnection()) {
      if (this._home_requested) {
        if (cb)	cb('Already homing', null);
        return logEvent(2, "Sisbot Already Homing");
      }

	    logEvent(1, "Sisbot Home", data, this.current_state.get("state"));
      this._home_requested = true; // keep from calling multiple times
			if (data) { // special instructions?
				if (data.stop) this._autoplay = false; // home without playing anything afterward
				if (data.clear_tracks) this.current_state.set({active_playlist_id: "false", active_track: { id: "false" }}); // we don't keep track of where we are at anymore
			}

      if (this.current_state.get("state") == "playing") {
  	    logEvent(1, "Home Next");
				this._home_next = true;
				this.pause(null, function(err, resp) {
					self._paused = false;
					if (cb)	cb(err, resp);
				});
			} else if (this.current_state.get("state") == 'waiting' || this.current_state.get("state") == 'paused') {
				this._paused = false;
				this.current_state.set("state", "homing");

				////////// DR Homing:
	      if (this._sensored == false){
          logEvent(1, "Not Sensored");
    			var thetaPosition, rhoPosition;

    			thetaPosition = self.plotter.getThetaPosition();
    			logEvent(1, "shortest theta dist away from home = " + thetaPosition + " rads");
    			rhoPosition = self.plotter.getRhoPosition();
    			logEvent(1, "rho dist away form home = " + rhoPosition + " normalized");

    			var track_obj = {
            name: 'DEAD_RECKON',
						verts: [{th: thetaPosition, r: rhoPosition},{th:0,r:this._move_to_rho}],
						vel: 1,
						accel: 0.5,
						thvmax: 0.5
					};
					self._paused = false;
					logEvent(1, "doing DEAD RECKONING homing...");
					self.plotter.playTrack(track_obj);
					self._home_next = true; // home after this outward movement

					self._sensored = true; //next time round, sensored home

  				if (cb)	cb(null, this.current_state.toJSON());
	      } else {
          logEvent(1, "Home on Delay");
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
			//testing this:
			//thHome = false;
			//rhoHome = false;
		  //	console.log("setting homes false here");

    	var skip_move_out_if_sensors_at_home = true;
      if (this._first_home && !this.isServo) skip_move_out_if_sensors_at_home = false; // force sensored on first homing, if not servo

      /////////////////////
      if (thHome && (rhoHome || this.isServo || this._move_to_rho == 1) && skip_move_out_if_sensors_at_home) {
        logEvent(1, "DEAD RECKONING Home Successful");
        this._sensored = false;
        this._home_next = false;
        this._home_requested = false;
        this.current_state.set({state: "waiting", is_homed: "true", _end_rho: this._move_to_rho});

        this._move_to_rho = 0; // set back to zero

        // play next track as intended
        if (self.current_state.get('active_track').id != "false") {
          logEvent(1, "Force next track, start Rho: ", self.current_state.get('_end_rho'));
          // reverse the track?
          self._play_given_track(self.current_state.get('active_track'), null);
        } else {
          logEvent(1, "No Next Track", self.current_state.get('active_track'));
        }

        // send callback to UI
        if (cb)	cb(null, this.current_state.toJSON());
      } else {
        this._sensored = true; // force sensored home

        if (thHome && rhoHome) this._moved_out = false; // move out if we are on sensors and need to force sensored home
	      if (this.isServo == true) this._moved_out = true; // no move out for servo tables

        this._move_to_rho = 0; // set back to zero

        if (this._moved_out) {
					if (this._first_home) logEvent(1, "First home, use sensors");
          else logEvent(2, "not at home after DR, doing sensored...");
          self.plotter.home();
          this._moved_out = false;
        } else {
          this._moved_out = true; // call plotter.home() next time instead
          this._home_next = true; // home again after this outward movement
          var track_obj = {
            name: 'DELAYED_DEAD_RECKON',
            verts: [{th:0,r:0}],
            vel: 1,
            accel: 0.5,
            thvmax: 0.5
          };
          if (thHome == true && rhoHome == false) {
  					if (this._first_home) logEvent(1, "First home, use sensors");
            else logEvent(2, "Homing... Failed rho after DR, Fix rho");
            track_obj.verts.push({th:self.config.auto_home_th, r:self.config.auto_home_rho});
          } else {
  					if (this._first_home) logEvent(1, "First home, use sensors");
            else logEvent(2, "Homing... Failed Theta after DR, Fix theta and rho");
            track_obj.verts.push({th:self.config.auto_home_th, r:self.config.auto_home_rho});
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
    playlist.reset_tracks(); // fix missing _index
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
    // logEvent(1, "add_playlist() Socket Update", JSON.stringify([playlist.toJSON(), this.current_state.toJSON()]).length);
    var min_playlist = _.pick(playlist.toJSON(), ['id','is_shuffle','tracks','sorted_tracks','next_tracks']);
    var min_state = _.pick(this.current_state.toJSON(), ['id','state','playlist_ids']);
    this.socket_update([min_playlist, min_state]);
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
		logEvent(1, "Sisbot Add Track", data.id, data.name, data.track_id, _.keys(data));

		// pull out coordinates
		var verts = data.verts;
		if (verts == undefined || verts == "") {
			logEvent(2, "No verts given", data.id, data.name);
			if (cb) return cb('No verts given for '+data.name, null);
			else return;
		}
		delete data.verts;

		// save track
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
      var thumb_obj = { id: data.id, dimensions: 400 };
      if (data.track_id) thumb_obj.track_id = data.track_id;
			self._thumbnail_queue.push(JSON.parse(JSON.stringify(thumb_obj)));
      thumb_obj.dimensions = 100;
			self._thumbnail_queue.push(JSON.parse(JSON.stringify(thumb_obj)));
      thumb_obj.dimensions = 50;
			self._thumbnail_queue.push(JSON.parse(JSON.stringify(thumb_obj)));

      self.current_state.set("thumbnail_queue_length", self._thumbnail_queue.length);
      // logEvent(1, "add_track() Socket Update", JSON.stringify(self.current_state.toJSON()).length);
      var min_state = _.pick(self.current_state.toJSON(), ['id','state','track_ids']);
      self.socket_update(min_state);

			// generate thumbnail now, if first (and only) in queue
			if (generate_first) {
				self.thumbnail_generate(self._thumbnail_queue[0], function(err, resp) {
					// send back current_state and the track
					if (cb) cb(null, [track.toJSON(), self.current_state.toJSON()]);

					// tell all connected devices
          // logEvent(1, "add_track() thumbnail_generate Socket Update", JSON.stringify([track.toJSON(), self.current_state.toJSON()]).length);
          var min_track = _.pick(track.toJSON(), ['id','name','track_id']);
          var min_state = _.pick(self.current_state.toJSON(), ['id','state','thumbnail_queue_length']);
					self.socket_update([min_track, min_state]);
				});
			} else {
				if (cb) cb(null, [track.toJSON(), self.current_state.toJSON()]); // send back current_state without track
			}
		});
  },
  get_csons: function(data, cb) {
    // logEvent(0, "Get CSONs");
    var self = this;

    // read contents of configs dir
    fs.readdir(this.config.base_dir + '/' + this.config.folders.sisbot + '/' + this.config.folders.config, function(err, resp) {
      if (err) cb(err, null);

      var cson_files = [];
      // loop through files, removing javascript, default.cson
      _.each(resp, function(file) {
        if (file.match(/.cson$/) && file != 'default.cson') {
          cson_files.push(file);
        }
      });

      // load the files, pull out the name
      var return_value = [];
      _.each(cson_files, function(file) {
        var cson_config = CSON.load(self.config.base_dir+'/'+self.config.folders.sisbot+'/'+self.config.folders.config+'/'+file);
        var cson_name = (typeof cson_config.name === 'undefined') ? 'Unnamed' : cson_config.name;
        return_value.push({id:file, name:cson_name});
      });

      return_value = _.sortBy(return_value, 'name');

      // logEvent(0, "CSONs:", err, return_value);

      if (cb) cb(err, return_value);
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
  find_missing_thumbnails: function(data, cb) {
    logEvent(1, "Find Missing Thumbnails");
    var self = this;

    // get all track models
    var tracks = [];
    this.collection.each(function(model) {
      if (model.get('type') == 'track') tracks.push(model.id);
    });

    // Loop through all tracks, and find any missing .png files
    logEvent(1, "Tracks to search for:", tracks.length);
    var missing_thumbnails = [];
    var img_folder = this.config.servers.app.dir+'/img/tracks/';
    _.each(tracks, function(track_id) {
      // look inside siscloud/img/tracks for this id_50,100,400.png
      if (!fs.existsSync(img_folder+track_id+'_50.png')) missing_thumbnails.push({ id: track_id, dimensions: 50 });
      if (!fs.existsSync(img_folder+track_id+'_100.png')) missing_thumbnails.push({ id: track_id, dimensions: 100 });
      if (!fs.existsSync(img_folder+track_id+'_400.png')) missing_thumbnails.push({ id: track_id, dimensions: 400 });
    });

    if (missing_thumbnails.length > 0) {
      logEvent(2, "Missing Thumbnails ("+missing_thumbnails.length+")", missing_thumbnails);
      var empty_queue = self._thumbnail_queue.length == 0;

      _.each(missing_thumbnails, function(obj) {
        self._thumbnail_queue.push(JSON.parse(JSON.stringify(obj)));
      });

      if (empty_queue) {
        self.thumbnail_generate(self._thumbnail_queue[0], function(err, resp) {
          logEvent(1, "Missing Thumbnail Regenerate finished", err, resp);
        });
      }
    } else logEvent(1, "No Missing Thumbnails");

    if (cb) cb(null, "OK");
  },
	regenerate_thumbnails: function(data, cb) {
		var self = this;

		var all_tracks = this.current_state.get("track_ids");
		if (all_tracks.length > 0) {
      if (data.track_id) { // regenerate specific track
        var thumb_obj = { id: data.track_id, dimensions: 400 };
        self._thumbnail_queue.push(JSON.parse(JSON.stringify(thumb_obj)));
        thumb_obj.dimensions = 100;
        self._thumbnail_queue.push(JSON.parse(JSON.stringify(thumb_obj)));
        thumb_obj.dimensions = 50;
        self._thumbnail_queue.push(JSON.parse(JSON.stringify(thumb_obj)));
      } else { // Loop through all tracks
        _.each(all_tracks, function(track_id) {
          var thumb_obj = { id: track_id, dimensions: 400 };
    			self._thumbnail_queue.push(JSON.parse(JSON.stringify(thumb_obj)));
          thumb_obj.dimensions = 100;
    			self._thumbnail_queue.push(JSON.parse(JSON.stringify(thumb_obj)));
          thumb_obj.dimensions = 50;
    			self._thumbnail_queue.push(JSON.parse(JSON.stringify(thumb_obj)));
        });
      }

      logEvent(1, "Images to Regenerate", self._thumbnail_queue.length);

      self.current_state.set("thumbnail_queue_length", self._thumbnail_queue.length);
      // logEvent(1, "regenerate_thumbnails() Socket Update", JSON.stringify(self.current_state.toJSON()).length);
      var min_resp = _.pick(self.current_state.toJSON(), ['id','state','thumbnail_queue_length']);
      self.socket_update(min_resp);

      self.thumbnail_generate(self._thumbnail_queue[0], function(err, resp) {
        logEvent(1, "Regenerate finished", err, resp);

        // send back current_state and the track
        if (cb) cb(null, self.current_state.toJSON());

        // tell all connected devices
        // logEvent(1, "regenerate_thumbnails() finished Socket Update", JSON.stringify(self.current_state.toJSON()).length);
        var min_resp = _.pick(self.current_state.toJSON(), ['id','state','thumbnail_queue_length']);
        self.socket_update(min_resp);
      });
    }
	},
	thumbnail_preview_generate: function(data, cb) {
		logEvent(1, "Thumbnail preview", data.name);

    var self = this;

    // pause table if playing
    if (!this._paused) this._thumbnail_playing = true;
    else this._thumbnail_playing = false;
    this.pause();

		// add to front of queue
		if (self._thumbnail_queue.length == 0) self._thumbnail_queue.push(data);
		else {
			if (cb) data.cb = cb;
			self._thumbnail_queue.splice(1, 0, data);
		}

    self.current_state.set("thumbnail_queue_length", self._thumbnail_queue.length);
    // logEvent(1, "thumbnail_preview_generate() Socket Update", JSON.stringify(self.current_state.toJSON()).length);
    var min_resp = _.pick(self.current_state.toJSON(), ['id','state','thumbnail_queue_length']);
    self.socket_update(min_resp);

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
		logEvent(1, "Thumbnail generate", data.track_id, data.id, data.name, data.dimensions);
    // @id
    var self = this;
		var coordinates = [];

		if (data.track_id) {
      logEvent(1, "Download Webcenter Track image", data.track_id, data.id, data.dimensions);
      self._download_track_image(data, function(err, resp) {
        if (err) {
          logEvent(2, "Thumbnail err", err);
  				if (cb) cb(err, null);
  			} else if (cb) cb(null, { id: data.id, dimensions: data.dimensions }); // don't send back verts

        self._thumbnail_queue.shift(); // remove first in queue
        self.current_state.set("thumbnail_queue_length", self._thumbnail_queue.length);
        // logEvent(1, "thumbnail_generate() Socket Update", JSON.stringify(self.current_state.toJSON()).length);
        var min_resp = _.pick(self.current_state.toJSON(), ['id','state','thumbnail_queue_length']);
        self.socket_update(min_resp);

        if (self._thumbnail_queue.length > 0) {
          logEvent(1, "Generate thumbnails left", self._thumbnail_queue.length);
          // generate next thumbnail in _thumbnail_queue
          self.thumbnail_generate(self._thumbnail_queue[0], null);
        } else {
          logEvent(1, "All thumbnails generated");
        }
      });
      return;
    } else if (data.id != 'preview') {
			var track = this.collection.get(data.id);
			if (track) coordinates = track.get_verts();
      else logEvent(2, "Track not found for thumbnail generation", data.id);
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
        logEvent(2, "Thumbnail err", err);
				if (cb) cb(err, null);
			} else if (cb) cb(null, { id: data.id, dimensions: data.dimensions }); // don't send back verts

			self._thumbnail_queue.shift(); // remove first in queue
      self.current_state.set("thumbnail_queue_length", self._thumbnail_queue.length);
      // logEvent(1, "_thumbnails_generate() finished Socket Update", JSON.stringify(self.current_state.toJSON()).length);
      var min_resp = _.pick(self.current_state.toJSON(), ['id','state','thumbnail_queue_length']);
      self.socket_update(min_resp);

			if (self._thumbnail_queue.length > 0) {
				logEvent(1, "Generate thumbnails left", self._thumbnail_queue.length);
				// generate next thumbnail in _thumbnail_queue
				self.thumbnail_generate(self._thumbnail_queue[0], null);
			} else {
				logEvent(1, "All thumbnails generated");
        if (self._thumbnail_playing) self.play();
        self._thumbnail_playing = false; // force back to false
			}
    });
  },
  _download_track_image: function(data, cb) {
    var self = this;

    if (!data.track_id) cb('Download Track Image: No track_id given', null);
    if (!data.id) cb('Download Track Image: No id given', null);
    if (!data.dimensions) cb('Download Track Image: No dimensions given', null);

    //
    var dest = this.config.base_dir+'/'+this.config.folders.cloud+'/img/tracks/'+data.id+'_'+data.dimensions+'.png';
    var url = self.config.api_endpoint+self.config.api_thumb_url+data.track_id+'/thumb_'+data.dimensions+'.png';

    var file = fs.createWriteStream(dest);
    var sendReq = request.get(url);

    // verify response code
    sendReq.on('response', function(response) {
        if (response.statusCode !== 200) {
          // add to cue, without track_id (generate locally)
			    self._thumbnail_queue.push({ id: data.id, dimensions: data.dimensions });
          return cb('Response status was ' + response.statusCode);
        }
        sendReq.pipe(file);

        logEvent(1, "Send Req finished", data.id);
    });

    // close() is async, call cb after close completes
    file.on('finish', function() {
      file.close(cb, function(err) { if (err) logEvent(2, "File close err:", err); });
      // logEvent(1, "File Close", data.id);
    });

    // check for request errors
    sendReq.on('error', function(err) {
      fs.unlink(dest, function(err) { if (err) logEvent(2, "File unlink err:", err); });
			self._thumbnail_queue.push({ id: data.id, dimensions: data.dimensions }); // add to cue, without track_id (generate locally)
      return cb(err.message);
    });
    file.on('error', function(err) { // Handle errors
        fs.unlink(dest, function(err) { if (err) logEvent(2, "File unlink err:", err); }); // Delete the file async. (But we don't check the result)
  			self._thumbnail_queue.push({ id: data.id, dimensions: data.dimensions }); // add to cue, without track_id (generate locally)
        return cb(err.message);
    });
  },
  _thumbnails_generate: function(data, cb) {
    // id, host_url, raw_coors, dimensions

    // exit if no coordinates
    if (data.raw_coors == '') {
      if (data.cb) data.cb('No coordinates given', { 'id':data.id });
      if (cb) cb('No coordinates given', null);
      return;
    }

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
                    <div class="d3" data-name="'+ data.id + '" data-coors="' + data.raw_coors + '" data-dimensions="' + data.dimensions + '"></div>\
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

    var old_playlist_id = this.current_state.get('active_playlist_id');
    var current_rho = this.plotter.getRhoPosition();

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
		if (data.is_shuffle && !data.is_current) {
      // starts new playlist at nearest rho (0|1)
      playlist.set_shuffle({
        is_shuffle: data.is_shuffle,
        start_rho: Math.min(Math.max(Math.round(current_rho), 0), 1) // 0 or 1
      });
      logEvent(1, "Start Rho confirm", Math.min(Math.max(Math.round(current_rho), 0), 1));
    }

		// clean playlist tracks
		if (!data.is_shuffle || data.is_shuffle == 'false') {
			var active_index = data.active_track_index;
			playlist.set('active_track_index', -1); // allow this track to start at 1, if it is supposed to
      playlist.set_shuffle({ is_shuffle: data.is_shuffle }); // fix track ordering
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

		if (this.current_state.get('state') == "playing") {
			plotter.pause();
			this._home_next = true;

      // set next value for rho based on active_track
      var track = this.current_state.get('active_track');
			if (track != undefined && track != "false") {
		    logEvent(1, "Current track", track);
        if (old_playlist_id == data.id) { // if same playlist, maintain order, move to track firstR
          logEvent(1, "Same Playlist, move to track start", track.firstR);
        } else if (!data.is_shuffle || data.is_shuffle == 'false') { // if new playlist && not shuffled, move to track firstR
          logEvent(1, "New Playlist, not shuffled, move to track start", track.firstR);
        } else { // if new playlist && shuffled, move to nearest value
          logEvent(1, "New Playlist, shuffled, move to nearest rho", Math.min(Math.max(Math.round(current_rho), 0), 1), track.firstR);
        }
        this._move_to_rho = track.firstR;
      }
		} else if (this.current_state.get('state') == "waiting" || this.current_state.get('state') == "paused") {
			var track = playlist.get_current_track();
			if (track != undefined && track != "false")	{
				this._autoplay = true;
				this._play_track(track, null);
			}
		}

		// tell sockets
    // logEvent(1, "set_playlist() Socket Update", JSON.stringify([playlist.toJSON(), this.current_state.toJSON()]).length);
    var min_state = _.pick(this.current_state.toJSON(), ['id','state','is_homed','active_playlist_id','active_track','is_shuffle','is_loop','is_waiting_between_tracks']);
    var min_playlist = _.pick(playlist.toJSON(),['id','is_shuffle','is_loop','active_track_index','active_track_id','tracks','sorted_tracks','next_tracks']);
    this.socket_update([min_playlist, min_state]);

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
    var active_playlist_id = this.current_state.get('active_playlist_id');
		if (active_playlist_id && active_playlist_id == 'false' && track.get('id') == this.current_state.get('active_track').id && this.current_state.get('state') == 'playing') {
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

      // set next value for rho (closest to 0/1)
      if (track.get('is_reversible') == 'true') {
        var current_rho = this.plotter.getRhoPosition();
        this._move_to_rho = Math.min(Math.max(Math.round(current_rho), 0), 1); // round to 0 or 1
        logEvent(1, "set_track() Current Rho:", current_rho, "Next Rho:", this._move_to_rho);
      } else {
        this._move_to_rho = track.get('firstR');
        logEvent(1, "set_track() Not Reversible:", this.plotter.getRhoPosition(), "Next Rho:", this._move_to_rho);
      }
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

              // logEvent(1, "_play_track() Socket Update", JSON.stringify([track.toJSON(),self.current_state.toJSON()]).length);
              var min_track = _.pick(track.toJSON(), ['id','firstR','lastR']);
              var min_state = _.pick(self.current_state.toJSON(), ['id','state','_end_rho']);
    					self.socket_update([min_track, min_state]);

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
    // reverse track?
    if (track.firstR != self.current_state.get('_end_rho') && track.lastR == self.current_state.get('_end_rho') && track.reversible == 'true') {
      logEvent(1, "Reverse track", track);
    } else if (track.firstR != undefined && track.firstR != self.current_state.get('_end_rho')) move_to_rho = track.firstR;
    // }
    // move to start rho
    if (move_to_rho !== false) {
      var track_obj = {
        name: 'MOVE_TO_START',
        verts: [{th:0,r:plotter.getRhoPosition()},{th:self.config.auto_th,r:move_to_rho}],
        vel: 1,
        accel: 0.5,
        thvmax: 0.5
      };
      self._paused = false;
      logEvent(1, "Force move to start", _.pluck(track_obj.verts, 'r'))
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
			if (this.current_state.get('state') == "playing") return this.pause(data, cb);
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
			if (this.current_state.get('state') == "playing") return this.pause(data, cb);
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
			if (this.current_state.get('state') == "playing") return this.pause(data, cb);
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
			if (this.current_state.get('state') == "playing") return this.pause(data, cb);
			this.current_state.set({state: "waiting", is_homed: "false", active_playlist_id: "false", active_track: { id: "false" }}); // we don't keep track of where we are at anymore
			plotter.jogRhoInward();
			if (cb)	cb(null, this.current_state.toJSON());
		} else if (cb) cb('No Connection', null);
	},
	get_state: function(data, cb) {
		logEvent(1, "Get Sisbot state", return_objs);

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

    // update table with info
    // logEvent(1, "set_speed() Socket Update", JSON.stringify(this.current_state.toJSON()).length);
    var min_resp = _.pick(this.current_state.toJSON(), ['id','state','speed']);
		this.socket_update(min_resp);

		this.save(null, null);

		if (cb)	cb(null, this.current_state.toJSON());
	},
	set_autodim: function(data, cb) {
		logEvent(1, 'Sisbot set autodim', data);

		this.current_state.set('is_autodim', data.value);
		plotter.setAutodim(data.value);// notify plotter of autodim setting

		this.set_brightness({ value: this.current_state.get("brightness") });

    // update table with info
    // logEvent(1, "set_autodim() Socket Update", JSON.stringify(this.current_state.toJSON()).length);
    var min_resp = _.pick(this.current_state.toJSON(), ['id','state','is_autodim']);
		this.socket_update(min_resp);

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

	  plotter.setBrightness(value);

    // update table with info
    // logEvent(1, "set_brightness() Socket Update", JSON.stringify(this.current_state.toJSON()).length);
    var min_resp = _.pick(this.current_state.toJSON(), ['id','state','brightness']);
		this.socket_update(min_resp);

		this.save(null, null);

		if (cb)	cb(null, this.current_state.toJSON());
	},
	set_pause_between_tracks: function(data, cb) {
		// { is_paused_between_tracks: "true" }
		logEvent(1, 'Sisbot set pause between tracks', data);

		this.current_state.set('is_paused_between_tracks', data.is_paused_between_tracks);

    // update table with info
    // logEvent(1, "set_pause_between_tracks() Socket Update", JSON.stringify(this.current_state.toJSON()).length);
    var min_resp = _.pick(this.current_state.toJSON(), ['id','state','is_paused_between_tracks']);
		this.socket_update(min_resp);

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

    // update table with info
    // logEvent(1, "set_pause_between_tracks() Socket Update", JSON.stringify(this.current_state.toJSON()).length);
    var min_resp = _.pick(this.current_state.toJSON(), ['id','state','share_log_files']);
		this.socket_update(min_resp);

		if (cb)	cb(null, this.current_state.toJSON());
	},
	/* --------------- WIFI ---------------------*/
  _validate_network: function(data, cb) {
		// logEvent(0, "Sisbot validate network");
    var self = this;

    // optional other command: ip r
    exec('route | grep default', {timeout: 5000}, (error, stdout, stderr) => {
      if (error) {
        if (cb) cb(null, 'false');
        return logEvent(2, '_validate_network error:',error);
      }

      // logEvent(1, "LAN result", stdout, stderr, this._network_retries);
      var old_network_connected = self.current_state.get('is_network_connected');
      var old_local_ip = self.current_state.get('local_ip');

      var returnValue = "false";
      if (stdout.indexOf("default") > -1) returnValue = "true";
      else logEvent(2, '_validate_network: ', stdout);
      // logEvent(1, 'stdout:', stdout);
      if (stderr) logEvent(2, '_validate_network stderr:', stderr);

      if (old_network_connected != returnValue || returnValue == 'false') logEvent(1, "LAN Internet Connected Check", returnValue, self.current_state.get("local_ip"));

      // make sure connected to remote
      if (returnValue == "true" && self.current_state.get("share_log_files") == "true") self._setupAnsible();

      // update values
      self.current_state.set({
        is_network_connected: returnValue,
        local_ip: self._getIPAddress()
      });

      if (process.env.NODE_ENV.indexOf('_dev') >= 0) logEvent(1, "LAN IP", self.current_state.get('local_ip'));

      // save if changed
      if (old_network_connected != returnValue || old_local_ip != self.current_state.get('local_ip')) self.save(null, null);

      if (returnValue == "true") this._network_retries = 0;

      if (cb) cb(null, returnValue);
    });
  },
	_validate_internet: function(data, cb) {
		// logEvent(1, "Sisbot validate internet");
		var self = this;

		exec('ping -c 1 -W 2 google.com', {timeout: 5000}, (error, stdout, stderr) => {
			if (error) logEvent(2, 'ping exec error:', error);

      var old_internet_connected = self.current_state.get('is_internet_connected');
      var old_local_ip = self.current_state.get('local_ip');

			var returnValue = "false";
			if (stdout.indexOf("1 packets transmitted") > -1) returnValue = "true";
			// logEvent(1, 'stdout:', stdout);
			// logEvent(1, 'stderr:', stderr);

			if (self.current_state.get('is_internet_connected') != returnValue) logEvent(1, "Internet Connected Check", returnValue, self.current_state.get("local_ip"));

      // setup timers if now connected
      if (!self.ntp_sync && returnValue == "true") self.setup_timers(self.current_state.toJSON(), null);

			// make sure connected to remote
			if (returnValue == "true" && self.current_state.get("share_log_files") == "true") self._setupAnsible();

			// update values
			self.current_state.set({
				is_internet_connected: returnValue,
				local_ip: self._getIPAddress()
			});

      // save if changed
      if (old_internet_connected != returnValue || old_local_ip != self.current_state.get('local_ip')) self.save(null, null);

			if (cb) cb(null, returnValue);
		});
	},
	_query_internet: function(time_to_check) {
		if (this.current_state.get("is_hotspot") == "false") { // only bother if you are not a hotspot
			var self = this;
			this._network_check = setTimeout(function() {
        // validate we are on the network
        self._validate_network(null, function(err, resp) {
					if (err) return logEvent(2, "Network check err", err);
					if (resp == "true") {
						if (self.config.debug) logEvent(1, "Network connected.",self.current_state.get("is_network_connected"));

      			self._changing_to_wifi = false;
						self.current_state.set({
							is_available: "true",
							failed_to_connect_to_wifi: "false",
							wifi_forget: "false",
						 	wifi_error: "false"
						});

						// leave current state alone if fault
						// if (self.current_state.get('fault_status') == 'false') {
							self.current_state.set("reason_unavailable", "false");
						// }

						self._network_retries = 0; // successful network connection, reset

            // _validate_internet
    				self._validate_internet(null, function(err, resp) {
              // check again later, regardless of internet error
              self._query_internet(self.config.check_internet_interval);

              // update table with info
              // logEvent(1, "_query_internet() Socket Update", JSON.stringify(self.current_state.toJSON()).length);
              var min_resp = _.pick(self.current_state.toJSON(), ['id','state','reason_unavailable','is_available','failed_to_connect_to_wifi','wifi_forget','wifi_error','is_network_connected','is_internet_connected']);
    					self.socket_update(min_resp);

    					if (err) return logEvent(2, "Internet check err", err);
    					if (resp == "true") {
    						if (self.config.debug) logEvent(1, "Internet connected.",self.current_state.get("is_internet_connected"));

                // only post if IP address changed
                var ip_address = self._getIPAddress();
                if (self._old_ip != ip_address) {
                  self._post_state_to_cloud();
                  self._old_ip = ip_address;
                }
    					}
    				});
          } else {
						self._network_retries++;

						if (self._network_retries < self.config.network_retries) {
              // try again since we haven't hit max tries
							self._query_internet(self.config.retry_network_interval);
						} else {
							logEvent(2, "Network not connected, reverting to hotspot.");
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
    logEvent(1, "Post State to Webcenter", this.config.api_endpoint);
    var self = this;

    // logEvent(1, 'LETS TRY AND GET TO CLOUD', this.current_state.toJSON());
		var state = this.current_state.toJSON();
		delete state.wifi_password;
		delete state.wifi_network;

    request.post(this.config.api_endpoint + '/sisbot_state/' + this.current_state.id, {
        form: {
          data: state
        }
      },
      function on_resp(error, response, body) {
        if (!error && response.statusCode == 200) {
          logEvent(1, "Post to cloud", body);
        } else {
          if (error) logEvent(2, "Post state Error:", error);
          if (response) logEvent(2, "Request Not found:", response.statusCode);
        }
      }
    );
  },
	get_wifi: function(data, cb) {
    var self = this;
		logEvent(1, "Sisbot get wifi", data);

    // test ap-force
    if (!data.flags) data.flags = ['ap-force'];

		iw.scan(data, function(err, resp) {
      if (err) {
        self._iw_retries++;
        logEvent(2, "iw:", err, resp);

        if (self._iw_retries < 3) {
          setTimeout(function() {
            self.get_wifi(data, cb);
          }, 500);
        } else {
          self._iw_retries = 0;
          return cb('Unable to load network list', null);
        }
      } else {
        logEvent(1, "iw: ", err, resp);
        self._iw_retries = 0;

        // fix unnamed ssid's
        _.each(resp, function(network, index) {
          if (!network.ssid || network.ssid == '') network.ssid = 'Unnamed Network';
          network.ssid = network.ssid.replace(/\\xe2\\x80\\x99/gi, "’"); // fix apostrophe
        });

        if (cb) cb(err, resp);
      }
    });
	},
	connect_to_wifi: function(data, cb) {
		// forward to old connection endpoint
		this.current_state.set({ wifi_forget: "true" });

    // remember if this is a hidden network
    if (data.is_hidden) {
      logEvent(1, "Wifi_is_hidden:", data.is_hidden);
      this.current_state.set('wifi_is_hidden', data.is_hidden);
    } else {
      this.current_state.set('wifi_is_hidden', 'false');
    }

		this.change_to_wifi(data, cb);
	},
	change_to_wifi: function(data, cb) {
		var self = this;
		// logEvent(1, "Sisbot change to wifi", data);
		if (data.ssid == undefined || data.ssid == "" || data.ssid == "false") {
			if (cb) cb("No network name given", null);
      self.current_state.set({ wifi_forget: "false" });
		} else if (!data.psk || (data.psk && data.psk.length >= 8)) {
			clearTimeout(this._network_check);
  		this._changing_to_wifi = true;
			this._network_retries = 0; // clear retry count

			// Make sure password is valid
			// ValidPasswordRegex = new RegExp("^([^\s\"]{8,63})$");
			if (!data.psk || /^([^\r\n]{8,63})$/g.test(data.psk)) {
				self.current_state.set({
					is_available: "false",
    			reason_unavailable: "connect_to_wifi",
					wifi_network: data.ssid,
					wifi_password: data.psk,
					is_hotspot: "false",
					failed_to_connect_to_wifi: "false",
    			is_network_connected: "false",
					is_internet_connected: "false",// ?remove?
				});

				// logEvent(1, "New State:", self.current_state.toJSON());
				self.save(null, null);

        // respond to UI
				if (cb) cb(null, self.current_state.toJSON());

				// disconnect all socket connections first
				self.socket_update("disconnect");

        var connection = "'"+data.ssid.replace("'", '\'"\'"\'')+"'";
        if (data.psk) connection += " '"+data.psk.replace("'", '\'"\'"\'')+"'";
        if (self.current_state.get('wifi_is_hidden') != 'false') connection += " 1";
				logEvent(1, "Connect To Wifi", data.ssid, self.current_state.get('wifi_is_hidden'));
				// logEvent(1, "Connection", connection);

        setTimeout(function () {
          exec("sudo /home/pi/sisbot-server/sisbot/stop_hotspot.sh "+connection, (error, stdout, stderr) => {
  					if (error) return logEvent(2, 'Stop_hotspot exec error:', error);
  				});
    		}, 100);

        // check for successful connection, starting in 15 seconds
				self._query_internet(self.config.wifi_check_network_timeout);
			} else if (cb) {
				logEvent(2, "Invalid Password", data.psk);
				cb("Invalid password", null);
				self.current_state.set({ wifi_forget: "false" });
			}
		} else {
			if (cb) {
			  cb('Wi-Fi ssid is incorrect or you have entered the wrong password.', null);
				self.current_state.set({ wifi_forget: "false" });
			}
		}
	},
	is_network_connected: function(data, cb) {
		this._validate_network(data, cb);
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
    if (this.current_state.get('installing_updates') == 'true') return cb('Cannot Disconnect during Updates', null);

    logEvent(1, "Disconnect Wifi", data);

		// This will remove old network/password
		this.current_state.set({
			wifi_network: "false",
			wifi_password: "false",
			wifi_error: "false",
			is_internet_connected: "false",
  		is_network_connected: "false",
			reason_unavailable: "disconnect_from_wifi" // TODO: is this necessary? Could just be "reset_to_hotspot", UI shows same for both
		});

		// make sure we don't throw an error, we wanted to disconnect
		this._changing_to_wifi = false;
    this._network_retries = 0;

		this.save(null, null);

		this.reset_to_hotspot(data, cb);
	},
	reset_to_hotspot: function(data, cb) {
    if (this.current_state.get('installing_updates') == 'true') {
      if (cb) cb('Cannot Disconnect during Updates', null);
      return;
    }

		// This won't remove old network/password, so we can try reconnecting again later
		// Use disconnect_wifi if you want to remove old network/password
		var self = this;
		logEvent(1, "Sisbot Reset to Hotspot", data);
		clearTimeout(this._network_check);
		this._network_retries = 0; // clear retry count

		this.current_state.set({
			is_available: "false",
			reason_unavailable: "reset_to_hotspot",
			is_hotspot: "true",
			is_internet_connected: "false",
  		is_network_connected: "false"
		});

		// forget bad network values (from cloud)
		if (this.current_state.get('wifi_forget') == 'true') {
	    logEvent(1, "Sisbot Forget Wifi");
			this.current_state.set({
				wifi_network: "false",
				wifi_password: "false",
				wifi_error: "false", // not an error to remember
				wifi_forget: "false"
			});
      this._network_retries = 0;
		}

    var min_resp = _.pick(this.current_state.toJSON(), ['id','state','is_available','reason_unavailable','is_hotspot','is_internet_connected','is_network_connected','wifi_network','wifi_password','wifi_error','wifi_forget']);
    this.socket_update(min_resp);

		if (cb) cb(null, this.current_state.toJSON());

		// disconnect all socket connections first
		this.socket_update("disconnect");

		// disconnect Ansible
		this._teardownAnsible();

		logEvent(1, "Start_hotspot");
		exec('sudo /home/pi/sisbot-server/sisbot/start_hotspot.sh', (error, stdout, stderr) => {
			if (error) return logEvent(2, 'exec error:',error);
			logEvent(1, "start_hotspot", stdout);

      var new_state = {
          is_available: "true",
          reason_unavailable: "false",
          local_ip: self._getIPAddress(),
          failed_to_connect_to_wifi: (self._changing_to_wifi == true) ? 'true' : 'false'
      };

      self._old_ip = self._getIPAddress();

      self._changing_to_wifi = false;
			self.current_state.set(new_state);

			self.save(null, null);

			// if a wifi connection error, try to reconnect in __ time
      var retry_interval = self.config.wifi_error_retry_interval;
      if (self._first_retry) {
        self._first_retry = false;
        retry_interval = self.config.wifi_first_retry_interval;
      }
			if (self.current_state.get("wifi_error") == "true") {
				self._network_check = setTimeout(function() {
					self._reconnect_to_wifi();
				}, retry_interval);
			}
		});
	},
	_reconnect_to_wifi: function() {
		var self = this;

    var wifi_network = self.current_state.get("wifi_network");
    if (!wifi_network || wifi_network == 'false') return;

		self.get_wifi({ iface: 'wlan0' }, function(err, resp) {
			if (err) {
				logEvent(2, "Wifi list error:", err);

				// try again later
				self._network_check = setTimeout(function() {
					self._reconnect_to_wifi();
				}, self.config.retry_network_interval); // wifi_error_retry_interval
				return;
			}

			// check if the wanted network is in the list
			if (resp) {
        // logEvent(1, JSON.stringify(self.current_state.toJSON()));
        logEvent(1, "Networks found, looking for ", wifi_network);
        var network_found = false;

        if (self.current_state.get('wifi_is_hidden') == 'true') {
          network_found = true;
          logEvent(1, "Hidden Network ", wifi_network, "try to connect");
        } else {
          var networks = _.uniq(_.pluck(resp, 'ssid'));
          logEvent(1, "Networks found:", networks);
  				_.each(networks, function(network_obj) {
  					if (network_obj && network_obj == wifi_network) {
  						logEvent(1, "Found Network", wifi_network, "try to connect");
  						network_found = true;
  					}
  				});
        }

				if (network_found) { // connect!
          self._network_retries++;
          if (self._network_retries >= self.config.wifi_error_retries) {
            // forget wifi if it doesn't work this time
            logEvent(1, "Last time to try  Wifi");
  					self.connect_to_wifi({
  						ssid: self.current_state.get("wifi_network"),
  						psk: self.current_state.get("wifi_password"),
              is_hidden: self.current_state.get("wifi_is_hidden")
  					}, null);
          } else {
  					self.change_to_wifi({
  						ssid: self.current_state.get("wifi_network"),
  						psk: self.current_state.get("wifi_password")
  					}, null);
          }
				} else { // try again later
					self._network_check = setTimeout(function() {
						self._reconnect_to_wifi();
					}, self.config.wifi_error_retry_interval);
				}
			} else { // try again later
        logEvent(2, "No Networks found");
				self._network_check = setTimeout(function() {
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
  check_ntp: function(data, cb) {
    var self = this;

    if (this.ntp_sync) {
      if (cb) cb(null, this.ntp_sync);
      return;
    }

    // check status
		exec('timedatectl status', (error, stdout, stderr) => {
      if (error) logEvent(2, "Timedatectl err:", error);
      logEvent(1, "Timedatectl stdout:", stdout);
      if (stderr) logEvent(2, "Timedatectl stderr:", stderr);

      var sync = stdout.match(/(NTP|System clock) synchronized: (yes|no)/);
      if (_.isArray(sync) && sync.length > 1) {
        var sync_value = (sync[2] == 'yes');
        logEvent(1, "NTP Value: ", sync[1], sync_value);

        // remember that we are synced
        if (sync_value) self.ntp_sync = true;

        if (cb) cb(null, sync_value);
      } else if (cb) cb('Unknown result: '+sync, null);
    });
  },
  setup_timers: function(data, cb) {
    var self = this;

    // check NTP before assigning cron
    this.check_ntp({}, function(err, sync_value) {
      if (err) logEvent(2, "NTP Error", err);

      // setup sleep/wake/clean_logs if synced
      if (sync_value) {
        logEvent(1, "Setup_timers");

        // load library when needed (to prevent power-cycle time issues)
        if (!scheduler) {
          scheduler 	= require('node-schedule');

          // wait an additional 10 seconds
          setTimeout(function() {
          // assign, it is supposed to be a hotspot
            self._schedule_clean_logs(data, null);
            self._set_sleep_time(data, cb);
          }, self.config.sleep_init_wait);

          return;
        }

        self._schedule_clean_logs(data, null);
        self._set_sleep_time(data, cb);
      }
    });
  },
	set_sleep_time: function(data, cb) {
		var self = this;
		logEvent(1, "Set Sleep Time:", moment().format(), data.sleep_time, data.wake_time, data.timezone_offset, this.current_state.get('is_sleeping'));
    if (!scheduler) {
      scheduler 	= require('node-schedule');

      // wait an additional 10 seconds
      setTimeout(function() {
      // assign, it is supposed to be a hotspot
        self._set_sleep_time(data, cb);
      }, self.config.sleep_init_wait);

      return;
    }

    self._set_sleep_time(data, cb);
  },
  _set_sleep_time: function(data, cb) {
    var self = this;

		// cancel old timers
		if (self.sleep_timer != null) {
			self.sleep_timer.cancel();
			self.sleep_timer = null;
		}
		if (self.wake_timer != null) {
			self.wake_timer.cancel();
			self.wake_timer = null;
		}

		// set timer
		if (data.sleep_time != "false") {
			var sleep = moment(data.sleep_time+' '+data.timezone_offset, 'H:mm A Z');
			var cron = sleep.minute()+" "+sleep.hour()+" * * *";
			logEvent(1, "Sleep Timer", data.sleep_time, data.timezone_offset, cron);

			self.sleep_timer = scheduler.scheduleJob(cron, function(){
				self.sleep_sisbot(null, null);
			});
		}
		if (data.wake_time != "false") {
			var wake = moment(data.wake_time+' '+data.timezone_offset, 'H:mm A Z');
			var cron = wake.minute()+" "+wake.hour()+" * * *";
			logEvent(1, "Wake Timer", data.wake_time, data.timezone_offset, cron);

			self.wake_timer = scheduler.scheduleJob(cron, function(){
				self.wake_sisbot(null, null);
			});
		}

    // logEvent(1, "Sleep Time Set:", moment().format(), data.sleep_time, data.wake_time, data.timezone_offset, this.current_state.get('is_sleeping'));

		// save to state
		self.current_state.set({
      is_sleep_enabled: data.is_sleep_enabled,
			sleep_time: data.sleep_time,
			wake_time: data.wake_time,
			timezone_offset: data.timezone_offset,
			is_nightlight: data.is_nightlight,
			nightlight_brightness: data.nightlight_brightness
		});
    if (data.is_play_on_wake) self.current_state.set('is_play_on_wake', data.is_play_on_wake);

		self.save(null, null);

    var min_resp = _.pick(self.current_state.toJSON(), ['id','state','is_sleeping','is_sleep_enabled','sleep_time','wake_time','timezone_offset','is_nightlight','nightlight_brightness','is_play_on_wake'])
		if (cb) cb(null, min_resp);
	},
	wake_sisbot: function(data, cb) {
		logEvent(1, "Wake Sisbot", this.current_state.get('is_sleeping'));
		if (this.current_state.get('is_sleeping') != 'false') {
			// turn lights back on
			this.set_autodim({value: this.current_state.get('_is_autodim')}, null);
			this.set_brightness({value: this.current_state.get('_brightness')}, null); // reset to remembered value

			this.current_state.set('is_sleeping', 'false');

			// play track?
      if (this.current_state.get('is_play_on_wake') == 'true' || this._sleep_playing) {
        this.play(null, null);
        logEvent(1, "Play Track", this._paused);
      }

      // logEvent(1, "wake_sisbot() Socket Update", JSON.stringify(this.current_state.toJSON()).length);
      var min_resp = _.pick(this.current_state.toJSON(), ['id','state','is_sleeping']);
      this.socket_update(min_resp);
		}
		if (cb) cb(null, min_resp);
	},
	sleep_sisbot: function(data, cb) {
    var self = this;
		logEvent(1, "Sleep Sisbot", this.current_state.get('is_sleeping'));

		if (this.current_state.get('is_sleeping') == 'false') {
      if (this.current_state.get('state') == 'homing') {
        // Delay sleep until homing finished
        setTimeout(function() {
          self.sleep_sisbot(data, cb);
        }, 1000);
      } else {
        this._sleep_sisbot(data, cb);
      }
		} else if (cb) {
      var min_resp = _.pick(this.current_state.toJSON(), ['id','state','is_sleeping']);
      cb(null, min_resp);
    }
	},
  _sleep_sisbot: function(data, cb) {
    // fade lights out
    this.current_state.set('_is_autodim', this.current_state.get('is_autodim')); // remember, so wake resets it
    this.current_state.set('_brightness', this.current_state.get('brightness')); // remember, so wake resets it

    if (this.current_state.get('is_nightlight') == 'true') {
      this.set_autodim({value: 'false'}, null);
      this.set_brightness({value: this.current_state.get('nightlight_brightness')}, null);
    } else this.set_brightness({value: 0}, null);

    // save play/pause state
    this._sleep_playing = !this._paused;

    // pause track
    this.pause(null, null);

    this.current_state.set('is_sleeping', 'true');

    // logEvent(1, "_sleep_sisbot() Socket Update", JSON.stringify(this.current_state.toJSON()).length);
    var min_resp = _.pick(this.current_state.toJSON(), ['id','state','is_sleeping','nightlight_brightness','_is_autodim','_brightness']);
    this.socket_update(min_resp);
		if (cb) cb(null, min_resp);
  },
	/* --------------------- LOG FILES --------------------- */
  _schedule_clean_logs: function(data, cb) {
    var self = this;

    var cron = "0 0 * * *"; // once per day at midnight
    logEvent(1, "Clear Logs", cron);

    scheduler.scheduleJob(cron, function(){
      self.clean_log_files(null, cb);
    });
  },
	get_log_file: function(data, cb) {
		logEvent(1, "Get log file", data);
		if (this.config.folders.logs && typeof data.filename !== 'undefined') {
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
				if (cb) cb('Log not available for ' + data.filename, null);
			}
		} else if (cb) cb('No logs found.  No log directory or input data.filename was missing', null);
	},
  get_log_filenames: function(data, cb) {
    var self = this;
    // logEvent(1, "Get Log Filenames", data);

    // read contents of configs dir
    fs.readdir(this.config.folders.logs, function(err, resp) {
      if (err) cb(err, null);

      // logEvent(0, "Log Files", resp);
      if (cb) cb(err, resp);
    });
  },
  clean_log_files: function(data, cb) {
    var self = this;
    logEvent(1, "Clean Log Files", data);

    var compare_date = moment().subtract(this.config.log_days_to_keep,'days');
    var yesterday = moment().subtract(1,'days');

    this.get_log_filenames(data, function(err, resp) {
      if (err) return cb(err, null);

      // loop through each file
      _.each(resp, function(file) {
        var match = file.match(/([0-9]+)_/);
        if (match) {
          // delete dated old files
          var file_date = moment(match[1], 'YYYYMMDD');
          if (file_date.isBefore(compare_date, 'day')) {
            fs.unlink(self.config.folders.logs+file, function(err) {
              if (err) logEvent(2, "Log Delete Err", file, err);
              logEvent(2, "Deleted Dated File:", file);
            });
          } else logEvent(1, "Dated File:", file);
        } else {
          // Make sure file is not empty
          var stats = fs.statSync(self.config.folders.logs+file);
          var fileSizeInBytes = stats["size"];

          if (fileSizeInBytes > 0) {
            // move files to dated, previous files
            exec('cat '+self.config.folders.logs+file+' >> '+self.config.folders.logs+yesterday.format('YYYYMMDD')+'_'+file,(error, stdout, stderr) => {
      			  if (error) return logEvent(2, 'exec error:',error);

              // truncate the existing
              fs.truncate(self.config.folders.logs+file, function(err) {
                if (err) logEvent(2, "Log Delete Err", file, err);
                logEvent(2, "Moved, shortened non-dated file:", file);
              });
      			});
          } else {
            logEvent(1, file+" is empty, skip copy");
          }
        }
      });

      // log current state
      var state = self.current_state.toJSON();
      logEvent(1, "Current state", _.omit(state, ['wifi_password']) );

      // return nothing
      if (cb) cb(null, null);
    });
  },
	/* ------------------------------------------ */
  install_updates: function(data, cb) {
    logEvent(1, "Sisbot Install Updates WRAPPER", data);
    if (this.isServo && this.homeFirst) {
      var homedata = {
        stop : true,
        clear_tracks: true
      };

      logEvent(1, "install_updates, SERVO so calling Home() first");
      self = this;
      this.home(homedata, null);
      logEvent(1, "next call wait_for_home");

      self = this;
      setTimeout(function() {
        logEvent(1, "calling _install_updates pointer is = ", typeof self._install_updates);
        self._wait_for_home(data, cb,  self._install_updates, self, false);
      }, 2000);

      return;
    }

    logEvent(1, "no servo, call _install_updates directly");
    this._install_updates(data, cb);
  },
  _wait_for_home: function(data, cb, funcptr, this2, saw_homing) {
    // logEvent(1, "Waiting for home, current state = ", this.current_state.get("state"));

    if (saw_homing == false) {
      if (this.current_state.get("state") == "homing") {
        saw_homing = true;
      }

      var self = this;
      logEvent(1, "_wait_for_home waiting to see homing");
      setTimeout(function(data, cb, fptr, this2, saw_homing) {
        // logEvent(1, "_wait_for_home callback self.funcptr = ", typeof fptr);
        self._wait_for_home(data, cb, fptr, this2, saw_homing);
      }, 1000, data, cb, funcptr, this2, saw_homing); // wait a second
      return;
    }

    if (this.current_state.get("state") == "waiting") {
      logEvent(1, "_wait_for_home done waiting for servo to go home, call the next function with data=", data);
      funcptr.call(this2, data, cb);
    } else {
      var self = this;
      logEvent(1, "_wait_for_home, waiting for state waiting = ", data);
      setTimeout(function(data, cb, fptr, this2, saw_homing) {
        self._wait_for_home(data, cb, fptr, this2, saw_homing);
      }, 1000, data, cb, funcptr, this2, saw_homing); // wait a second
    }
  },
  _install_updates: function(data, cb) {
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

    // change to software_update.py pattern
    if (this.current_state.get('led_enabled') == 'true') {

      // change pattern
      self.lcpWrite({ value: 'isoftware_update' }, function(err, resp) {
        if (err) return logEvent(2, "Software Update Pattern Error", err);

        // change colors
        self.set_led_color({ primary_color: '#0000FF00', secondary_color:'#FF000000'}, function(err, resp) {
          if (err) return logEvent(2, "Software Update Color error", err);
        });
      });
    } else {
      // stop checkPhoto?

      // pulse lights endlessly
  		spawn('./pulse_leds.sh',[-1],{cwd:"/home/pi/sisbot-server/sisbot",detached:true,stdio:'ignore'});
    }

    logEvent(1, "Sisbot running update script update.sh");
		exec('/home/pi/sisbot-server/sisbot/update.sh '+this.config.service_branches.sisbot+' '+this.config.service_branches.app+' '+this.config.service_branches.proxy+' false >> /var/log/sisyphus/'+moment().format('YYYYMMDD')+'_update.log', (error, stdout, stderr) => {
			self.current_state.set({installing_updates: 'false'});
		  if (error) {
				return logEvent(2, 'exec error:',error);
			}
			logEvent(1, "Install complete");

			self.save(null, null);

  		self._reboot(null,null);
		});
	},
  servo_enable: function(data, cb) {
    logEvent(1, "Sisbot Servo Enable", data);

    this.plotter.servo_enable(data.motor); // expects rho|theta
  },
  install_python: function(data, cb) {
    logEvent(1, "Sisbot Install Python WRAPPER", data);
    if (this.isServo && this.homeFirst) {
      var homedata = {
        stop : true,
        clear_tracks: true
      };

      logEvent(1, "install_python, SERVO so calling Home() first");
      self = this;
      this.home(homedata, null);
      logEvent(1, "next call wait_for_home");

      self = this;
      setTimeout(function() {
        logEvent(1, "calling _install_python pointer is = ", typeof self._install_python);
        self._wait_for_home(data, cb,  self._install_python, self, false);
      }, 2000);

      return;
    }

    logEvent(1, "no servo, call _install_python directly");
    this._install_python(data, cb);
  },
  _install_python: function(data, cb) {
		var self = this;
		logEvent(1, "Sisbot Install Python", data);
		if (this.current_state.get("is_internet_connected") != "true") {
			if (cb) cb("Not connected to internet", null);
			return logEvent(2, "Install error: not connected to internet");
		}

		this.current_state.set('installing_updates','true');
		this.pause(null, null);

		// send response first
		if (cb) cb(null, this.current_state.toJSON());

    // change to software_update.py pattern
    if (this.current_state.get('led_enabled') == 'true') {
      // change colors
      self.set_led_color({ primary_color: '#0000FF00', secondary_color:'#FF000000'}, function(err, resp) {
        if (err) return logEvent(2, "Software Update Color error", err);

        // change pattern
        self.lcpWrite({ value: 'isoftware_update' }, function(err, resp) {
          if (err) return logEvent(2, "Software Update Pattern Error", err);
        });
      });
    } else {
      // stop checkPhoto?

      // pulse lights endlessly
  		spawn('./pulse_leds.sh',[-1],{cwd:"/home/pi/sisbot-server/sisbot",detached:true,stdio:'ignore'});
    }

    logEvent(1, "Sisbot running update script install_python.sh");
		exec('/home/pi/sisbot-server/sisbot/install_python.sh >> /var/log/sisyphus/'+moment().format('YYYYMMDD')+'_update.log', (error, stdout, stderr) => {
			self.current_state.set({installing_updates: 'false'});
		  if (error) {
				return logEvent(plo2, 'exec error:',error);
			}
			logEvent(1, "Install complete");

			self.save(null, null);

  		self._reboot(null,null);
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
    if (this.isServo && this.homeFirst) {
      var homedata = {
        stop : true,
        clear_tracks: true
      };

      logEvent(1, "factory_reset SERVO so calling Home() first");
      self = this;
      this.home(homedata, null);
      logEvent(1, "next call wait_for_home");

      self = this;
      setTimeout(function() {
        logEvent(1, "calling _install_updates pointer is = ", typeof self._install_updates);
        self._wait_for_home(data, cb, self._factory_reset, self, false);
      }, 2000);
      // if wait is too long, home is done and you've moved away againby the time you check
      return;
    }

    this._factory_reset(data, cb);

  },
	_factory_reset: function(data, cb) {
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
    if (this.isServo && this.homeFirst) {
      var homedata = {
        stop : true,
        clear_tracks: true
      };

      logEvent(1, "restart, SERVO so calling Home() first");
      self = this;
      this.home(homedata, null);
      logEvent(1, "next call wait_for_home");

      self = this;
      setTimeout(function() {
        logEvent(1, "calling _install_updates pointer is = ", typeof self._install_updates);
        self._wait_for_home(data, cb, self._restart, self, false);
      }, 2000);

      return;
    }

    this._restart(data, cb);
  },
	_restart: function(data,cb) {
		logEvent(1, "Sisbot Restart", data);
		this.current_state.set({is_available: "false", reason_unavailable: "restarting"});

    // turn off lights if running
    if (this.py) {
      logEvent(1, "Python running, turn off RGBW leds");
      this.lcpWrite({ value: 'inone' }, function(err, resp) {
        if (err) return logEvent(2, "LCP Error", err);
      });
    }

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
    if (this.isServo  && this.homeFirst) {
      var homedata = {
        stop : true,
        clear_tracks: true
      };

      logEvent(1, "reboot, SERVO so calling Home() first");
      self = this;
      this.home(homedata, null);
      logEvent(1, "next call wait_for_home");

      self = this;
      setTimeout(function() {
        logEvent(1, "calling _install_updates pointer is = ", typeof self._install_updates);
        self._wait_for_home(data, cb, self._reboot, self, false);
      }, 2000);

      return;
    } else if (this.current_state.get('state') == 'playing') {
      this.pause();
    }

    this._reboot(data, cb);
  },
  _reboot: function(data,cb) {
		logEvent(1, "Sisbot Reboot", data);
    var self = this;

		this.current_state.set({is_available: "false", reason_unavailable: "rebooting"});
    // logEvent(1, "_reboot() Socket Update", JSON.stringify(this.current_state.toJSON()).length);
    var min_resp = _.pick(this.current_state.toJSON(), ['id','state','is_available','reason_unavailable']);
    this.socket_update(min_resp);

		if (cb) cb(null, this.current_state.toJSON());

		setTimeout(function() {
  		// disconnect all socket connections first
  		self.socket_update("disconnect"); // close

			exec('sudo reboot', (error, stdout, stderr) => {
			  if (error) return logEvent(2, 'exec error:',error);
			});
		}, 500);
	}
};

var _update_status = function() {
  // logEvent(1, "update_status changed");
  fs.readFile(sisbot.config.base_dir+'/'+sisbot.config.folders.sisbot+'/update_status', 'utf8', function(err, data) {
    if (err) throw err;
    if (data) {
      var old_status = sisbot.current_state.get('update_status');
      if (old_status != data.trim()) {
        logEvent(1, "Software update status", data.trim());
        sisbot.current_state.set('update_status', data.trim());

        // logEvent(1, "_update_status() Socket Update", JSON.stringify(sisbot.current_state.toJSON()).length);
        var min_resp = _.pick(sisbot.current_state.toJSON(), ['id','state', 'update_status']);
        sisbot.socket_update(min_resp); // notify all connected UI
      }
    }
  });
}

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
    if (process.env.NODE_ENV != undefined) {
      if (process.env.NODE_ENV.indexOf('_dev') >= 0) {
        if (arguments[0] == 0 || arguments[0] == '0') line = '\x1b[32m'+line+'\x1b[0m'; // Green
        if (arguments[0] == 2 || arguments[0] == '2') line = '\x1b[31m'+line+'\x1b[0m'; // Red
    		console.log(line);
      }
    }
	} else console.log(arguments);
}

module.exports = sisbot;

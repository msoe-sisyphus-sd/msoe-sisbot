var uuid				= require('uuid');
var Backbone		= require('backbone');
//var os					= require('os');

var sisbot_state = Backbone.Model.extend({
	defaults: {
		id: uuid(),
		type: 'sisbot',
		pi_id: '',
		name: 'Sisyphus',
		firmware_version: "1.0",
		software_version: "1.0",
		hostname: "sisyphus.local",
		local_ip: "",

		is_available: "true",
		installing_updates: "false",
		installing_updates_error: "",
		factory_resetting: "false",
		factory_resetting_error: "",
		do_not_remind: "false",
		hostname_prompt: "false",

		state: "waiting", // playing, homing, paused, waiting
		brightness: 0.8,
		speed: 0.35,
		is_shuffle: "true",
		is_loop: "true",
		default_playlist_id: "F42695C4-AE32-4956-8C7D-0FF6A7E9D492", // default
		active_playlist_id: "false",
		active_track: { id: "false" }, // { id, vel, accel, thmax, reversed }
		_end_rho: 0,

		is_homed: "false",
		is_serial_open: "false",

		is_hotspot: "true",
		is_internet_connected: "false",

		wifi_network: "",
		wifi_password: ""
	},
	initialize: function() {
		//this.set({hostname: os.hostname()+".local", is_available: true});
	}
});

module.exports = sisbot_state;

var uuid				= require('uuid');
var Backbone		= require('backbone');
var os					= require('os');

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

		state: "waiting", // playing, homing, paused, waiting
		brightness: 0.8,
		speed: 0.35,
		is_shuffle: "true",
		is_loop: "true",
		active_playlist_id: "false",
		active_track_id: "false",
		_end_rho: 0,

		is_homed: "false",
		is_serial_open: "false",

		is_hotspot: "true",
		is_internet_connected: "false",

		wifi_network: "",
		wifi_password: ""
	},
	initialize: function() {
		this.set("hostname", os.hostname()+".local");
	}
});

module.exports = sisbot_state;

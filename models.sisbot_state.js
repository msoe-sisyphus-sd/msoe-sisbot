var uuid				= require('uuid');
var Backbone		= require('backbone');

var sisbot_state = Backbone.Model.extend({
	defaults: {
		id: uuid(),
		type: 'sisbot',
		pi_id: '',
		name: 'Sisyphus',
		firmware_version: "1.0",
		software_version: "1.0",
		hostname: "sisyphus.local",
		ip_address: "",

		state: "waiting", // playing, homing, paused, waiting
		brightness: 0.8,
		speed: 0.5,
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
	}
});

module.exports = sisbot_state;

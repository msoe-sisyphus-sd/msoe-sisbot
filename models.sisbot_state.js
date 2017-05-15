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

		state: "waiting", // playing, homing, paused, waiting
		brightness: 0.8,
		speed: 0.5,
		is_shuffle: "true",
		is_loop: "true",
		playlist_id: "false",
		track_id: "false",
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

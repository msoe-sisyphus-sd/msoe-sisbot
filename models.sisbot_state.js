var uuid				= require('uuid');
var Backbone		= require('backbone');
//var os					= require('os');

var sisbot_state = Backbone.Model.extend({
	defaults: {
		id						: uuid(),
		type					: 'sisbot',
		pi_id					: '',
		name					: 'Sisyphus',
		firmware_version		: "1.0",
		software_version		: "1.0",
		hostname				: "sisyphus.local",
		local_ip				: "",

		is_available				: "true",
		installing_updates			: "false",
		installing_updates_error	: "",
		factory_resetting			: "false",
		factory_resetting_error		: "",
		do_not_remind				: "false",
		hostname_prompt				: "false",

		state					: "waiting", // playing, homing, paused, waiting
		brightness				: 0.8,
		is_autodim				: "true",
		is_nightlight			: "false",
		nightlight_brightness	: 0.2,
		speed					: 0.35,
		is_shuffle				: "true",
		is_loop					: "true",
		is_paused_between_tracks : "false",
		is_waiting_between_tracks: "false",
		favorite_playlist_id	: "false",
		default_playlist_id		: "F42695C4-AE32-4956-8C7D-0FF6A7E9D492", // default
		active_playlist_id		: "false",
		active_track			: { id: "false" }, // { id, vel, accel, thmax, reversed }
		_end_rho				: 0,
		repeat_current			: "false", // use to keep playing selected track

		is_homed				: "false",
		is_serial_open			: "false",

		is_hotspot				: "true",
		is_internet_connected	: "false",
		service_connected		: {},

		is_sleeping				: "false",
		sleep_time				: "10:00 PM", // time to start sleep: H:MM A
		wake_time				: "8:00 AM", // time to wake up: H:MM A
		timezone_offset			: "-06:00", // Central time

		wifi_network			: "",
		wifi_password			: "",
		wifi_forget				: "false", // forget wifi credentials on fail to connect (from cloud)
		wifi_error				: "false", // flag to know if should be trying to reconnect to wifi

		share_log_files			: "false"
	},
	initialize: function() {
		//this.set({hostname: os.hostname()+".local", is_available: true});
	}
});

module.exports = sisbot_state;

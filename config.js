var _           = require('underscore');
var uuid				= require('uuid');

var config = {
		base: {
			version	: '0.5.11',
			debug   : false,
			default_domain: 'sisyphus.local',
			cert: function() {
				return {
					key: this.default_domain+"/privkey.pem",
					cert: this.default_domain+"/fullchain.pem"
				}
			},
			folders: {
				sisbot: 'sisbot',
				content: 'content',
				config: 'configs',
				tracks: 'tracks', // models
				cloud: 'siscloud',
				api: 'sisapi'
			},
			receiver : true, // receive messages from cloud
			sisbot_config : 'default.cson',
			sisbot_state : 'status.json',
			serial_path: '/dev/ttyACM0',
			autoplay: true,
			skip_incompatible: true,
			min_speed: 0.5,
			max_speed: 1.75,
			auto_th: 1.570796,
			failed_home_rho: 0.2,
			failed_home_th: 1.570796,
			max_rand_retries: 10,
			check_internet_interval: 1800000, //3600000, // once every hour, confirm an internet connection
			internet_retries: 5, // retry # of times before resetting to hotspot
			retry_internet_interval: 3000, // three seconds later
			default_data: [
				{
					id          : uuid(),
					name		: 'Sisyphus',
					type        : 'sisbot',
					hostname 	: 'sisyphus.local',
					ip_address : '',
					active_playlist_id: 'F42695C4-AE32-4956-8C7D-0FF6A7E9D492', // playlist to default start playing
					playlist_ids: [ 'F42695C4-AE32-4956-8C7D-0FF6A7E9D492' ],
					track_ids   : [ '2CBDAE96-EC22-48B4-A369-BFC624463C5F',
							'C3D8BC17-E2E1-4D6D-A91F-80FBB65620B8',
							'2B34822B-0A27-4398-AE19-23A3C83F1220',
							'93A90B6B-EAEE-48A3-9742-C688235D837D',
							'B7407A2F-04C3-4C92-B907-4C3869DA86D6',
							'7C046710-9F19-4423-B291-7394996F0913',
							'D14E0B41-E572-4B69-9827-4A07C503D031',
							'26FBFB10-4BC7-46BF-8D55-85AA52C19ADF',
							'75518177-0D28-4B2A-9B73-29E4974FB702', ]
				}, {
					id          : 'F42695C4-AE32-4956-8C7D-0FF6A7E9D492',
					type        : 'playlist',
					name        : 'Default Playlist',
					description : 'Description of Default Playlist',
					is_published: 'false',
					is_loop			: 'true',
					is_shuffle	: 'true',
					active_track_id: '2CBDAE96-EC22-48B4-A369-BFC624463C5F',
					active_track_index: 0,
					tracks   : [ {
						id:'2CBDAE96-EC22-48B4-A369-BFC624463C5F',
						vel: 8,
						accel: 0.5,
						thvmax: 1
					}, {
						id: 'C3D8BC17-E2E1-4D6D-A91F-80FBB65620B8',
						vel: 1,
						accel: 0.5,
						thvmax: 1
					}, {
						id: '2B34822B-0A27-4398-AE19-23A3C83F1220',
						vel: 1,
						accel: 0.5,
						thvmax: 1
					}, {
						id: '93A90B6B-EAEE-48A3-9742-C688235D837D',
						vel: 1,
						accel: 0.5,
						thvmax: 1
					}, {
						id: 'B7407A2F-04C3-4C92-B907-4C3869DA86D6',
						vel: 1,
						accel: 0.5,
						thvmax: 1
					}, {
						id: '7C046710-9F19-4423-B291-7394996F0913',
						vel: 1,
						accel: 0.5,
						thvmax: 1
					}, {
						id: 'D14E0B41-E572-4B69-9827-4A07C503D031',
						vel: 1,
						accel: 0.5,
						thvmax: 1
					}, {
						id: '26FBFB10-4BC7-46BF-8D55-85AA52C19ADF',
						vel: 1,
						accel: 0.5,
						thvmax: 1
					}, {
						id: '75518177-0D28-4B2A-9B73-29E4974FB702',
						vel: 1,
						accel: 0.5,
						thvmax: 1
					} ],
				}, {
					id          : '2CBDAE96-EC22-48B4-A369-BFC624463C5F',
					type        : 'track',
					name        : 'Erase',
					default_vel	: 8,
					firstR			: 0,
					lastR 			: 1,
					r_type			: 'r01'
				}, {
					id          : 'C3D8BC17-E2E1-4D6D-A91F-80FBB65620B8',
					type        : 'track',
					name        : 'Tensig 1',
					firstR			: 0,
					lastR 			: 1,
					r_type			: 'r01'
				}, {
					id          : '2B34822B-0A27-4398-AE19-23A3C83F1220',
					type        : 'track',
					name        : 'Sine',
					firstR			: 0,
					lastR 			: 0,
					r_type			: 'r00'
				}, {
					id          : '93A90B6B-EAEE-48A3-9742-C688235D837D',
					type        : 'track',
					name        : 'Circam 2S',
					firstR			: 0,
					lastR 			: 1,
					r_type			: 'r01'
				}, {
					id          : 'B7407A2F-04C3-4C92-B907-4C3869DA86D6',
					type        : 'track',
					name        : 'C Warp 3B',
					firstR			: 0,
					lastR 			: 1,
					r_type			: 'r01'
				}, {
					id          : '7C046710-9F19-4423-B291-7394996F0913',
					type        : 'track',
					name        : 'D Ces 4P',
					firstR			: 1,
					lastR 			: 1,
					r_type			: 'r11'
				}, {
					id          : 'D14E0B41-E572-4B69-9827-4A07C503D031',
					type        : 'track',
					name        : 'Hep',
					firstR			: 0,
					lastR 			: 1,
					r_type			: 'r01'
				}, {
					id          : '26FBFB10-4BC7-46BF-8D55-85AA52C19ADF',
					type        : 'track',
					name        : 'India 1P',
					firstR			: 1,
					lastR 			: 1,
					r_type			: 'r11'
				}, {
					id          : '75518177-0D28-4B2A-9B73-29E4974FB702',
					type        : 'track',
					name        : 'Para 2B',
					firstR			: 0,
					lastR 			: 1,
					r_type			: 'r01'
				}
			],
		},
		stopped: { // set NODE_ENV=sisbot_stopped to make it start without autoplaying
			autoplay: false,
		},
		testing: {
			testing: true,
		},
		dummy: {
			serial_path: "false",
		}
};

var config_obj = config.base;
if (process.env.NODE_ENV != undefined) {
	var envs = process.env.NODE_ENV.split('_');
	_.each(envs, function(env) {
		if (config[env] != undefined) _.extend(config_obj, config[env]);
	});
}

// run functions to eliminate them
var keys = Object.keys(config_obj);
_.each(keys, function(key) {
	if (_.isFunction(config_obj[key])) {
		config_obj[key] = config_obj[key]();
	}
});

module.exports = config_obj;

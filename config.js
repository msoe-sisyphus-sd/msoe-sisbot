var _           = require('underscore');
var uuid				= require('uuid');

var config = {
		base: {
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
			max_rand_retries: 10,
			check_internet_interval: 3600000, // once every hour, confirm an internet connection
			default_data: [
				{
					id          : uuid(),
					name		: 'Sisyphus',
					type        : 'sisbot',
					playlist_id: 'F42695C4-AE32-4956-8C7D-0FF6A7E9D492', // playlist to default start playing
					playlist_ids: [ 'F42695C4-AE32-4956-8C7D-0FF6A7E9D492' ],
					track_ids   : [ '2CBDAE96-EC22-48B4-A369-BFC624463C5F',
									'C3D8BC17-E2E1-4D6D-A91F-80FBB65620B8',
								 	'2B34822B-0A27-4398-AE19-23A3C83F1220',
									'93A90B6B-EAEE-48A3-9742-C688235D837D',
									'B7407A2F-04C3-4C92-B907-4C3869DA86D6',
									'7C046710-9F19-4423-B291-7394996F0913',
									'D14E0B41-E572-4B69-9827-4A07C503D031',
									'26FBFB10-4BC7-46BF-8D55-85AA52C19ADF',
									'75518177-0D28-4B2A-9B73-29E4974FB702' ]
				}, {
					id          : 'F42695C4-AE32-4956-8C7D-0FF6A7E9D492',
					type        : 'playlist',
					name        : 'Default Playlist',
					description : 'Description of Default Playlist',
					is_published: 'false',
					track_ids   : [ '01',
									'10',
									'2CBDAE96-EC22-48B4-A369-BFC624463C5F' ],
				}, {
					id          : '2CBDAE96-EC22-48B4-A369-BFC624463C5F',
					type        : 'track',
					name        : 'Erase',
				}, {
					id          : 'C3D8BC17-E2E1-4D6D-A91F-80FBB65620B8',
					type        : 'track',
					name        : 'Tensig 1',
				}, {
					id          : '2B34822B-0A27-4398-AE19-23A3C83F1220',
					type        : 'track',
					name        : 'Sine',
				}, {
					id          : '93A90B6B-EAEE-48A3-9742-C688235D837D',
					type        : 'track',
					name        : 'Circam 2S',
				}, {
					id          : 'B7407A2F-04C3-4C92-B907-4C3869DA86D6',
					type        : 'track',
					name        : 'C Warp 3B',
				}, {
					id          : '7C046710-9F19-4423-B291-7394996F0913',
					type        : 'track',
					name        : 'D Ces 4P',
				}, {
					id          : 'D14E0B41-E572-4B69-9827-4A07C503D031',
					type        : 'track',
					name        : 'Hep',
				}, {
					id          : '26FBFB10-4BC7-46BF-8D55-85AA52C19ADF',
					type        : 'track',
					name        : 'India 1P',
				}, {
					id          : '75518177-0D28-4B2A-9B73-29E4974FB702',
					type        : 'track',
					name        : 'Para 2B',
				}, {
					id          : '01',
					type        : 'track',
					name        : 'Zero One',
				}, {
					id          : '10',
					type        : 'track',
					name        : 'One Oh',
				}
			],
		},
		stopped: { // set NODE_ENV=sisbot_stopped to make it start without autoplaying
			autoplay: false,
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

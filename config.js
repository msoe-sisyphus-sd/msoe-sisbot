var _           = require('underscore');

var config = {
		base: {
			cert: function() {
				return {
					key: this.default_domain+"/private-key.pem",
					cert: this.default_domain+"/public-cert.pem"
				}
			},
			folders: {
				sisbot: 'sisbot',
				content: 'content',
				config: 'configs',
				tracks: 'models',
				cloud: 'siscloud',
				api: 'sisapi'
			}
		},
		dev: {
			port_ssl: 3101,
			port_redirect: 3000,
			default_domain: 'sisyphus.local'
		},
    travis: {
        base_dir: '/Users/kiefertravis/Documents',
        base_certs: '/Users/kiefertravis/Documents/ease_proxy/certs/'
    },
    matt: {
      base_dir		: '/Users/mattfox12/Documents/Sodo/Ease/sisbot-server',
      base_certs	: '/Users/mattfox12/Documents/Sodo/Ease/proxy/certs/',
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

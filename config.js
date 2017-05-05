var _           = require('underscore');

var config = {
		base: {
      base_dir				: '/home/pi/sisbot-server',
      base_certs			: '/home/pi/sisbot-server/certs/',
      default_domain	: 'withease.io',
			default_server	: 'api',
			port_ssl				: 443,
			port_redirect		: 80,
			neo4j           : 'TlNpb20yYjB1MnNkbwo=',
			cert: function() {
				return {
					key: this.default_domain+"/private-key.key",
					cert: this.default_domain+"/public-cert.crt"
				}
			},
			folders: {
				// api: 'api',
				sisbot: 'sisbot',
				content: 'content',
				config: 'configs',
				tracks: 'models'
			},
			servers: function() {
				return {
          // 'api': {
          //   dir         : this.base_dir+'/'+this.folders.api,
          //   port        : 3005,
          //   has_server  : true
          // },
          'sisbot': {
            dir         : this.base_dir+'/'+this.folders.sisbot,
            port        : 3010,
            has_server  : true
          }
        }
			},
			services: function() {
				return {
					// api: {
					// 	dir: this.base_dir+'/'+this.folders.api,
					// 	address: 'localhost',
					// 	port: 3005,
					// 	ansible_port: 8093,
					// 	connect: ['sisbot']
					// },
					sisbot: {
						dir: this.base_dir+'/'+this.folders.sisbot,
						address: 'localhost',
						port: 3010,
						ansible_port: 8095,
						connect: []
					}
				}
			}
		},
		dev: {
			port_ssl: 3101,
			port_redirect: 3000,
			default_domain: 'raspberrypi.local'
		},
    travis: {
        base_dir: '/Users/kiefertravis/Documents',
        base_certs: '/Users/kiefertravis/Documents/ease_proxy/certs/'
    },
    jon: {
      base_dir   	: '/Users/Jon/Documents/ease',
      base_certs 	: '/Users/Jon/Documents/ease/proxy/certs/',
    },
    matt: {
      base_dir		: '/Users/mattfox12/Documents/Sodo/Ease/sisbot-server',
      base_certs	: '/Users/mattfox12/Documents/Sodo/Ease/proxy/certs/',
    },
		station: {
      base_dir				: '/home/pi/sisbot-server',
      //base_certs	: '/Users/mattfox12/Documents/Sodo/Ease/proxy/certs/',
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

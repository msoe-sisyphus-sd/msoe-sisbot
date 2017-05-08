var config = {
  debug   : false,
	receiver : true, // receive messages from cloud
	sisbot_config : 'default.cson',
	serial_path: '/dev/ttyACM0',
	autoplay: false,
	skip_incompatible: true,
	max_rand_retries: 10
};

module.exports = config;

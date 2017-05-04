var config = {
  debug   : false,
	receiver : false, // receive messages from cloud
	sisbot_config : 'default.cson',
	serial_path: '/dev/ttyACM0',
	autoplay: true,
	skip_incompatible: true,
	max_rand_retries: 10
};

module.exports = config;

var config = {
  debug   : false,
	receiver : true, // receive messages from cloud
	sisbot_config : 'default.cson',
	serial_path: '/dev/ttyACM0',
	autoplay: true,
	skip_incompatible: true,
	max_rand_retries: 10,
	check_internet_interval: 3600000 // once every hour, confirm an internet connection
};

module.exports = config;

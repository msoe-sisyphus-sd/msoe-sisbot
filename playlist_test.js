var _ 				= require('underscore');
var Backbone		= require('backbone');

var default_status 	= require('./default_status.js');
var config 			= require('./config.js');

var Sisbot_state 	= require('./models.sisbot_state');
var Playlist 		= require('./models.playlist');
var Track 			= require('./models.track');

var index = -1;
var firstR = -1;
var lastR = -1;
var start_rho = 0;

var error = false;
var count = 0;

var collection = new Backbone.Collection();
_.each(default_status, function(obj) {
	switch (obj.type) {
		case "track":
			collection.add(new Track(obj));
			break;
		case "playlist":
			collection.add(new Playlist(obj));
			break;
		case "sisbot":
			collection.add(new Sisbot_state(obj));
			break;
		default:
			logEvent(1, "Unknown:", obj);
			collection.add(obj);
	}
});

collection.each(function (obj) {
	obj.collection = collection;
	obj.config = config;

	switch (obj.get('type')) {
		case 'track':
			if (obj.get('firstR') < 0 || obj.get('lastR') < 0) obj.get_verts(); // load thr file to get the first/last rho values
			break;
		default:
			break;
	}
});

var playlist = collection.get('F42695C4-AE32-4956-8C7D-0FF6A7E9D492');

// var final_order = playlist.get('sorted_tracks');
// var first_rs = _.pluck(playlist.get('tracks'),'firstR');
// var last_rs = _.pluck(playlist.get('tracks'),'lastR');
// for (var i=0; i<final_order.length; i++) {
// 	console.log("["+final_order[i]+", r"+first_rs[final_order[i]]+last_rs[final_order[i]]+"]");
// }
//
// console.log("["+playlist.get('sorted_tracks')[0]+","+playlist.get('sorted_tracks')[playlist.get('sorted_tracks').length-1]+"]", "["+playlist.get('next_tracks')[0]+","+playlist.get('next_tracks')[playlist.get('next_tracks').length-1]+"]");
// console.log("Shuffle Track: "+playlist.get_current_track()._index, playlist.get_current_track().firstR, playlist.get_current_track().lastR, playlist.get_current_track().reversed);

while(!error) {
	playlist.set("active_track_index", -1);
	playlist.reset_tracks(); // start with non-reversed list
	playlist.set_shuffle({ is_shuffle: 'true', start_rho: start_rho });

	index = playlist.get_current_track()._index;
	firstR = playlist.get_current_track().firstR;
	lastR = playlist.get_current_track().lastR;
	if (start_rho != playlist.get_current_track().firstR) {
		error = true;
	}
	if (playlist.get('sorted_tracks')[playlist.get('sorted_tracks').length-1] != playlist.get('next_tracks')[0]) error = true;
	console.log("["+playlist.get('sorted_tracks')[0]+","+playlist.get('sorted_tracks')[playlist.get('sorted_tracks').length-1]+"]", "["+playlist.get('next_tracks')[0]+","+playlist.get('next_tracks')[playlist.get('next_tracks').length-1]+"]");

	playlist.set_shuffle({ is_shuffle: 'false' });
	if (start_rho != playlist.get_current_track().firstR || index != playlist.get_current_track()._index || firstR != playlist.get_current_track().firstR || lastR != playlist.get_current_track().lastR) {
		error = true;
	}
	if (playlist.get('sorted_tracks')[playlist.get('sorted_tracks').length-1] != playlist.get('next_tracks')[playlist.get('next_tracks').length-1]) error = true;
	console.log("["+playlist.get('sorted_tracks')[0]+","+playlist.get('sorted_tracks')[playlist.get('sorted_tracks').length-1]+"]", "["+playlist.get('next_tracks')[0]+","+playlist.get('next_tracks')[playlist.get('next_tracks').length-1]+"]");

	playlist.set_shuffle({ is_shuffle: 'true' });
	if (start_rho != playlist.get_current_track().firstR || index != playlist.get_current_track()._index || firstR != playlist.get_current_track().firstR || lastR != playlist.get_current_track().lastR) {
		error = true;
	}
	if (playlist.get('sorted_tracks')[playlist.get('sorted_tracks').length-1] != playlist.get('next_tracks')[0]) error = true;
	console.log("["+playlist.get('sorted_tracks')[0]+","+playlist.get('sorted_tracks')[playlist.get('sorted_tracks').length-1]+"]", "["+playlist.get('next_tracks')[0]+","+playlist.get('next_tracks')[playlist.get('next_tracks').length-1]+"]");

	for (var i=0; i < playlist.get('sorted_tracks').length * 2; i++) {
		playlist.get_next_track_id();
		// console.log("Play next: ", playlist.get_next_track_id());
	}

	count++;
	console.log("COUNT "+count);
}

console.log("!!!!!!!!!! ERROR AFTER "+ count +" !!!!!!!!!!");

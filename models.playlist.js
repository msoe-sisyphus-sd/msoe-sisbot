var uuid				= require('uuid');
var _						= require('underscore');
var Backbone		= require('backbone');

var playlist = Backbone.Model.extend({
	defaults: {
		id: 						uuid(),
		type: 					"playlist",
		name: 					"",

		is_loop: 				"true",
		is_shuffle: 		"true",

		current_track: 	0,
		track_ids: 			[],
		sorted_tracks:	[]
	},
	collection: null,
	get_current_track_id: function() {
		var tracks = this.get("sorted_tracks");
		return tracks[this.get("current_track")];
	},
	get_current_track: function() {
		return this.collection.get(this.get_current_track_id());
	},
	get_next_track_id: function() {
		var track_index = this.get("current_track");
		var tracks = this.get("sorted_tracks");

		track_index++;
		if (track_index >= tracks.length) {
			if (!this.get("is_loop")) {
				track_index = -1; // value before first index (if we call get next track again, it will be zero)
				return "false";
			}
			track_index = 0;
		}
		this.set("current_track", track_index);

		return tracks[track_index];
	},
	get_next_track: function() { // increments the current_track and returns the id
		return this.collection.get(this.get_next_track_id());
	},
	set_random: function(value) {
		var randomized = this.get('is_shuffle');
		if (value != randomized) {
			this.set("randomized", String(Boolean(value))); // set to "true" or "false"

			if (Boolean(value)) {
				this._randomize();
			} else {
				var tracks = this.get("track_ids");
				this.set("sorted_tracks", tracks.slice()); // ensure unlinked copy
			}
		}
	},
	set_repeat: function(value) {
		this.set("is_looping", String(Boolean(value)));
	},
	_randomize: function() {
		var self = this;
		console.log("Randomize Playlist");

		// insert random value to end (if it verifies),
		// else put in front (if it verifies),
		// else next, or if end and doesn't fit either, start over
		var remaining_tracks = this.get("track_ids").slice();
		var randomized_tracks = [];
		var best_matches = [];
		var best_count = 0;
		var retries = 0;

		while (remaining_tracks.length > 0) {
			var rand = Math.floor(Math.random()*remaining_tracks.length);
			var next_track = remaining_tracks[rand];
			var success = false;

			//console.log("Place track", next_track, this.tracks[next_track]);
			var track_obj = this.collection.get(next_track);

			if (randomized_tracks.length > 0) {
				var first_track = randomized_tracks[0];
				var last_track = randomized_tracks[randomized_tracks.length-1];

				// add to end or front
				//console.log("Track comparison", randomized_tracks.length, track_obj, first_track, last_track);
				if (last_track.lastR == track_obj.firstR && last_track.id != track_obj.id) {
					randomized_tracks.push(track_obj);
					success = true;
				} else if (last_track.lastR == track_obj.lastR && track_obj.reversible && last_track.id != track_obj.id) {
					randomized_tracks.push(this._reverseTrack(track_obj));
					success = true;
				} else if (first_track.firstR == track_obj.lastR && first_track.id != track_obj.id) {
					randomized_tracks.unshift(track_obj);
					success = true;
				} else if (first_track.firstR == track_obj.firstR && track_obj.reversible && first_track.id != track_obj.id) {
					randomized_tracks.unshift(this._reverseTrack(track_obj));
					success = true;
				} else {
					//console.log("Track unable to fit", track_obj, first_track.firstR, last_track.lastR);
				}
			} else { // only track, just add
				randomized_tracks.push(track_obj);
				success = true;
			}

			if (success) {
				remaining_tracks.splice(rand,1);
			} else {
				var first_track = randomized_tracks[0];
				var last_track = randomized_tracks[randomized_tracks.length-1];
				var no_win = true;
				// check for no-win situation
				_.each(remaining_tracks, function(track) {
					var track_obj = self.collection.get(track);

					if (first_track.firstR == track_obj.firstR ||
						first_track.firstR == track_obj.lastR ||
						last_track.lastR == track_obj.firstR ||
						last_track.lastR == track_obj.lastR) {
							no_win = false;
					}
				});

				if (no_win) {
					console.log("No solution, try again");
					// save best match
					if (best_count < randomized_tracks.length) {
						//console.log("Merge", randomized_tracks, remaining_tracks);
						best_count = randomized_tracks.length;
						var append_list = [];
						_.each(remaining_tracks, function(remaining_track) {
							var track_obj = self.collection.get(remaining_track);
							append_list.push(track_obj);
						});
						best_matches = randomized_tracks.concat(append_list);
					}
					// cancel out if retries is greater than max
					if (retries >= self.config.max_rand_retries) {
						randomized_tracks = best_matches.slice();
						remaining_tracks = [];
					} else {
						remaining_tracks = self.get("track_ids").slice();
						randomized_tracks = [];
						retries++;
					}
				}
			}
		}

		this.set("sorted_tracks", _.pluck(randomized_tracks,'id'));
		console.log("Randomized Tracks, retries:", retries, "best:", best_count, this.get("sorted_tracks"));
	}
});

module.exports = playlist;

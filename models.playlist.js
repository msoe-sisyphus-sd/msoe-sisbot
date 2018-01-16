var uuid				= require('uuid');
var _						= require('underscore');
var Backbone		= require('backbone');

var playlist = Backbone.Model.extend({
	defaults: {
		id					: uuid(),
		type				: "playlist",
		name				: "",

		is_loop				: "true",
		is_shuffle			: "true",

		active_track_index	: 0,
		active_track_id		: "false",
		tracks				: [], // list of objects { id, vel, accel, thvmax, reversed, firstR, lastR, reversible }
		sorted_tracks		: [] // list of index in tracks
	},
	collection: null,
	initialize: function() {
		// build sorted_tracks if empty
		if (this.get("sorted_tracks").length == 0) {
			var sorted_tracks = [];
			_.each(this.get('tracks'), function(obj,index) {
				sorted_tracks.push(index);
			});

			this.set("sorted_tracks", sorted_tracks);
		}
	},
	reset_tracks: function() { // get unchanged values from collection
		var self = this;

		var current_track = this.get_current_track();
		var retain_obj = JSON.parse(JSON.stringify(current_track));

		_.each(this.get('tracks'), function(obj, index) {
			var track_model = self.collection.get(obj.id);
			obj.name = track_model.get('name');
			obj._index = index;
			if (obj._index == retain_obj._index) {
				console.log("Don't change", obj._index, obj.firstR, obj.lastR);
			} else {
				obj.firstR = track_model.get('firstR');
				obj.lastR = track_model.get('lastR');
				obj.reversed = "false";
			}
		});
	},
	_update_tracks: function(data) { // fix reversed state for non-randomized list
		var self		= this;
		var sorted_list = this.get('sorted_tracks');
		if (sorted_list.length < 1) return false;
		var start_rho	= 0; // homed
		if (data != undefined && data.start_rho) start_rho = data.start_rho;

		// make sure current track does not change current first/lastR values
		var current_track;
		if (data.current_track_index == undefined) {
			current_track = this.get_current_track();
		} else {
			current_track = this.get('tracks')[data.current_track_index];
		}
		var retain_obj = JSON.parse(JSON.stringify(current_track));

		console.log("Playlist: _update_tracks", start_rho, "current_index", retain_obj._index, sorted_list);

		if (this.get("is_shuffle") == "false") {
			var track0 = this.get('tracks')[sorted_list[0]];
			if (track0._index != retain_obj._index && track0.firstR != start_rho) {
				if (track0.lastR != track0.firstR) { // reversible
					console.log("Reverse First Track", track0);
					this._reverseTrack(track0);
				}
			}
		}

		for(var i=0; i<sorted_list.length-1; i++) {
			var track0 = this.get('tracks')[sorted_list[i]];
			var track1 = this.get('tracks')[sorted_list[i+1]];

			if (track1._index == retain_obj._index) {
				console.log("Don't change this: ", track1._index, track1.firstR, track1.lastR);
			} else if (track0.lastR != track1.firstR) {
				if (track1.lastR != track1.firstR) { // reversible
					this._reverseTrack(track1);
				} else {
					//console.log("Unable to transition between", track0._index, track0.lastR, track1._index, track1.firstR);
				}
			}
		}
	},
	_reverseTrack: function(track_obj) {
		var tempR = track_obj.lastR;
		track_obj.lastR = track_obj.firstR;
		track_obj.firstR = tempR;
		track_obj.reversed = "true";
		return track_obj;
	},
	get_next_track_id: function(data) {
		var return_value = "false";
		var track_index = this.get("active_track_index");
		var sorted_tracks = this.get("sorted_tracks");
		var tracks = this.get("tracks");
		if (tracks.length <= 0) return return_value;

		track_index++;
		var did_loop = false;
		if (track_index >= tracks.length) {
			track_index = 0;
			if (this.get("is_loop") == "false") {
				track_index = -1; // value before first index (if we call get next track again, it will be zero)
			} else { // make sure they flow together again
				did_loop = true;
			}
		}
		if (track_index >= 0) return_value = tracks[sorted_tracks[track_index]].id;

		this.set("active_track_index", track_index);
		this.set("active_track_id", return_value);

 		// check for last track & looping so we can reshuffle if needed
		if (track_index >= tracks.length-1 && this.get("is_loop") == "true") {
			if (this.get("is_shuffle") == "true") {
				// reset randomized tracks
				this.set_shuffle(true);
			}

			this._update_tracks(data); // make sure to recalculate reverse values
		}

		return return_value;
	},
	get_current_track: function() {
		var track_index = this.get("active_track_index");
		if (!_.isNumber(track_index)) track_index = -1;
		if (track_index < 0) return { id: "false" };

		return this.get("tracks")[this.get("sorted_tracks")[track_index]];
	},
	get_next_track: function(data) { // increments the active_track_index and returns the id
		var track_id = this.get_next_track_id(data);
		if (track_id != "false") return this.get("tracks")[this.get("sorted_tracks")[this.get("active_track_index")]];

		// return false if no next track available
		return { id: "false" };
	},
	set_shuffle: function(value) {
		var current_track = JSON.parse(JSON.stringify(this.get_current_track()));
		//console.log("Current Track Before", current_track);
		console.log("Playlist set shuffle", value);
		this.set("is_shuffle", String(value)); // set to "true" or "false"

		if (String(value) == "true" && this.get('tracks').length > 0) {
			this._randomize();
		} else {
			this.reset_tracks();
			var sorted_tracks = _.pluck(this.get("tracks"), "_index");
			this.set("sorted_tracks", sorted_tracks);
			this._update_tracks({ current_track_index: current_track._index });

			// reassign current playing track index
			if (current_track.id != "false") this.set("active_track_index", current_track._index);

			var final_order = _.pluck(this.get('tracks'),'_index');
			var first_rs = _.pluck(this.get('tracks'),'firstR');
			var last_rs = _.pluck(this.get('tracks'),'lastR');
			for (var i=0; i<final_order.length; i++) {
				console.log("["+final_order[i]+", r"+first_rs[i]+last_rs[i]+"]")
			}
		}

		var after_track = JSON.parse(JSON.stringify(this.get_current_track()));
		if (current_track.id != "false" && (current_track.firstR != after_track.firstR || current_track.lastR != after_track.lastR)) {
			console.log("ERROR!!!", current_track, after_track);
		}
	},
	set_loop: function(value) {
		this.set("is_loop", String(value));
	},
	_randomize: function() {
		var self = this;
		console.log("Randomize Playlist", this.get("active_track_index"));

		// insert random value to end (if it verifies),
		// else next, or if end and doesn't fit either, start over
		var active_index = this.get('sorted_tracks')[this.get("active_track_index")];
		var remaining_tracks = this.get("tracks").slice();
		var randomized_tracks = [];
		var best_matches = [];
		var best_count = 0;
		var retries = 0;

		_.each(remaining_tracks, function(track, index) {
			track._index = index;
			if (track.firstR != track.lastR) track.reversible = "true";
		}); // */
		//console.log("Remaining Tracks", remaining_tracks.length);

		var current_track = this.get_current_track();
		if (current_track.id != "false") {
			//console.log("Start Random Playlist with", current_track);
			randomized_tracks.push(current_track);
			remaining_tracks.splice(active_index,1);
		}

		while (remaining_tracks.length > 0) {
			//console.log("Remaining Tracks", remaining_tracks.length);
			var rand = Math.floor(Math.random()*remaining_tracks.length);
			var track_obj = remaining_tracks[rand];
			var success = false;

			//console.log("Place track", track_obj);

			if (randomized_tracks.length > 0) {
				var last_track = randomized_tracks[randomized_tracks.length-1];

				// add to end
				//console.log("Track comparison", randomized_tracks.length, track_obj, last_track);
				if (last_track.id == track_obj.id) {
					//console.log("Skip same track", last_track);
				} else if (last_track.lastR == track_obj.firstR) {
					//console.log("Track success L/F", last_track._index, last_track.lastR, track_obj._index, track_obj.firstR);
					randomized_tracks.push(track_obj);
					success = true;
				} else if (last_track.lastR == track_obj.lastR && track_obj.reversible != undefined && track_obj.reversible == "true") {
					var reversed_track = self._reverseTrack(track_obj);
					//console.log("Track success Rev", last_track._index, last_track.lastR, reversed_track._index, reversed_track.firstR);
					randomized_tracks.push(reversed_track);
					success = true;
				} else {
					//console.log("Track unable to fit", last_track._index, last_track.lastR, track_obj);
				}
			} else { // only track, just add
				randomized_tracks.push(track_obj);
				success = true;
			}

			if (success) {
				remaining_tracks.splice(rand,1);
			} else {
				var last_track = randomized_tracks[randomized_tracks.length-1];
				var no_win = true;
				// check for no-win situation
				_.each(remaining_tracks, function(track_obj) {
					if ((last_track.lastR == track_obj.firstR || last_track.lastR == track_obj.lastR) && last_track.id != track_obj.id) {
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
						_.each(remaining_tracks, function(track_obj) {
							append_list.push(track_obj);
						});
						best_matches = randomized_tracks.concat(append_list);
					}
					// cancel out if retries is greater than max
					if (retries >= self.config.max_rand_retries) {
						randomized_tracks = best_matches.slice();
						remaining_tracks = [];
					} else {
						remaining_tracks = self.get("tracks").slice();
						randomized_tracks = [];

						_.each(remaining_tracks, function(track, index) {
							track._index = index;
							if (track.firstR != track.lastR) track.reversible = "true";
						});

						var current_track = this.get_current_track();
						if (current_track.id != "false") {
							//console.log("Start Random Playlist with", current_track);
							randomized_tracks.push(current_track);
							remaining_tracks.splice(active_index,1);
						}

						//console.log("Retry", randomized_tracks);
						retries++;
					}
				}
				//console.log("Try again", last_track.name, last_track._index, last_track.lastR);
			}
		}

		var final_order = _.pluck(randomized_tracks,'_index');
		var first_rs = _.pluck(randomized_tracks,'firstR');
		var last_rs = _.pluck(randomized_tracks,'lastR');

		// update tracks to match firstR, lastR, reversed
		_.each(randomized_tracks, function(track_obj) {
			var track = self.get('tracks')[track_obj._index];
			track.firstR = track_obj.firstR;
			track.lastR = track_obj.lastR;
			track.reversed = track_obj.reversed;
		});

		// update self with randomly ordered list
		this.set({sorted_tracks: final_order, active_track_index: 0});

		console.log("Randomized Tracks, retries:", retries, "best:", best_count);
		for (var i=0; i<final_order.length; i++) {
			console.log("["+final_order[i]+", r"+first_rs[i]+last_rs[i]+"]")
		}
		console.log("First Track", this.get('tracks')[this.get("sorted_tracks")[this.get("active_track_index")]]);
	}
});

module.exports = playlist;

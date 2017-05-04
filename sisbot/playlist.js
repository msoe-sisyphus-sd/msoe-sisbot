var fs				= require('fs');
var _					= require('underscore');

var playlist = {
	config: {},
	currentTrack: -1,
	name: '',
	repeat: true,
	randomized: false,
	track_ids: [],
	sorted_tracks: [],
	vel: 1,
	accel: 0.5,
	thvmax: 0.5,

	_rlast: 0,

	init: function(config, data) {
		this.config = config;
		this.name = data.name;
		this.repeat = Boolean(data.repeat);
		this.randomized = Boolean(data.randomized);
		this.track_ids = data.track_ids;
		this.sorted_tracks = data.track_ids;
		this.tracks = data.tracks;
		if (data.vel) this.vel = data.vel;
		if (data.accel) this.accel = data.accel;
		if (data.thvmax) this.thvmax = data.thvmax;
	},
	_reverseTrack: function(track) {
		if (track.reversible) {
			track.verts.reverse();

			track.reversed = !track.reversed;
			var temp = track.firstR;
			track.firstR = track.lastR;
			track.lastR = temp;
			track.type = 'r'+track.firstR+track.lastR;
		}
	},
	getCurrentTrack: function() {
		return currentTrack;
	},
	getNextTrack: function() {
		this.currentTrack++;
		if (this.currentTrack > this.sorted_tracks.length) {
			if (!this.repeat) return null;
			this.currentTrack = 0;
		}
		var track = null;

		try {
			var track_id = this.sorted_tracks[this.currentTrack];
			track = JSON.parse(fs.readFileSync(this.config.base_dir+'/'+this.config.folders.content+'/'+this.config.folders.tracks+'/'+track_id+'.json', 'utf8'));

			if (this._rlast != track.firstR) {
				if (track.reversible) {
					this._reverseTrack(track);
				} else {
					console.log("Next track incompatible", track.name);
					if (this.config.skip_incompatible) {
						track = this.getNextTrack();
					} else {
						track = null;
					}
				}
			}
		} catch(err) {
			console.log("Track error:", err);
		}

		return track;
	},
	getTrackType: function(name) {
		//
	},
	randomize: function() {
		var self = this;
		// insert random value to end (if it verifies),
		// else put in front (if it verifies),
		// else next, or if end and doesn't fit either, start over
		var remaining_tracks = this.track_ids.slice();
		var randomized_tracks = [];

		while (remaining_tracks.length > 0) {
			var rand = Math.floor(Math.random()*remaining_tracks.length);
			var next_track = remaining_tracks[rand];
			var success = false;

			console.log("Place track", next_track, this.tracks[next_track]);
			var track_r = this.tracks[next_track];
			var firstR = parseInt(track_r.substring(1,1));
			var lastR = parseInt(track_r.substring(2,1));
			var track_obj = {
				id: next_track,
				firstR: firstR,
				lastR: lastR,
				reversible: (firstR != lastR),
				reversed: false,
				verts: [] // purposely empty
			};

			if (randomized_tracks.length > 0) {
				var first_track = randomized_tracks[0];
				var last_track = randomized_tracks[randomized_tracks.length-1];

				// add to end?
				if (last_track.lastR == track_obj.firstR) {
					randomized_tracks.push(track_obj);
					success = true;
				} else if (last_track.lastR == track_obj.lastR && track_obj.reversible) {
					randomized_tracks.push(this._reverseTrack(track_obj));
					success = true;
				} else if (first_track.firstR == track_obj.lastR) {
					randomized_tracks.unshift(track_obj);
					success = true;
				} else if (first_track.firstR == track_obj.firstR && track_obj.reversible) {
					randomized_tracks.unshift(this._reverseTrack(track_obj));
					success = true;
				} else {
					console.log("Track unable to fit", track_obj, first_track, last_track);
				}
			} else {
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
					var track_r = self.tracks[track].r;
					var firstR = parseInt(track_r.substring(1,1));
					var lastR = parseInt(track_r.substring(2,1));
					var track_obj = {
						id: track,
						firstR: firstR,
						lastR: lastR,
						reversible: (firstR != lastR),
						reversed: false,
						verts: [] // purposely empty
					};

					if (first_track.firstR == track_obj.firstR ||
						first_track.firstR == track_obj.lastR ||
						first_track.lastR == track_obj.firstR ||
						first_track.lastR == track_obj.lastR ||
						last_track.firstR == track_obj.firstR ||
						last_track.firstR == track_obj.lastR ||
						last_track.lastR == track_obj.firstR ||
						last_track.lastR == track_obj.lastR) {
							no_win = false;
					}
				});

				if (no_win) {
					console.log("No solution, try again");
					remaining_tracks = this.track_ids.slice();
					randomized_tracks = [];
				}
			}
		}

		console.log("Randomized Tracks", _.pluck(randomized_tracks,'id'));
	},
	setRepeat: function(value) {
		this.repeat = Boolean(value);
		return this.repeat;
	}
};

module.exports = playlist;

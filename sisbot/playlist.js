var fs				= require('fs');

var playlist = {
	currentTrack: -1,
	name: '',
	repeat: true,
	randomized: false,
	track_ids: [],
	sorted_tracks: [],
	vel: 1,
	accel: 0.5,
	thvmax: 0.5,

	init: function(data) {
		this.name = data.name;
		this.repeat = Boolean(data.repeat);
		this.randomized = Boolean(data.randomized);
		this.track_ids = data.track_ids;
		this.sorted_tracks = data.track_ids;
		if (data.vel) this.vel = data.vel;
		if (data.accel) this.accel = data.accel;
		if (data.thvmax) this.thvmax = data.thvmax;
	},
	_reverseTrack: function() {
		//
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

		return this.sorted_tracks[this.currentTrack];
	},
	getTrackType: function(name) {
		//
	},
	randomize: function() {
		//
	},
	setRepeat: function(value) {
		this.repeat = Boolean(value);
		return this.repeat;
	}
};

module.exports = playlist;

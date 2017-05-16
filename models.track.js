var uuid				= require('uuid');
var fs					= require('fs');
var _						= require('underscore');
var Backbone		= require('backbone');

var track = Backbone.Model.extend({
	defaults: {
		id: 				uuid(),
		type: 			'track',
		name: 			'',
		vel:				1,
		accel:			0.5,
		thvmax:			1,
		reversed:		"false",
		firstR:			0,
		lastR:			1,
		r_type:			"r01",
		reversible:	"true"
	},
	collection: null,
	get_plotter_obj: function(data) {
		var return_obj = this.toJSON();
		if (data.reversed) {
			return_obj.verts = this.get_reverse_verts();
		} else {
			return_obj.verts = this.get_verts();
		}
		return return_obj;
	},
	get_verts: function() {
		var self = this;
		var return_value = [];

		fs.readFile(this.config.base_dir+'/'+this.config.folders.sisbot+'/'+this.config.folders.content+'/'+this.config.folders.tracks+'/'+this.get('id')+'.thr', function(err, data) {
			if (err) { console.error(err); }

			// Step the file, line by line
			var lines = data.toString().trim().split('\n');
			var regex = /^\s*$/; // eliminate empty lines

			_.map(lines, function(line) {
				line.trim();

				if (line.length > 0 && line.substring(0,1) != '#' && !line.match(regex)) {
					var values = line.split(/\s+/);
					var entry = {th:parseFloat(values[0]),r:parseFloat(values[1])};
					return_value.push(entry);
				}
			});

			// !! error check !!
			if (return_value[0].r != self.get("firstR")) console.log("R[0] not matching", return_value[0].r, self.get("firstR"));
			if (return_value[return_value.length-1].r != self.get("lastR")) console.log("R[n] not matching", return_value[return_value.length-1].r, self.get("lastR"));

			console.log("Track verts", return_value.length);
		});
		return return_value;
	},
	get_reverse_verts: function() {
		var return_value = [];

		if (this.get("reversible") == "true") {
			return_value = this.get_verts();
			return_value.reverse();

			console.log("Reverse track", this.get("name"), this.get("r_type"), this.get("firstR"), this.get("lastR"));
		}

		return return_value;
	}
});

module.exports = track;

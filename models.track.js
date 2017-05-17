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
		firstR:			-1, // so we can auto-collect from thr if not given
		lastR:			-1, // so we can auto-collect from thr if not given
		r_type:			"r", // so we can auto-collect from thr if not given
		reversible:	"true"
	},
	collection: null,
	get_plotter_obj: function(data) {
		var return_obj = {verts: this.get_verts()};
		_.extend(return_obj, this.toJSON());
		if (data.start != return_obj.firstR) {
			console.log("Compare", data, return_obj.r_type);
			if (return_obj.reversible == "true") {
				console.log("Reverse track");
				return_obj.verts.reverse();
				var temp = return_obj.firstR;
				return_obj.firstR = return_obj.lastR;
				return_obj.lastR = temp;
				return_obj.r_type = 'r'+return_obj.firstR+return_obj.lastR;
				return_obj.reversed = "true";
			} else {
				console.log("Track cannot be cleanly started");
				return "false";
			}
		}
		return return_obj;
	},
	get_verts: function() {
		console.log("Get Verts",this.config.base_dir+'/'+this.config.folders.sisbot+'/'+this.config.folders.content+'/'+this.config.folders.tracks+'/'+this.get('id')+'.thr');
		var self = this;
		var return_value = [];

		var data = fs.readFileSync(this.config.base_dir+'/'+this.config.folders.sisbot+'/'+this.config.folders.content+'/'+this.config.folders.tracks+'/'+this.get('id')+'.thr', 'utf8');

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
		if (return_value[0].r != self.get("firstR")) {
			console.log("R[0] not matching", return_value[0].r, self.get("firstR"));
			this.set({firstR: return_value[0].r, r_type:"r"+return_value[0].r+this.get("lastR")});
		}
		if (return_value[return_value.length-1].r != self.get("lastR")) {
			console.log("R[n] not matching", return_value[return_value.length-1].r, self.get("lastR"));
			this.set({lastR: return_value[return_value.length-1].r, r_type:"r"+this.get("firstR")+return_value[return_value.length-1].r});
		}
		if (this.get('firstR') == this.get('lastR')) this.set('reversible', 'false');

		//console.log("Track verts", return_value.length);

		return return_value;
	}
});

module.exports = track;

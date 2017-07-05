var uuid				= require('uuid');
var fs					= require('fs');
var _						= require('underscore');
var Backbone		= require('backbone');

var track = Backbone.Model.extend({
	defaults: {
		id: 				uuid(),
		type: 			'track',
		name: 			'',
		default_vel:				1,
		default_accel:			0.5,
		default_thvmax:			1,
		//reversed:		"false", // moved to playlist
		firstR:			-1, // so we can auto-collect from thr if not given
		lastR:			-1, // so we can auto-collect from thr if not given
		r_type:			"r", // so we can auto-collect from thr if not given
		reversible:	"true"
	},
	collection: null,
	get_plotter_obj: function(data) {
		var return_obj = {};
		var this_json = this.toJSON();
		delete this_json.verts;
		_.extend(return_obj, data);
		return_obj.verts = this.get_verts(); // make sure verts are in the object to send to plotter
		_.extend(return_obj, this_json);
		//console.log("Get Plotter Obj", data, return_obj);
		if (data.start != return_obj.firstR || (data.reversed != undefined && data.reversed == "true")) {
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

		// make sure first/last rho is 0 or 1
		if (return_value[0].r != 0 && return_value[0].r != 1) {
			console.log("Invalid track start", return_value[0].r);
			return_value[0].r = Math.round(return_value[0].r);
		}
		if (return_value[return_value.length-1].r != 0 && return_value[return_value.length-1].r != 1) {
			console.log("Invalid track end", return_value[return_value.length-1].r);
			return_value[return_value.length-1].r = Math.round(return_value[return_value.length-1].r);
		}

		// !! error check !!
		if (return_value[0].r != self.get("firstR")) {
			console.log("R[0] not matching", return_value[0].r, self.get("firstR"));
			this.set({firstR: return_value[0].r, r_type:"r"+return_value[0].r+this.get("lastR")});
		}
		if (return_value[return_value.length-1].r != self.get("lastR")) {
			console.log("R[n] not matching", return_value[return_value.length-1].r, self.get("lastR"));
			this.set({lastR: return_value[return_value.length-1].r, r_type:"r"+this.get("firstR")+return_value[return_value.length-1].r});
		}
		if (this.get('firstR') == this.get('lastR')) {
			this.set('reversible', 'false');
		} else {
			this.set('reversible', 'true');
		}

		console.log("Track verts", return_value.length, self.get("r_type"));

		return return_value;
	}
});

module.exports = track;

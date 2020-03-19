var uuid			= require('uuid');
var fs				= require('fs');
var _				= require('underscore');
var Backbone		= require('backbone');

var track = Backbone.Model.extend({
	defaults: {
		id				: uuid(),
		type			: 'track',
		name			: '',
		default_vel		: 1,
		default_accel	: 0.5,
		default_thvmax	: 1,
		//reversed:		"false", // moved to playlist
		firstR			: -1, // so we can auto-collect from thr if not given
		lastR			: -1, // so we can auto-collect from thr if not given
		r_type			: "r", // so we can auto-collect from thr if not given
		reversible		: "true"
	},
	collection: null,
	get_plotter_obj: function(plotter_data, auto_track_start_rho) {
		// console.log("Get Plotter Obj", this.get("name"), plotter_data);
		var return_obj = {};
		var this_json = this.toJSON();
		delete this_json.verts;
		_.extend(return_obj, plotter_data);
		return_obj.verts = this.get_verts(); // make sure verts are in the object to send to plotter

		if (return_obj.verts.length < 1) {
			console.log(this.get("name"), "Track cannot be cleanly started");
			return "false";
		}

		_.extend(return_obj, this_json);

		// make sure vel, accel, thvmax are set
		if (return_obj.vel == undefined) return_obj.vel = this.get('default_vel');
		if (return_obj.accel == undefined) return_obj.accel = this.get('default_accel');
		if (return_obj.thvmax == undefined) return_obj.thvmax = this.get('default_thvmax');

		//console.log("#### PLOTTER OBJ", plotter_data);
		//console.log('#### THIS OBJ', this_json);
		//console.log('#### RETURN OBJ', return_obj);
		//console.log('#### ERROR CHECKING', plotter_data.start, return_obj.firstR, plotter_data.reversed, return_obj.reversible);

		if (plotter_data.start != this_json.firstR && this_json.reversible == 'true') {
			// WE NEED TO REVERSE THE TRACK
			// console.log("Reverse track", plotter_data, this.json);
			return_obj.verts.reverse();
			return_obj.firstR	= this_json.lastR;
			return_obj.lastR	= this_json.firstR;
			return_obj.r_type	= 'r' + return_obj.firstR + return_obj.lastR;
			return_obj.reversed = "true";
		}

		// throw error if we won't auto-move to start rho
		if (auto_track_start_rho != true && plotter_data.start !== return_obj.firstR) {
			console.log(this.get("name"), "Track cannot be cleanly started");
			return "false";
		}

		//console.log("#### SUCCESSFUL STATE OF SAME R VALUE", plotter_data.start, return_obj.firstR);

		return return_obj;
	},
	get_verts_from_data: function(data) {
		var self = this;
		var return_value = [];

		// console.log("Get Verts From Data", data);

		// Step the file, line by line
		try {
			var lines = data.toString().trim().split('\n');
			// var regex = /^\s*$/; // eliminate empty lines
			var pos_regex = /^[0-9.e-]+\s+[0-9.e-]+/;

			_.map(lines, function(line) {
				line.trim();

				if (line.length > 0 && pos_regex.test(line)) { //line.substring(0,1) != '#' && !line.match(regex)) {
					var values = line.split(/\s+/);
					var entry = {th:parseFloat(values[0]),r:parseFloat(values[1])};
					return_value.push(entry);
				}
			});

			// make sure first/last rho is 0 or 1
			if (return_value.length > 0) {
				if (return_value[0].r != 0 && return_value[0].r != 1) {
					console.log("Invalid track start", return_value[0].r);
					return_value.unshift({th:return_value[0].th,r:Math.round(return_value[0].r)});
				}
				if (return_value[return_value.length-1].r != 0 && return_value[return_value.length-1].r != 1) {
					console.log("Invalid track end", return_value[return_value.length-1].r);
					return_value.push({th:return_value[return_value.length-1].th,r:Math.round(return_value[return_value.length-1].r)});
				}

				// !! error check !!
				if (return_value[0].r != this.get("firstR")) {
					// console.log("R[0] not matching", return_value[0].r, self.get("firstR"));
					this.set({firstR: return_value[0].r, r_type:"r"+return_value[0].r+this.get("lastR")});
				}
				if (return_value[return_value.length-1].r != this.get("lastR")) {
					// console.log("R[n] not matching", return_value[return_value.length-1].r, self.get("lastR"));
					this.set({lastR: return_value[return_value.length-1].r, r_type:"r"+this.get("firstR")+return_value[return_value.length-1].r});
				}
				if (this.get('firstR') == this.get('lastR')) {
					this.set('reversible', 'false');
				} else {
					// console.log("Skip track reversible", this.id, this.get('reversible'));
				}
			} else {
				console.log("No verts found!", this.get('id'), this.get('name'));
			}
		} catch (err) {
			console.log("Track get_verts_from_data error", err);
		}

		//console.log("Track verts", return_value.length, self.get("r_type"));

		return return_value;
	},
	get_verts: function() {
		//console.log("Get Verts",this.config.base_dir+'/'+this.config.folders.sisbot+'/'+this.config.folders.content+'/'+this.config.folders.tracks+'/'+this.get('id')+'.thr');
		var self = this;

		var data = '';
		if (fs.existsSync(this.config.base_dir+'/'+this.config.folders.sisbot+'/'+this.config.folders.content+'/'+this.config.folders.tracks+'/'+this.get('id')+'.thr')) {
			data = fs.readFileSync(this.config.base_dir+'/'+this.config.folders.sisbot+'/'+this.config.folders.content+'/'+this.config.folders.tracks+'/'+this.get('id')+'.thr', 'utf8');
		}

		return this.get_verts_from_data(data);
	}
});

module.exports = track;

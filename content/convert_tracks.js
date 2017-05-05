var fs          	= require('fs');
var _							= require('underscore');

//var config 				= require('./config.js');
//console.log("Config", config);

fs.readdir('tracks/', function(err, files) {
  _.each(files, function(file) {
    console.log("File:", file);
		var name = file.substring(0, file.lastIndexOf('.'));
		var track = {
				name: name,
				vel: 1,
				accel: 0.5,
				thvmax: 1,
				reversed: false,
				verts: []
		};

		// rip out r,th
	  fs.readFile('tracks/'+file, function(err, data) {
	    if (err) { console.error(err); }

	    // Step the file, line by line
	    var lines = data.toString().trim().split('\n');
			var regex = /^\s*$/; // eliminate empty lines

			_.map(lines, function(line) {
				line.trim();

				if (line.length > 0 && line.substring(0,1) != '#' && !line.match(regex)) {
					var values = line.split(/\s+/);
					var entry = {th:parseFloat(values[0]),r:parseFloat(values[1])};
					track.verts.push(entry);
				}
			});
			//console.log("Track verts", track.verts.length);

			// finish object
			track.firstR = track.verts[0].r;
			track.lastR = track.verts[track.verts.length-1].r;
			track.type = "r"+track.firstR+track.lastR;
			track.reversible = (track.firstR != track.lastR);

			fs.writeFile('models/'+name+'.json', JSON.stringify(track), 'utf8', null);
	  });

  });
});

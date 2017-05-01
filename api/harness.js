var api             = require('./api.js');

var harness = {
	qq				: [],
	last_checkin	: Date.now() - 100000,
	check_time		: 20,
	_check_q		: function () {
		var self	= this;
		var now		= Date.now();

		if (this.qq.length == 0)
			return false;

		if (now - this.last_checkin < this.check_time)
			return false;

		this.last_checkin	= now;

		var api_req      = this.qq.shift()

        try {
            api[api_req.endpoint](api_req.data, api_req.cb);
        } catch(err) {
            return api_req.cb('Invalid API endpoint', null);
        }

		setTimeout(function () {
			if (self.qq.length > 0)	self._check_q();
		}, self.check_time + 1);
	},
	q: function (data, cb) {
        var endpoint = data.endpoint;
        delete data.endpoint;
		this.qq.push({ endpoint: endpoint, data: data, cb: cb });
		this._check_q();
	}
}

module.exports = harness;

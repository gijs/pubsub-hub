var common = require('common');
var signer = require('signer')
var createMatcher = require('./matcher').create;

var noop = function(){};

/*
	signed values are represented as: {$signed:sig, value:val}
	authenticated values are represented as: {$authenticated:prop, value:val}
*/

var selector = function(selection) {
	if (!selection || !Object.keys(selection).length) {
		return function(doc) {
			return doc;
		};
	}
	
	return function (doc) {
		var result = {};
		
		for (var i in selection) {
			if (doc[i]) {
				result[i] = doc[i];
			}
		}
		return result;
	};
};

var Hub = function(key) {
	this.subscriptions = {};
	this.matcher = createMatcher();
	this.signer = key ? signer.create(key) : signer;
};

Hub.prototype.subscribe = function(query, selection, callback) {
	var id = common.gensym();
	var self = this;
	
	var authDoc = this._authenticator(query);
	var select = selector(selection);

	this.subscriptions[id] = this.matcher.put(query, function(doc, authQuery) {
		if (authQuery(authDoc()) && authDoc(authQuery())) {
			callback(select(doc));
		}
	});
	
	return function() {
		self._unsubscribe(id);
	};
};
Hub.prototype.publish = function(doc) {
	this.matcher.match(doc, this._authenticator(doc));
};

Hub.prototype._unsubscribe = function(id) {
	(this.subscriptions[id] || noop)();
	delete this.subscriptions[id];
};
Hub.prototype._authenticator = function(doc) {
	var auths = {};
	var signed = {};
	
	var signer = this.signer;

	for (var i in doc) {
		var val = doc[i];
		var auth = val.$authenticated;

		if (auth) {
			auths[i] = (typeof auth === 'string' ? auth : i).replace(/\//g,'-');
		}
		if (val.$signed) {
			signed[i] = val;
		}
		if (val.$signed || (auth && 'value' in val)) {
			doc[i] = val.value;
		}
	}
	return function(trusted) {
		if (!trusted) {
			return signed;
		}
		for (var i in auths) {
			var val = trusted[i];

			if (!(val && signer.verify(auths[i]+'/'+val.value, val.$signed))) { // should cache the result of verify
				return false;
			}
		}
		return true;
	};
};

exports.create = function(key) {
	return new Hub(key);
};

/*var hub = new Hub();

var un = hub.subscribe({}, {},function(doc) {
	console.log('matched',doc);
});

hub.publish({hi:1,lo:2});
hub.publish({lo:2});*/
#!/usr/bin/env node

// TODO: make optimist print out help

var argv = require('optimist')
	.alias('p', 'port')
	.default('p', 9999)
	.alias('k', 'key')
	.argv;

var router = require('router');
var sockets = require('json-sockets');
var common = require('common');
var curl = require('curl');
var parse = require('url').parse;

var createHub = require('./hub').create;

var hubs = {'/':createHub(argv.key)};
var hooks = {};

var server = router.create();

var noop = function() {};

var toJSON = function(request, callback) {
	var buffer = '';
	var onclose = function() {
		callback(new Error('unexpected close'));
	};
	
	request.setEncoding('utf-8');
	
	request.on('data', function(data) {
		buffer += data;
	});
	request.on('end', function() {
		request.removeListener('close', onclose);
		try {
			buffer = JSON.parse(buffer);			
		} catch (err) {
			callback(err);
			return;
		}
		callback(null, buffer);
	});
	request.on('close', onclose);
};

var onhookpublish = function(sub, request, response) {
	common.step([
		function(next) {
			toJSON(request, next);
		}, 
		function(doc) {
			if (hubs[sub]) {
				hubs[sub].publish(doc);
			}
			response.writeHead(200);
			response.end('ok\n');
		}
	], function(err){
		response.writeHead(500);
		response.end();
	});	
};
var onhooksubscribe = function(sub, request, response) {
	var hub = hubs[sub] = hubs[sub] || createHub();
	
	hub.members = hub.members || 1;
	
	common.step([
		function(next) {
			toJSON(request, next);
		},
		function(message) {
			var id = message.id || Math.random().toString(36).substring(2);

		 	hooks[id] = hub.subscribe(message.query, message.selection, function(doc) {
				curl.postJSON(message.endpoint, doc);
			});
			
			var body = JSON.stringify({id:id});
			
			response.writeHead(200, {
				'content-type':'application/json',
				'content-length':Buffer.byteLength(body.length)
			});			
			response.end(body+'\n');
		}
	], function(err) {
		response.writeHead(500);
		response.end();
	});	
};
var onhookunsubscripe = function(sub, request, response) {
	var id = parse(request.url,true).query.id;
	
	if (!hooks[id]) {
		response.writeHead(404);
		response.end();
		return;
	}
	
	hooks[id]();
	delete hooks[id];
	
	var hub = hubs[sub];
	
	if (hub) {
		hub.members--;
		
		if (!hub.members) {
			delete hubs[sub];
		}
	}
	
	response.writeHead(200);
	response.end('unsubscribed\n');	
};


server.post('/publish', function(request, response) {
	onhookpublish('/', request, response);
});
server.post('/{sub}/publish', function(request, response) {
	onhookpublish('/'+request.matches.sub, request, response);
});

server.post('/subscribe', function(request, response) {
	onhooksubscribe('/', request, response);
});
server.post('/{sub}/subscribe', function(request, response) {
	onhooksubscribe('/'+request.matches.sub, request, response);
});

server.get('/{sub}/unsubscribe', function(request, response) {
	onhookunsubscribe('/'+request.matches.sub, request, response);
});
server.get('/unsubscribe', function(request, response) {
	onhookunsubscribe('/', request, response);
});

var onsocket = function(socket) {
	var clear = {};

	socket.once('message', function(handshake) {		
		var sub = handshake.sub || '/';
		
		if (sub[0] !== '/') {
			sub = '/'+sub;
		}
		
		var hub = hubs[sub] = hubs[sub] || createHub();
		
		hub.sub = sub;
		hub.members = hub.members || 1;
		
		socket.on('message', function(message) {
			var id = message.id;

			if (message.name === 'subscribe') {
				clear[id] = hub.subscribe(message.query, message.selection, function(doc) {
					socket.send({name:'publish', id:id, doc:doc});
				});
				return;
			}
			if (message.name === 'unsubscribe') {
				(clear[id] || noop)();
				delete clear[id];
				return;
			}
			if (message.name === 'publish') {
				hub.publish(message.doc);
				return;
			}
		});
		socket.on('close', function() {
			hub.members--;
			
			if (!hub.members) {
				delete hubs[sub];
			}
		});
	});
	socket.on('close', function() {
		for (var i in clear) {
			clear[i]();
		}
	});	
};

sockets.listen(server, onsocket);
sockets.createServer(onsocket).listen(10547);

server.listen(argv.p);

console.log('running hub server on port', argv.p);

process.on('uncaughtException', function(err) { console.error(err.stack) });
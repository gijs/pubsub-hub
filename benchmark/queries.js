/**
*    Copyright (C) 2011 Ian Jørgensen <i@pubsub.io>, Mathias Buus Madsen <m@pubsub.io>.
*
*    This program is free software: you can redistribute it and/or  modify
*    it under the terms of the GNU Affero General Public License, version 3,
*    as published by the Free Software Foundation.
*
*    This program is distributed in the hope that it will be useful,
*    but WITHOUT ANY WARRANTY; without even the implied warranty of
*    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
*    GNU Affero General Public License for more details.
*
*    You should have received a copy of the GNU Affero General Public License
*    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

var compile = require('querify').compile;

var queries = [
	{
		foo:'bar',
		lol:'meh'
	}, 
	{
		hello:'world',
		age: {$gt:10}
	}, 
	{
		age: {$gt:10, $lt:20},
		yay: {$exists:true},
		meh: {$notany:[':)']}
	},
	{
		time: {$datetime: 'monday 2011'}
	}
];

var compiled = [];

for (var i in queries) {
	compiled.push(compile(queries[i]));
}

var MATCHES = 200000;
var COMPILATIONS = 20000;

var now = Date.now();

for (var h = 0; h < COMPILATIONS; h++) {
	for (var i in queries) {
		compile(queries[i]);		
	}
}

var time = Date.now() - now;

console.log(Math.round(COMPILATIONS*queries.length/time)+' compilations/ms, time ' + time + ' ms');

now = Date.now();

for (var h = 0; h < MATCHES; h++) {
	var doc = {hello:'world', age:h-1, foo:'bar', time: new Date('august 22 2011 10:30:00')};
	
	for (var i = 0; i < compiled.length; i++) {
		compiled[i](doc);
	}
}

time = Date.now() - now;

console.log(Math.round(MATCHES*queries.length/time)+' queries/ms, time ' + time + ' ms');
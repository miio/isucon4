var mysqlPool = require('/home/isucon/webapp/node/mysql');
var helper = require('/home/isucon/webapp/node/helpers');
var Memcached = require('memcached');
var memcached = new Memcached('localhost:11211');
var async = require('async');

async.waterfall(
[
function(cb) {
helper.getFirstLockedUsers(function(datas) {
console.log(datas);
	datas.map(function(data) {
		memcached.set('user_' + data + '_total', JSON.stringify('[["aaa"]]'), 3600, function(){});
		});
	});
cb();
}, function(cb) {
helper.getBeginLockedUsers(function(datas) {
//console.log(datas);
	datas.map(function(data) {
		memcached.set('user_' + data + '_total', JSON.stringify('[["aaa"]["bbb"]]'), 3600, function(){});
		});
	});
cb();
},function(cb) {
helper.getAfterLockedUsers(function(datas) {
//console.log(datas);
	datas.map(function(data) {
		memcached.set('user_' + data + '_total', JSON.stringify('[["aaa"]["bbb"]["ccc"]]'), 3600, function(){});
		});
	});
cb();
}, function(cb) {
helper.getBeginBannedIPs(function(datas) {
	datas.map(function(data) {
		memcached.set('ip_' + data , 10, 3600, function(){});
		});
process.exit(0);
	});
}]);

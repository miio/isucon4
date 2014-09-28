var express = require('express');
var logger = require('morgan');
var session = require('express-session');
var connectMemcachedStore = require('connect-memcached');
var strftime = require('strftime');
var fs = require('fs');
var cluster = require('cluster');
var routes = require('./routes.js');

var sock_file_path = '/tmp/node.sock';

if (cluster.isMaster) {
  for (var i = 0; i < 4; i++) {
    cluster.fork();
  }

  cluster.on('exit', function (worker, code, signal) {
    console.log('worker is dead:', worker.process.pid, code, signal);
  });

  if (fs.existsSync(sock_file_path)) {
    fs.unlinkSync(sock_file_path);
  }
} else {
  var MemcachedStore = connectMemcachedStore(session);
  var app = express();

  app.use(logger('dev'));
  app.disable('x-powered-by');
  app.enable('trust proxy');
  app.use(session({
    name: 'isu',
    secret: 'isucon4-node-qualifier',
    resave: true,
    saveUninitialized: true,
    store: new MemcachedStore({
      hosts: ['localhost:11211']
    })
  }));

  app.locals.strftime = strftime;

  routes(app);

  app.use(function (err, req, res, next) {
    res.status(500).send('Error: ' + err.message);
  });

  var server = app.listen(sock_file_path, function() {
    fs.chmod(sock_file_path, 0666);
    console.log('Listening on port %d', server.address());
  });
}

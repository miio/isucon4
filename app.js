var bodyParser = require('body-parser');
var ect = require('ect');
var express = require('express');
var logger = require('morgan');
var path = require('path');
var session = require('express-session');
var strftime = require('strftime');
var fs = require("fs");
var routes = require('./routes.js');

var app = express();

app.use(logger('dev'));
app.disable('x-powered-by');
app.enable('trust proxy');
app.engine('ect', ect({ watch: true, root: __dirname + '/views', ext: '.ect' }).render);
app.set('view engine', 'ect');
app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({ secret: 'isucon4-node-qualifier', resave: true, saveUninitialized: true }));
app.use(express.static(path.join(__dirname, '../public')));

app.locals.strftime = strftime(format, date);

routes(app);

app.use(function (err, req, res, next) {
  res.status(500).send('Error: ' + err.message);
});

var sock_file_path = '/tmp/node.sock';
if (fs.existsSync(sock_file_path)) {
  fs.unlinkSync(sock_file_path);
}
var server = app.listen(sock_file_path, function() {
  fs.chmod(sock_file_path, 0666);
  console.log('Listening on port %d', server.address().port);
});

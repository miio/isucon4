var bodyParser = require('body-parser');
var ect = require('ect');
var express = require('express');
var logger = require('morgan');
var path = require('path');
var session = require('express-session');
var strftime = require('strftime');
var routes = require('./routes.js');

var app = express();

app.use(logger('dev'));
app.enable('trust proxy');
app.engine('ect', ect({ watch: true, root: __dirname + '/views', ext: '.ect' }).render);
app.set('view engine', 'ect');
app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({ 'secret': 'isucon4-node-qualifier', resave: true, saveUninitialized: true }));
app.use(express.static(path.join(__dirname, '../public')));

app.locals.strftime = function(format, date) {
  return strftime(format, date);
};

routes(app);

app.use(function (err, req, res, next) {
  res.status(500).send('Error: ' + err.message);
});

var server = app.listen(process.env.PORT || 8080, function() {
  console.log('Listening on port %d', server.address().port);
});

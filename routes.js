var bodyParser = require('body-parser');
var async = require('async');
var helpers = require('./helpers');
var mysqlPool = require('./mysql');
var views = require('./views');

var notice_str = ['<div id="notice-message" class="alert alert-danger" role="alert">', '', '</div>'];

module.exports = function (app) {
  app.get('/', function(req, res) {
    var notice = req.session.notice;
    req.session.notice = null;

    res.send(views.index(notice && [notice]));
  });

  app.post('/login', bodyParser.urlencoded({ extended: false }));
  app.post('/login', function(req, res) {
    helpers.attemptLogin(req, function(err, user) {
      if(err) {
        switch(err) {
          case 'locked':
            notice_str[1] = 'This account is locked.';
            break;
          case 'banned':
            notice_str[1] = 'You\'re banned.';
            break;
          default:
            notice_str[1] = 'Wrong username or password';
            break;
        }

        req.session.notice = notice_str.join('');
        return res.redirect('/');
      }

      req.session.userId = user.id;
      res.redirect('/mypage');
    });
  });

  app.get('/mypage', function(req, res) {
    helpers.getCurrentUser(req.session.userId, function(user) {
      if(!user) {
        notice_str[1] = 'You must be logged in';
        req.session.notice = notice_str.join('');
        return res.redirect('/');
      }

      mysqlPool.query(
        'SELECT * FROM login_log WHERE succeeded = 1 AND user_id = ? ORDER BY id DESC LIMIT 2',
        [user.id],
        function(err, rows) {
          var lastLogin = rows[rows.length-1] || {};
          res.send(views.mypage([
            app.locals.strftime('%Y-%m-%d %H:%M:%S', lastLogin.created_at),
            lastLogin.ip,
            lastLogin.login
          ]));
        }
      );
    });
  });

  app.get('/report', function(req, res) {
    async.parallel({
      banned_ips: function(cb) {
        helpers.getBannedIPs(function(ips) {
          cb(null, ips);
        });
      },
      locked_users: function(cb) {
        helpers.getLockedUsers(function(users) {
          cb(null, users);
        });
      }
    }, function(err, result) {
      res.json(result);
    });
  });
};

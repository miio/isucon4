var async = require('async');
var helpers = require('./helpers');
var mysqlPool = require('./mysql');

module.exports = function (app) {
  app.get('/', function(req, res) {
    var notice = req.session.notice;
    req.session.notice = null;

    res.render('index', { 'notice': notice });
  });

  app.post('/login', function(req, res) {
    helpers.attemptLogin(req, function(err, user) {
      if(err) {
        switch(err) {
          case 'locked':
            req.session.notice = 'This account is locked.';
            break;
          case 'banned':
            req.session.notice = 'You\'re banned.';
            break;
          default:
            req.session.notice = 'Wrong username or password';
            break;
        }

        return res.redirect('/');
      }

      req.session.userId = user.id;
      res.redirect('/mypage');
    });
  });

  app.get('/mypage', function(req, res) {
    helpers.getCurrentUser(req.session.userId, function(user) {
      if(!user) {
        req.session.notice = 'You must be logged in';
        return res.redirect('/');
      }

      mysqlPool.query(
        'SELECT * FROM login_log WHERE succeeded = 1 AND user_id = ? ORDER BY id DESC LIMIT 2',
        [user.id],
        function(err, rows) {
          var lastLogin = rows[rows.length-1];
          res.render('mypage', { 'last_login': lastLogin });
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

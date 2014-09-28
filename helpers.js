var _ = require('underscore');
var async = require('async');
var crypto = require('crypto');
var mysqlPool = require('./mysql');
var Memcached = require('memcached');
var memcached = new Memcached('localhost:11211');

var globalConfig = {
  userLockThreshold: process.env.ISU4_USER_LOCK_THRESHOLD || 3,
  ipBanThreshold: process.env.ISU4_IP_BAN_THRESHOLD || 10
};

var helpers = {
  calculatePasswordHash: function(password, salt) {
    var c = crypto.createHash('sha256');
    c.update(password + ':' + salt);
    return c.digest('hex');
  },

  isUserLocked: function(user, callback) {
    if(!user) {
      return callback(false);
    }
    memcached.get('user_' + user.id + '_total' , function (err, data) {
    if (!data) {
console.log('cache failed lock' + user.id + ':' + data);
    mysqlPool.query(
      'SELECT COUNT(1) AS failures FROM login_log WHERE ' +
      'user_id = ? AND id > IFNULL((select id from login_log where ' +
      'user_id = ? AND succeeded = 1 ORDER BY id DESC LIMIT 1), 0);',
      [user.id, user.id],
      function(err, rows) {
        if(err) {
          return callback(false);
        }
        memcached.set('user' + user.id, globalConfig.userLockThreshold <= rows[0].failures , 3600, function(){});
        callback(globalConfig.userLockThreshold <= rows[0].failures);
      }
    );
    } else {
console.log('cache suc lock' + JSON.parse(data).length);
callback(globalConfig.userLockThreshold <= JSON.parse(data).length);
    }
});
  },

  isIPBanned: function(ip, callback) {
    memcached.get('ip_' + ip , function (err, data) {
    if (!data) {
console.log('cache failed banned' + ip + ':' + data);
    mysqlPool.query(
      'SELECT COUNT(1) AS failures FROM login_log WHERE ' +
      'ip = ? AND id > IFNULL((select id from login_log where ip = ? AND ' +
      'succeeded = 1 ORDER BY id DESC LIMIT 1), 0);',
      [ip, ip],
      function(err, rows) {
        if(err) {
          return callback(false);
        }

        callback(globalConfig.ipBanThreshold <= rows[0].failures);
      }
    );
    } else {
console.log('cache banned');
       callback(globalConfig.ipBanThreshold <= data);
    }
   });
  },

  attemptLogin: function(req, callback) {
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    var login = req.body.login;
    var password = req.body.password;

    async.waterfall([
      function(cb) {
        mysqlPool.query('SELECT * FROM users WHERE login = ?', [login], function(err, rows) {
          cb(null, rows[0]);
        });
      },
      function(user, cb) {
        helpers.isIPBanned(ip, function(banned) {
          if(banned) {
            cb('banned', user);
          } else {
            cb(null, user);
          }
        });
      },
      function(user, cb) {
        helpers.isUserLocked(user, function(locked) {
          if(locked) {
            cb('locked', user);
          } else {
            cb(null, user);
          }
        });
      },
      function(user, cb) {
        if(user && helpers.calculatePasswordHash(password, user.salt) == user.password_hash) {
          cb(null, user);
        } else if(user) {
          cb('wrong_password', user);
        } else {
          cb('wrong_login', user);
        }
      }
    ], function(err, user) {
      var succeeded = !err;
      mysqlPool.query(
        'INSERT INTO login_log' +
        ' (`created_at`, `user_id`, `login`, `ip`, `succeeded`)' +
        ' VALUES (?,?,?,?,?)',
        [new Date(), (user || {}).id, login, ip, succeeded],
        function(e, rows) {
          async.waterfall([
            function(cb) {
            if (user) {
              memcached.del('user_'+ user.id, function(){ cb(); });
            } else {
              cb();
            }
            }, function(cb) {

            memcached.get('ip_' + ip, function(err, data) {
            console.log('cache insert: ' + data);
                if (data) {
                 if (succeeded) {
                   memcached.set('ip_' + ip, 0, 3600, function(err,data){
                    cb();
                   });
                 } else {
                  memcached.set('ip_' + ip, data + 1,3600, function(err,data){
                    cb();
                  });
                 }

               } else {
                 if (succeeded) {
                   memcached.set('ip_' + ip, 0, 3600, function(err,data){
                    cb();
                   });
                 } else {
                  memcached.set('ip_' + ip, data + 1,3600, function(err,data){
                    cb();
                  });
                 }
               }
          });
          }, function(cb) {
          if (user) {

              memcached.get('user_' + user.id + '_total', function(err, data) {
                if (data) {
                console.log('cache insert total: ' + data);
                 if (succeeded) {
                   memcached.set('user_' + user.id + '_total', JSON.stringify([]) , 3600, function(err,data){
                    cb();
                   });
                 } else {
                   memcached.set('user_' + user.id + '_total', JSON.stringify(JSON.parse(data).concat(user)) , 3600, function(err,data){
                    cb();
                   });
                 }
               } else {
                 console.log('cache insert first: ');
                 if (succeeded) {
                   memcached.set('user_' + user.id + '_total', JSON.stringify([]) , 3600, function(err,data){
                    cb();
                   });
                 } else {
                   memcached.set('user_' + user.id + '_total', JSON.stringify([user]) , 3600, function(err,data){
                    cb();
                  });
                 }
               }
              });
           }
          callback(err, user);
        }]);
    }
);
});
},

  getCurrentUser: function(user_id, callback) {
    mysqlPool.query('SELECT * FROM users WHERE id = ?', [user_id], function(err, rows) {
      if(err) {
        return callback(null);
      }

      callback(rows[0]);
    });
  },

  getBannedIPs: function(callback) {
    mysqlPool.query(
      'SELECT ip FROM (SELECT ip, MAX(succeeded) as max_succeeded, COUNT(1) as cnt FROM '+
      'login_log GROUP BY ip) AS t0 WHERE t0.max_succeeded = 0 AND t0.cnt >= ?',
      [globalConfig.ipBanThreshold],
      function(err, rows) {
        var bannedIps = _.map(rows, function(row) { return row.ip; });

        mysqlPool.query(
          'SELECT ip, MAX(id) AS last_login_id FROM login_log WHERE succeeded = 1 GROUP by ip',
          function(err, rows) {
            async.parallel(
              _.map(rows, function(row) {
                return function(cb) {
                  mysqlPool.query(
                    'SELECT COUNT(1) AS cnt FROM login_log WHERE ip = ? AND ? < id',
                    [row.ip, row.last_login_id],
                    function(err, rows) {
                      if(globalConfig.ipBanThreshold <= (rows[0] || {}).cnt) {
                        bannedIps.push(row.ip);
                      }
                      cb(null);
                    }
                  );
                };
              }),
              function(err) {
                callback(bannedIps);
              }
            );
          }
        );
      }
    );
  },

  getLockedUsers: function(callback) {
    mysqlPool.query(
      'SELECT user_id, login FROM ' +
      '(SELECT user_id, login, MAX(succeeded) as max_succeeded, COUNT(1) as cnt FROM ' +
      'login_log GROUP BY user_id) AS t0 WHERE t0.user_id IS NOT NULL AND ' +
      't0.max_succeeded = 0 AND t0.cnt >= ?',
      [globalConfig.userLockThreshold],
      function(err, rows) {
        var lockedUsers = _.map(rows, function(row) { return row.login; });

        mysqlPool.query(
          'SELECT user_id, login, MAX(id) AS last_login_id FROM login_log WHERE ' +
          'user_id IS NOT NULL AND succeeded = 1 GROUP BY user_id',
          function(err, rows) {
            async.parallel(
              _.map(rows, function(row) {
                return function(cb) {
                  mysqlPool.query(
                    'SELECT COUNT(1) AS cnt FROM login_log WHERE user_id = ? AND ? < id',
                    [row.user_id, row.last_login_id],
                    function(err, rows) {
                      if(globalConfig.userLockThreshold <= (rows[0] || {}).cnt) {
                        lockedUsers.push(row.login);
                      }
                      cb(null);
                    }
                  );
                };
              }),
              function(err) {
                callback(lockedUsers);
              }
            );
          }
        );
      }
    );
  },


  getBeginBannedIPs: function(callback) {
    mysqlPool.query(
      'SELECT ip FROM (SELECT ip, MAX(succeeded) as max_succeeded, COUNT(1) as cnt FROM '+
      'login_log GROUP BY ip) AS t0 WHERE t0.max_succeeded = 0 AND t0.cnt >= ?',
      [globalConfig.ipBanThreshold],
      function(err, rows) {
        var bannedIps = [];//_.map(rows, function(row) { return row.ip; });

        mysqlPool.query(
          'SELECT ip, MAX(id) AS last_login_id FROM login_log WHERE succeeded = 1 GROUP by ip',
          function(err, rows) {
            async.parallel(
              _.map(rows, function(row) {
                return function(cb) {
                  mysqlPool.query(
                    'SELECT COUNT(1) AS cnt FROM login_log WHERE ip = ? AND ? < id',
                    [row.ip, row.last_login_id],
                    function(err, rows) {
                      if(globalConfig.ipBanThreshold -1 == (rows[0] || {}).cnt) {
                        bannedIps.push(row.ip);
                      }
                      cb(null);
                    }
                  );
                };
              }),
              function(err) {
                callback(bannedIps);
              }
            );
          }
        );
      }
    );
  },

  getFirstLockedUsers: function(callback) {
    mysqlPool.query(
      'SELECT user_id, login FROM ' +
      '(SELECT user_id, login, MAX(succeeded) as max_succeeded, COUNT(1) as cnt FROM ' +
      'login_log GROUP BY user_id) AS t0 WHERE t0.user_id IS NOT NULL AND ' +
      't0.max_succeeded = 0 AND t0.cnt >= ?',
      [globalConfig.userLockThreshold],
      function(err, rows) {
        var lockedUsers = [];//_.map(rows, function(row) { return row.user_id; });

        mysqlPool.query(
          'SELECT user_id, login, MAX(id) AS last_login_id FROM login_log WHERE ' +
          'user_id IS NOT NULL AND succeeded = 1 GROUP BY user_id',
          function(err, rows) {
            async.parallel(
              _.map(rows, function(row) {
                return function(cb) {
                  mysqlPool.query(
                    'SELECT COUNT(1) AS cnt FROM login_log WHERE user_id = ? AND ? < id',
                    [row.user_id, row.last_login_id],
                    function(err, rows) {
                      if(1 == (rows[0] || {}).cnt) {
                        lockedUsers.push(row.user_id);
                      }
                      cb(null);
                    }
                  );
                };
              }),
              function(err) {
                callback(lockedUsers);
              }
            );
          }
        );
      }
    );
  },
  getAfterLockedUsers: function(callback) {
    mysqlPool.query(
      'SELECT user_id, login FROM ' +
      '(SELECT user_id, login, MAX(succeeded) as max_succeeded, COUNT(1) as cnt FROM ' +
      'login_log GROUP BY user_id) AS t0 WHERE t0.user_id IS NOT NULL AND ' +
      't0.max_succeeded = 0 AND t0.cnt >= ?',
      [globalConfig.userLockThreshold],
      function(err, rows) {
        var lockedUsers = _.map(rows, function(row) { return row.user_id; });

        mysqlPool.query(
          'SELECT user_id, login, MAX(id) AS last_login_id FROM login_log WHERE ' +
          'user_id IS NOT NULL AND succeeded = 1 GROUP BY user_id',
          function(err, rows) {
            async.parallel(
              _.map(rows, function(row) {
                return function(cb) {
                  mysqlPool.query(
                    'SELECT COUNT(1) AS cnt FROM login_log WHERE user_id = ? AND ? < id',
                    [row.user_id, row.last_login_id],
                    function(err, rows) {
                      if(1 == (rows[0] || {}).cnt) {
                        lockedUsers.push(row.user_id);
                      }
                      cb(null);
                    }
                  );
                };
              }),
              function(err) {
                callback(lockedUsers);
              }
            );
          }
        );
      }
    );
  },
  getBeginLockedUsers: function(callback) {
    mysqlPool.query(
      'SELECT user_id, login FROM ' +
      '(SELECT user_id, login, MAX(succeeded) as max_succeeded, COUNT(1) as cnt FROM ' +
      'login_log GROUP BY user_id) AS t0 WHERE t0.user_id IS NOT NULL AND ' +
      't0.max_succeeded = 0 AND t0.cnt >= ?',
      [globalConfig.userLockThreshold],
      function(err, rows) {
        var lockedUsers = _.map(rows, function(row) { return row.user_id; });

        mysqlPool.query(
          'SELECT user_id, login, MAX(id) AS last_login_id FROM login_log WHERE ' +
          'user_id IS NOT NULL AND succeeded = 1 GROUP BY user_id',
          function(err, rows) {
            async.parallel(
              _.map(rows, function(row) {
                return function(cb) {
                  mysqlPool.query(
                    'SELECT COUNT(1) AS cnt FROM login_log WHERE user_id = ? AND ? < id',
                    [row.user_id, row.last_login_id],
                    function(err, rows) {
                      if(globalConfig.userLockThreshold -1 == (rows[0] || {}).cnt) {
                        lockedUsers.push(row.user_id);
                      }
                      cb(null);
                    }
                  );
                };
              }),
              function(err) {
                callback(lockedUsers);
              }
            );
          }
        );
      }
    );
  }
};

module.exports = helpers;


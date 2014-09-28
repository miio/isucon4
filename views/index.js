var fs = require('fs');
var path = require('path');

function loadTemplate(filename) {
  return fs.readFileSync(path.resolve(__dirname, filename), 'utf8').split('\n').map(function (line) {
    return line.trim();
  }).join('');
}

function resolveArgs(tmpl, args) {
  args = args || [];
  tmpl = tmpl.split('{{?}}');
  for (var i = 0; i < args.length; i++) {
    tmpl = [tmpl.slice(0, 2).join(args[i] || '')].concat(tmpl.slice(2));
  }
  return tmpl.join('');
}

// template cache
var index = loadTemplate('index.html');
var mypage = loadTemplate('mypage.html');

exports.index = resolveArgs.bind(null, index);
exports.mypage = resolveArgs.bind(null, mypage);

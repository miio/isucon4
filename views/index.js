var fs = require('fs');
var path = require('path');

function loadTemplate(filename) {
  return fs.readFileSync(path.resolve(__dirname, filename), 'utf8').split('\n').map(function (line) {
    return line.trim();
  }).join('');
}

function resolveArgs(tmpl, args) {
  args = args || [];
  for (var i = 0; i < args.length; i++) {
    console.log(args[i]);
    tmpl = tmpl.split('{{?}}', 2).join(args[i]);
  }
  return tmpl.split('{{?}}').join('');
}

// template cache
var index = loadTemplate('index.ect');
var mypage = loadTemplate('mypage.ect');

exports.index = resolveArgs.bind(null, index);
exports.mypage = resolveArgs.bind(null, mypage);

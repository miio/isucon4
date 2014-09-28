var mysql = require('mysql');

var mysqlPool = mysql.createPool({
  host: process.env.ISU4_DB_HOST || 'localhost',
  user: process.env.ISU4_DB_USER || 'root',
  password: process.env.ISU4_DB_PASSWORD || '',
  database: process.env.ISU4_DB_NAME || 'isu4_qualifier'
});

module.exports = mysqlPool;

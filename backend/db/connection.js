const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'smartcampuseventdb',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
});

pool.getConnection()
  .then((conn) => {
    console.log(`[db] Connected to MySQL database "${process.env.DB_NAME}" on ${process.env.DB_HOST}:${process.env.DB_PORT || 3306}`);
    conn.release();
  })
  .catch((err) => {
    console.error('[db] FATAL: unable to connect to MySQL.');
    console.error('     Check backend/.env credentials and that MySQL is running.');
    console.error('     Details:', err.code, err.message);
  });

module.exports = pool;

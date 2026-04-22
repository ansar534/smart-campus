/**
 * Seed script: creates the Users table if missing, then inserts a starter
 * set of accounts (one per existing Student/Faculty row, plus an admin).
 *
 * Default password for everyone: "password123"  (change after login!)
 *
 * Usage (from project root):
 *   node backend/scripts/seed-users.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const bcrypt = require('bcrypt');
const pool = require('../db/connection');

const DEFAULT_PASSWORD = 'password123';

async function ensureUsersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS Users (
      user_id       INT AUTO_INCREMENT PRIMARY KEY,
      email         VARCHAR(100) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role          ENUM('student','faculty','admin') NOT NULL,
      linked_id     INT NULL,
      active        TINYINT(1) NOT NULL DEFAULT 1,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function upsertUser({ email, role, linked_id, password }) {
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO Users (email, password_hash, role, linked_id)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash),
                             role = VALUES(role),
                             linked_id = VALUES(linked_id),
                             active = 1`,
    [email, hash, role, linked_id]
  );
  console.log(`  [ok] ${role.padEnd(8)}  ${email}  (linked_id=${linked_id})`);
}

(async () => {
  try {
    console.log(`[seed] Database: ${process.env.DB_NAME}`);
    await ensureUsersTable();
    console.log('[seed] Users table ready.');

    const [students] = await pool.query('SELECT Student_ID, Email FROM Student');
    const [faculty]  = await pool.query('SELECT Faculty_ID, Email FROM Faculty_Organizer');

    console.log(`[seed] Seeding ${students.length} student(s)...`);
    for (const s of students) {
      await upsertUser({
        email: s.Email,
        role: 'student',
        linked_id: s.Student_ID,
        password: DEFAULT_PASSWORD,
      });
    }

    console.log(`[seed] Seeding ${faculty.length} faculty...`);
    for (const f of faculty) {
      await upsertUser({
        email: f.Email,
        role: 'faculty',
        linked_id: f.Faculty_ID,
        password: DEFAULT_PASSWORD,
      });
    }

    console.log('[seed] Seeding admin account...');
    await upsertUser({
      email: 'admin@univ.edu',
      role: 'admin',
      linked_id: null,
      password: 'admin123',
    });

    console.log('\n[seed] DONE.');
    console.log('');
    console.log('Login credentials (default):');
    console.log('  students/faculty : <their email>  /  password123');
    console.log('  admin            : admin@univ.edu /  admin123');
    console.log('');
    process.exit(0);
  } catch (err) {
    console.error('[seed] FAILED:', err.message);
    console.error(err);
    process.exit(1);
  }
})();

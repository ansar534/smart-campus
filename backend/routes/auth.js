const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db/connection');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

const VALID_ROLES = ['student', 'faculty', 'admin'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/auth/register
 * body: { email, password, role, linked_id? }
 *
 * - For role=student: linked_id must reference an existing Student.Student_ID
 *   and the email must match the Student's email on file
 * - For role=faculty: same, but against Faculty_Organizer
 * - For role=admin: linked_id is optional
 */
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, role, linked_id } = req.body || {};

    if (!email || !password || !role) {
      return res.status(400).json({ message: 'email, password, role are required' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    // For student/faculty, verify linked_id + email matches the base table
    let resolvedLinkedId = linked_id ? Number(linked_id) : null;
    if (role === 'student') {
      if (!resolvedLinkedId) {
        return res.status(400).json({ message: 'Student_ID (linked_id) is required for student role' });
      }
      const [rows] = await pool.query(
        'SELECT Student_ID, Email FROM Student WHERE Student_ID = ?',
        [resolvedLinkedId]
      );
      if (!rows.length) {
        return res.status(400).json({ message: `No Student found with Student_ID=${resolvedLinkedId}` });
      }
      if (rows[0].Email.toLowerCase() !== email.toLowerCase()) {
        return res.status(400).json({ message: 'Email does not match the Student record' });
      }
    } else if (role === 'faculty') {
      if (!resolvedLinkedId) {
        return res.status(400).json({ message: 'Faculty_ID (linked_id) is required for faculty role' });
      }
      const [rows] = await pool.query(
        'SELECT Faculty_ID, Email FROM Faculty_Organizer WHERE Faculty_ID = ?',
        [resolvedLinkedId]
      );
      if (!rows.length) {
        return res.status(400).json({ message: `No Faculty found with Faculty_ID=${resolvedLinkedId}` });
      }
      if (rows[0].Email.toLowerCase() !== email.toLowerCase()) {
        return res.status(400).json({ message: 'Email does not match the Faculty record' });
      }
    }

    const [existing] = await pool.query(
      'SELECT user_id FROM Users WHERE email = ?',
      [email]
    );
    if (existing.length) {
      return res.status(409).json({ message: 'An account with that email already exists' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO Users (email, password_hash, role, linked_id) VALUES (?, ?, ?, ?)',
      [email, password_hash, role, resolvedLinkedId]
    );

    res.status(201).json({
      message: 'Account created',
      user: { user_id: result.insertId, email, role, linked_id: resolvedLinkedId },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login
 * body: { email, password }
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required' });
    }

    const [rows] = await pool.query(
      'SELECT user_id, email, password_hash, role, linked_id FROM Users WHERE email = ?',
      [email]
    );
    if (!rows.length) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Enrich session with display name if we can
    let displayName = user.email;
    try {
      if (user.role === 'student' && user.linked_id) {
        const [s] = await pool.query(
          'SELECT First_Name, Last_Name FROM Student WHERE Student_ID = ?',
          [user.linked_id]
        );
        if (s.length) displayName = `${s[0].First_Name} ${s[0].Last_Name}`;
      } else if (user.role === 'faculty' && user.linked_id) {
        const [f] = await pool.query(
          'SELECT First_Name, Last_Name FROM Faculty_Organizer WHERE Faculty_ID = ?',
          [user.linked_id]
        );
        if (f.length) displayName = `${f[0].First_Name} ${f[0].Last_Name}`;
      }
    } catch (_) {
      /* non-fatal */
    }

    req.session.user = {
      user_id: user.user_id,
      email: user.email,
      role: user.role,
      linked_id: user.linked_id,
      name: displayName,
    };

    res.json({ message: 'Logged in', user: req.session.user });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
  if (!req.session) return res.json({ message: 'Logged out' });
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ message: 'Logout failed' });
    res.clearCookie('scems.sid');
    res.json({ message: 'Logged out' });
  });
});

/**
 * GET /api/auth/me
 */
router.get('/me', authRequired, (req, res) => {
  res.json({ user: req.session.user });
});

/**
 * GET /api/auth/profile
 * Returns expanded profile data from Student/Faculty tables based on role.
 */
router.get('/profile', authRequired, async (req, res, next) => {
  try {
    const user = req.session.user;
    if (user.role === 'student' && user.linked_id) {
      const [rows] = await pool.query(
        `SELECT Student_ID, First_Name, Last_Name, Major, Academic_Year, Email, Phone
         FROM Student
         WHERE Student_ID = ?`,
        [user.linked_id]
      );
      return res.json({ user, profile: rows[0] || null });
    }
    if (user.role === 'faculty' && user.linked_id) {
      const [rows] = await pool.query(
        `SELECT Faculty_ID, First_Name, Last_Name, Department, Email, Phone
         FROM Faculty_Organizer
         WHERE Faculty_ID = ?`,
        [user.linked_id]
      );
      return res.json({ user, profile: rows[0] || null });
    }
    return res.json({ user, profile: null });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/auth/password
 * body: { current_password, new_password }
 */
router.patch('/password', authRequired, async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password) {
      return res.status(400).json({ message: 'current_password and new_password are required' });
    }
    if (String(new_password).length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }
    const [rows] = await pool.query(
      'SELECT user_id, password_hash FROM Users WHERE user_id = ?',
      [req.session.user.user_id]
    );
    if (!rows.length) return res.status(404).json({ message: 'User account not found' });

    const ok = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!ok) return res.status(401).json({ message: 'Current password is incorrect' });

    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE Users SET password_hash = ? WHERE user_id = ?', [hash, rows[0].user_id]);
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

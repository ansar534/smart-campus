const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db/connection');
const { roleRequired } = require('../middleware/auth');
const { PHASE3_QUERIES } = require('../db/queries');

const router = express.Router();

/**
 * GET /api/admin/stats
 * Dashboard KPI cards.
 */
router.get('/stats', roleRequired('admin'), async (_req, res, next) => {
  try {
    const [[ev]]    = await pool.query('SELECT COUNT(*) AS c FROM Event');
    const [[reg]]   = await pool.query(
      `SELECT COUNT(*) AS c FROM Registration WHERE Registration_Status <> 'Cancelled'`
    );
    const [[att]]   = await pool.query(
      `SELECT
         SUM(CASE WHEN Attendance_Status = 'Present' THEN 1 ELSE 0 END) AS present,
         COUNT(*) AS total
       FROM Attendance`
    );
    const [[topStu]] = await pool.query(
      `SELECT S.Student_ID, S.First_Name, S.Last_Name, COUNT(R.Registration_ID) AS c
       FROM Student S
       JOIN Registration R ON S.Student_ID = R.Student_ID
       GROUP BY S.Student_ID, S.First_Name, S.Last_Name
       ORDER BY c DESC
       LIMIT 1`
    );
    const [[topVenue]] = await pool.query(
      `SELECT V.Venue_ID, V.Venue_Name, COUNT(E.Event_ID) AS c
       FROM Venue V
       LEFT JOIN Event E ON V.Venue_ID = E.Venue_ID
       GROUP BY V.Venue_ID, V.Venue_Name
       ORDER BY c DESC
       LIMIT 1`
    );

    const attendanceRate =
      att && att.total > 0 ? Math.round((Number(att.present) / Number(att.total)) * 1000) / 10 : 0;

    res.json({
      total_events: ev.c,
      total_registrations: reg.c,
      attendance_rate: attendanceRate,
      top_student: topStu
        ? { name: `${topStu.First_Name} ${topStu.Last_Name}`, count: topStu.c }
        : null,
      top_venue: topVenue ? { name: topVenue.Venue_Name, count: topVenue.c } : null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/reports        — list of available queries
 * GET /api/admin/reports/:id    — run query by id
 */
router.get('/reports', roleRequired('admin'), (_req, res) => {
  res.json({
    queries: PHASE3_QUERIES.map((q) => ({
      id: q.id,
      title: q.title,
      description: q.description,
    })),
  });
});

router.get('/reports/:queryId', roleRequired('admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.queryId);
    const q = PHASE3_QUERIES.find((x) => x.id === id);
    if (!q) return res.status(404).json({ message: `Query ${id} not found` });
    const [rows] = await pool.query(q.sql);
    const columns = rows.length ? Object.keys(rows[0]) : [];
    res.json({ id: q.id, title: q.title, columns, rows });
  } catch (err) {
    next(err);
  }
});

/* ------------------------- VENUE CRUD --------------------------- */

/**
 * GET /api/admin/venues — admin or faculty (faculty needs the list for the create-event form)
 */
router.get('/venues', roleRequired(['admin', 'faculty']), async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT V.Venue_ID, V.Venue_Name, V.Location, V.Capacity,
              (SELECT COUNT(*) FROM Event E WHERE E.Venue_ID = V.Venue_ID) AS Event_Count
       FROM Venue V
       ORDER BY V.Venue_Name`
    );
    res.json({ venues: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/faculty-organizers — admin/faculty helper list for event forms
 */
router.get('/faculty-organizers', roleRequired(['admin', 'faculty']), async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT Faculty_ID, First_Name, Last_Name, Department, Email
       FROM Faculty_Organizer
       ORDER BY First_Name, Last_Name`
    );
    res.json({ faculty: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/venues', roleRequired('admin'), async (req, res, next) => {
  try {
    const { venue_name, location, capacity } = req.body || {};
    if (!venue_name || !location || !capacity) {
      return res.status(400).json({ message: 'venue_name, location, capacity required' });
    }
    if (Number(capacity) <= 0) {
      return res.status(400).json({ message: 'capacity must be > 0' });
    }
    const [[{ nextId }]] = await pool.query(
      'SELECT COALESCE(MAX(Venue_ID), 300) + 1 AS nextId FROM Venue'
    );
    await pool.query(
      'INSERT INTO Venue (Venue_ID, Venue_Name, Location, Capacity) VALUES (?, ?, ?, ?)',
      [nextId, venue_name, location, Number(capacity)]
    );
    res.status(201).json({ message: 'Venue created', venue_id: nextId });
  } catch (err) {
    next(err);
  }
});

router.put('/venues/:id', roleRequired('admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { venue_name, location, capacity } = req.body || {};
    const [[existing]] = await pool.query('SELECT * FROM Venue WHERE Venue_ID = ?', [id]);
    if (!existing) return res.status(404).json({ message: 'Venue not found' });
    const newName = venue_name ?? existing.Venue_Name;
    const newLoc  = location   ?? existing.Location;
    const newCap  = capacity   ?? existing.Capacity;
    if (Number(newCap) <= 0) {
      return res.status(400).json({ message: 'capacity must be > 0' });
    }
    await pool.query(
      'UPDATE Venue SET Venue_Name=?, Location=?, Capacity=? WHERE Venue_ID = ?',
      [newName, newLoc, Number(newCap), id]
    );
    res.json({ message: 'Venue updated' });
  } catch (err) {
    next(err);
  }
});

router.delete('/venues/:id', roleRequired('admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [[{ cnt }]] = await pool.query('SELECT COUNT(*) AS cnt FROM Event WHERE Venue_ID = ?', [id]);
    if (cnt > 0) {
      return res.status(409).json({ message: `Cannot delete: ${cnt} event(s) use this venue.` });
    }
    await pool.query('DELETE FROM Venue WHERE Venue_ID = ?', [id]);
    res.json({ message: 'Venue deleted' });
  } catch (err) {
    next(err);
  }
});

/* ------------------------- USERS --------------------------- */

/**
 * GET /api/admin/users
 */
router.get('/users', roleRequired('admin'), async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT user_id, email, role, linked_id, created_at, active
       FROM Users
       ORDER BY role, email`
    );
    res.json({ users: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/users/:id  body: { active: 0|1 }
 */
router.patch('/users/:id', roleRequired('admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const active = req.body && req.body.active !== undefined ? Number(req.body.active) : 0;
    await pool.query('UPDATE Users SET active = ? WHERE user_id = ?', [active ? 1 : 0, id]);
    res.json({ message: active ? 'User activated' : 'User deactivated' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/users — admin creates a user account
 * body: { email, password, role, linked_id }
 */
router.post('/users', roleRequired('admin'), async (req, res, next) => {
  try {
    const { email, password, role, linked_id } = req.body || {};
    if (!email || !password || !role) {
      return res.status(400).json({ message: 'email, password, role are required' });
    }
    if (!['student', 'faculty', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    const [existing] = await pool.query('SELECT user_id FROM Users WHERE email = ?', [email]);
    if (existing.length) return res.status(409).json({ message: 'Email already registered' });
    const hash = await bcrypt.hash(password, 10);
    const [r] = await pool.query(
      'INSERT INTO Users (email, password_hash, role, linked_id) VALUES (?, ?, ?, ?)',
      [email, hash, role, linked_id || null]
    );
    res.status(201).json({ message: 'User created', user_id: r.insertId });
  } catch (err) {
    next(err);
  }
});

/* -------------------- ALL EVENTS (admin) ------------------- */

/**
 * GET /api/admin/events — same as /api/events but no filtering required
 */
router.get('/events', roleRequired('admin'), async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT E.Event_ID, E.Event_Name, E.Category, E.Event_Date, E.Start_Time, E.End_Time,
              E.Faculty_ID, V.Venue_Name, V.Capacity, CONCAT(F.First_Name,' ',F.Last_Name) AS Faculty_Name,
              (SELECT COUNT(*) FROM Registration R WHERE R.Event_ID = E.Event_ID
                 AND R.Registration_Status <> 'Cancelled') AS Registration_Count,
              (SELECT COUNT(*) FROM Attendance A WHERE A.Event_ID = E.Event_ID
                 AND A.Attendance_Status = 'Present') AS Present_Count
       FROM Event E
       JOIN Venue V ON E.Venue_ID = V.Venue_ID
       JOIN Faculty_Organizer F ON E.Faculty_ID = F.Faculty_ID
       ORDER BY E.Event_Date DESC, E.Start_Time`
    );
    res.json({ events: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

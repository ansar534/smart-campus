const express = require('express');
const pool = require('../db/connection');
const { roleRequired } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/attendance/event/:eventId — Faculty/Admin
 * Returns one row per registered (non-cancelled) student with attendance if present.
 * Auto-seeds an Attendance row as 'Absent' for any registered student who does not
 * yet have one, so faculty see the full checklist.
 */
router.get('/event/:eventId', roleRequired(['faculty', 'admin']), async (req, res, next) => {
  try {
    const eventId = Number(req.params.eventId);

    // Ownership check for faculty
    if (req.session.user.role === 'faculty') {
      const [[ev]] = await pool.query('SELECT Faculty_ID FROM Event WHERE Event_ID = ?', [eventId]);
      if (!ev) return res.status(404).json({ message: 'Event not found' });
      if (ev.Faculty_ID !== req.session.user.linked_id) {
        return res.status(403).json({ message: 'You can only view your own events' });
      }
    }

    // Auto-seed Absent rows for any registered student without attendance yet
    const [missing] = await pool.query(
      `SELECT R.Student_ID
       FROM Registration R
       WHERE R.Event_ID = ?
         AND R.Registration_Status <> 'Cancelled'
         AND NOT EXISTS (
           SELECT 1 FROM Attendance A
           WHERE A.Student_ID = R.Student_ID AND A.Event_ID = R.Event_ID
         )`,
      [eventId]
    );

    if (missing.length) {
      const [[{ nextId }]] = await pool.query(
        'SELECT COALESCE(MAX(Attendance_ID), 600) + 1 AS nextId FROM Attendance'
      );
      let id = nextId;
      for (const r of missing) {
        await pool.query(
          `INSERT INTO Attendance (Attendance_ID, Student_ID, Event_ID, Attendance_Status, Check_In_Time)
           VALUES (?, ?, ?, 'Absent', NULL)`,
          [id++, r.Student_ID, eventId]
        );
      }
    }

    const [rows] = await pool.query(
      `SELECT A.Attendance_ID, A.Student_ID, A.Attendance_Status, A.Check_In_Time,
              S.First_Name, S.Last_Name, S.Email, S.Major, S.Academic_Year,
              R.Registration_Status
       FROM Attendance A
       JOIN Student S ON A.Student_ID = S.Student_ID
       LEFT JOIN Registration R
         ON R.Student_ID = A.Student_ID AND R.Event_ID = A.Event_ID
       WHERE A.Event_ID = ?
       ORDER BY S.Last_Name, S.First_Name`,
      [eventId]
    );
    res.json({ attendance: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/attendance — Faculty only
 * body: { updates: [{ attendance_id, status, check_in_time }] }
 */
router.put('/', roleRequired('faculty'), async (req, res, next) => {
  try {
    const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
    if (!updates.length) return res.status(400).json({ message: 'updates array is required' });

    // For each update, verify it belongs to an event owned by this faculty
    for (const u of updates) {
      if (!u.attendance_id || !u.status) {
        return res.status(400).json({ message: 'Each update needs attendance_id and status' });
      }
      if (!['Present', 'Absent'].includes(u.status)) {
        return res.status(400).json({ message: `Invalid status "${u.status}"` });
      }
      const [[row]] = await pool.query(
        `SELECT A.Attendance_ID, E.Faculty_ID
         FROM Attendance A
         JOIN Event E ON A.Event_ID = E.Event_ID
         WHERE A.Attendance_ID = ?`,
        [u.attendance_id]
      );
      if (!row) return res.status(404).json({ message: `Attendance ${u.attendance_id} not found` });
      if (row.Faculty_ID !== req.session.user.linked_id) {
        return res.status(403).json({ message: 'You can only update your own events' });
      }
    }

    for (const u of updates) {
      const checkIn = u.status === 'Present' ? u.check_in_time || null : null;
      await pool.query(
        `UPDATE Attendance
         SET Attendance_Status = ?, Check_In_Time = ?
         WHERE Attendance_ID = ?`,
        [u.status, checkIn, u.attendance_id]
      );
    }

    res.json({ message: 'Attendance updated', count: updates.length });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/attendance/my — Student only
 */
router.get('/my', roleRequired('student'), async (req, res, next) => {
  try {
    const studentId = req.session.user.linked_id;
    const [rows] = await pool.query(
      `SELECT A.Attendance_ID, A.Attendance_Status, A.Check_In_Time,
              E.Event_ID, E.Event_Name, E.Category, E.Event_Date, E.Start_Time, E.End_Time,
              V.Venue_Name
       FROM Attendance A
       JOIN Event E ON A.Event_ID = E.Event_ID
       JOIN Venue V ON E.Venue_ID = V.Venue_ID
       WHERE A.Student_ID = ?
       ORDER BY E.Event_Date DESC`,
      [studentId]
    );
    res.json({ attendance: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

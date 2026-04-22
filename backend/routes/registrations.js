const express = require('express');
const pool = require('../db/connection');
const { authRequired, roleRequired } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/registrations — Student only
 * body: { event_id }
 *
 * Checks:
 *  - student is linked
 *  - event exists
 *  - capacity not exceeded (active registrations < venue capacity)
 *  - unique (Student_ID, Event_ID) is enforced at DB level too
 */
router.post('/', roleRequired('student'), async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { event_id } = req.body || {};
    const studentId = req.session.user.linked_id;
    if (!event_id) return res.status(400).json({ message: 'event_id is required' });
    if (!studentId) {
      return res.status(400).json({ message: 'Your account is not linked to a Student record' });
    }

    await conn.beginTransaction();

    const [[ev]] = await conn.query(
      `SELECT E.Event_ID, E.Venue_ID, V.Capacity
       FROM Event E JOIN Venue V ON E.Venue_ID = V.Venue_ID
       WHERE E.Event_ID = ? FOR UPDATE`,
      [event_id]
    );
    if (!ev) {
      await conn.rollback();
      return res.status(404).json({ message: 'Event not found' });
    }

    const [[dupRow]] = await conn.query(
      `SELECT Registration_ID FROM Registration
       WHERE Student_ID = ? AND Event_ID = ?`,
      [studentId, event_id]
    );
    if (dupRow) {
      await conn.rollback();
      return res.status(409).json({ message: 'You are already registered for this event' });
    }

    const [[{ activeCount }]] = await conn.query(
      `SELECT COUNT(*) AS activeCount FROM Registration
       WHERE Event_ID = ? AND Registration_Status <> 'Cancelled'`,
      [event_id]
    );
    if (activeCount >= ev.Capacity) {
      await conn.rollback();
      return res.status(409).json({ message: 'Venue capacity reached for this event' });
    }

    const [[{ nextId }]] = await conn.query(
      'SELECT COALESCE(MAX(Registration_ID), 500) + 1 AS nextId FROM Registration'
    );
    const today = new Date().toISOString().slice(0, 10);
    await conn.query(
      `INSERT INTO Registration
         (Registration_ID, Student_ID, Event_ID, Registration_Date, Registration_Status)
       VALUES (?, ?, ?, ?, 'Confirmed')`,
      [nextId, studentId, event_id, today]
    );

    await conn.commit();
    res.status(201).json({ message: 'Registered', registration_id: nextId });
  } catch (err) {
    await conn.rollback().catch(() => {});
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'You are already registered for this event' });
    }
    next(err);
  } finally {
    conn.release();
  }
});

/**
 * GET /api/registrations/my — Student only
 */
router.get('/my', roleRequired('student'), async (req, res, next) => {
  try {
    const studentId = req.session.user.linked_id;
    const [rows] = await pool.query(
      `SELECT R.Registration_ID, R.Registration_Date, R.Registration_Status,
              E.Event_ID, E.Event_Name, E.Category, E.Event_Date, E.Start_Time, E.End_Time,
              V.Venue_Name
       FROM Registration R
       JOIN Event E ON R.Event_ID = E.Event_ID
       JOIN Venue V ON E.Venue_ID = V.Venue_ID
       WHERE R.Student_ID = ?
       ORDER BY E.Event_Date DESC, E.Start_Time DESC`,
      [studentId]
    );
    res.json({ registrations: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/registrations/event/:eventId — Faculty/Admin
 */
router.get('/event/:eventId', roleRequired(['faculty', 'admin']), async (req, res, next) => {
  try {
    const eventId = Number(req.params.eventId);

    if (req.session.user.role === 'faculty') {
      const [[ev]] = await pool.query('SELECT Faculty_ID FROM Event WHERE Event_ID = ?', [eventId]);
      if (!ev) return res.status(404).json({ message: 'Event not found' });
      if (ev.Faculty_ID !== req.session.user.linked_id) {
        return res.status(403).json({ message: 'You can only view your own events' });
      }
    }

    const [rows] = await pool.query(
      `SELECT R.Registration_ID, R.Registration_Date, R.Registration_Status,
              S.Student_ID, S.First_Name, S.Last_Name, S.Email, S.Major, S.Academic_Year
       FROM Registration R
       JOIN Student S ON R.Student_ID = S.Student_ID
       WHERE R.Event_ID = ?
       ORDER BY R.Registration_Date`,
      [eventId]
    );
    res.json({ registrations: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/registrations/:id/cancel — Student only; must own; must be Pending
 */
router.patch('/:id/cancel', roleRequired('student'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const studentId = req.session.user.linked_id;

    const [[row]] = await pool.query(
      'SELECT Student_ID, Registration_Status FROM Registration WHERE Registration_ID = ?',
      [id]
    );
    if (!row) return res.status(404).json({ message: 'Registration not found' });
    if (row.Student_ID !== studentId) {
      return res.status(403).json({ message: 'You can only cancel your own registration' });
    }
    if (row.Registration_Status !== 'Pending') {
      return res.status(400).json({
        message: `Only Pending registrations can be cancelled (current: ${row.Registration_Status})`,
      });
    }
    await pool.query(
      `UPDATE Registration SET Registration_Status = 'Cancelled' WHERE Registration_ID = ?`,
      [id]
    );
    res.json({ message: 'Registration cancelled' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

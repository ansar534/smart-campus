const express = require('express');
const pool = require('../db/connection');
const { authRequired, roleRequired } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/events
 * Public. Query params: ?category=&date=&search=&facultyId=
 * Returns events with venue name, faculty name, and a registration_count.
 */
router.get('/', async (req, res, next) => {
  try {
    const { category, date, search, facultyId } = req.query;
    const where = [];
    const params = [];

    if (category) {
      where.push('E.Category = ?');
      params.push(category);
    }
    if (date) {
      where.push('E.Event_Date = ?');
      params.push(date);
    }
    if (search) {
      where.push('E.Event_Name LIKE ?');
      params.push(`%${search}%`);
    }
    if (facultyId) {
      where.push('E.Faculty_ID = ?');
      params.push(Number(facultyId));
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT
         E.Event_ID,
         E.Event_Name,
         E.Category,
         E.Event_Date,
         E.Start_Time,
         E.End_Time,
         E.Description,
         E.Faculty_ID,
         E.Venue_ID,
         V.Venue_Name,
         V.Location AS Venue_Location,
         V.Capacity,
         CONCAT(F.First_Name, ' ', F.Last_Name) AS Faculty_Name,
         F.Department,
         (SELECT COUNT(*) FROM Registration R
           WHERE R.Event_ID = E.Event_ID AND R.Registration_Status <> 'Cancelled') AS Registration_Count,
         (SELECT COUNT(*) FROM Attendance A
           WHERE A.Event_ID = E.Event_ID AND A.Attendance_Status = 'Present') AS Present_Count
       FROM Event E
       JOIN Venue V ON E.Venue_ID = V.Venue_ID
       JOIN Faculty_Organizer F ON E.Faculty_ID = F.Faculty_ID
       ${whereSql}
       ORDER BY E.Event_Date, E.Start_Time`,
      params
    );

    res.json({ events: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/events/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query(
      `SELECT
         E.*, V.Venue_Name, V.Location AS Venue_Location, V.Capacity,
         CONCAT(F.First_Name, ' ', F.Last_Name) AS Faculty_Name, F.Department,
         (SELECT COUNT(*) FROM Registration R
           WHERE R.Event_ID = E.Event_ID AND R.Registration_Status <> 'Cancelled') AS Registration_Count,
         (SELECT COUNT(*) FROM Attendance A
           WHERE A.Event_ID = E.Event_ID AND A.Attendance_Status = 'Present') AS Present_Count
       FROM Event E
       JOIN Venue V ON E.Venue_ID = V.Venue_ID
       JOIN Faculty_Organizer F ON E.Faculty_ID = F.Faculty_ID
       WHERE E.Event_ID = ?`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Event not found' });
    res.json({ event: rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * Helper: venue double-booking check.
 * Returns conflicting event row if there is an overlap, else null.
 */
async function findVenueConflict({ venueId, date, startTime, endTime, excludeEventId = null }) {
  const params = [venueId, date, endTime, startTime];
  let sql =
    `SELECT Event_ID, Event_Name, Start_Time, End_Time
     FROM Event
     WHERE Venue_ID = ?
       AND Event_Date = ?
       AND Start_Time < ?
       AND End_Time > ?`;
  if (excludeEventId) {
    sql += ' AND Event_ID <> ?';
    params.push(excludeEventId);
  }
  const [rows] = await pool.query(sql, params);
  return rows[0] || null;
}

/**
 * POST /api/events — Faculty/Admin
 * body: { event_name, category, venue_id, event_date, start_time, end_time, description, faculty_id? }
 * Event_ID is the PK and is NOT auto-increment in Phase 3 schema, so we
 * generate the next ID ourselves (MAX+1).
 */
router.post('/', roleRequired(['faculty', 'admin']), async (req, res, next) => {
  try {
    const {
      event_name,
      category,
      venue_id,
      event_date,
      start_time,
      end_time,
      description,
    } = req.body || {};
    const user = req.session.user;
    const requestedFacultyId = req.body.faculty_id ? Number(req.body.faculty_id) : null;
    const facultyId =
      user.role === 'faculty'
        ? user.linked_id
        : requestedFacultyId;

    if (!event_name || !category || !venue_id || !event_date || !start_time || !end_time) {
      return res.status(400).json({
        message: 'event_name, category, venue_id, event_date, start_time, end_time are required',
      });
    }
    if (!facultyId) {
      return res.status(400).json({
        message:
          user.role === 'admin'
            ? 'faculty_id is required for admin-created events'
            : 'Your account is not linked to a Faculty record',
      });
    }
    const [[facultyExists]] = await pool.query(
      'SELECT Faculty_ID FROM Faculty_Organizer WHERE Faculty_ID = ?',
      [facultyId]
    );
    if (!facultyExists) {
      return res.status(400).json({ message: `Faculty organizer ${facultyId} does not exist` });
    }

    if (start_time >= end_time) {
      return res.status(400).json({ message: 'End_Time must be after Start_Time' });
    }

    const conflict = await findVenueConflict({
      venueId: Number(venue_id),
      date: event_date,
      startTime: start_time,
      endTime: end_time,
    });
    if (conflict) {
      return res.status(409).json({
        message: `Venue double-booking: conflicts with "${conflict.Event_Name}" (${conflict.Start_Time}-${conflict.End_Time})`,
      });
    }

    const [[{ nextId }]] = await pool.query(
      'SELECT COALESCE(MAX(Event_ID), 400) + 1 AS nextId FROM Event'
    );

    await pool.query(
      `INSERT INTO Event
         (Event_ID, Faculty_ID, Venue_ID, Event_Name, Category, Event_Date, Start_Time, End_Time, Description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nextId, facultyId, venue_id, event_name, category, event_date, start_time, end_time, description || null]
    );

    res.status(201).json({ message: 'Event created', event_id: nextId });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/events/:id — Faculty/Admin (faculty ownership check)
 */
router.put('/:id', roleRequired(['faculty', 'admin']), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const user = req.session.user;

    const [existing] = await pool.query('SELECT * FROM Event WHERE Event_ID = ?', [id]);
    if (!existing.length) return res.status(404).json({ message: 'Event not found' });
    if (user.role === 'faculty' && existing[0].Faculty_ID !== user.linked_id) {
      return res.status(403).json({ message: 'You can only edit your own events' });
    }

    const current = existing[0];
    const event_name   = req.body.event_name   ?? current.Event_Name;
    const category     = req.body.category     ?? current.Category;
    const venue_id     = req.body.venue_id     ?? current.Venue_ID;
    const event_date   = req.body.event_date   ?? current.Event_Date;
    const start_time   = req.body.start_time   ?? current.Start_Time;
    const end_time     = req.body.end_time     ?? current.End_Time;
    const description  = req.body.description  ?? current.Description;
    const faculty_id   = req.body.faculty_id !== undefined
      ? Number(req.body.faculty_id)
      : current.Faculty_ID;

    if (!faculty_id) {
      return res.status(400).json({ message: 'faculty_id is required' });
    }

    const [[facultyExists]] = await pool.query(
      'SELECT Faculty_ID FROM Faculty_Organizer WHERE Faculty_ID = ?',
      [faculty_id]
    );
    if (!facultyExists) {
      return res.status(400).json({ message: `Faculty organizer ${faculty_id} does not exist` });
    }

    if (start_time >= end_time) {
      return res.status(400).json({ message: 'End_Time must be after Start_Time' });
    }

    const conflict = await findVenueConflict({
      venueId: Number(venue_id),
      date: event_date,
      startTime: start_time,
      endTime: end_time,
      excludeEventId: id,
    });
    if (conflict) {
      return res.status(409).json({
        message: `Venue double-booking: conflicts with "${conflict.Event_Name}"`,
      });
    }

    await pool.query(
      `UPDATE Event
       SET Faculty_ID=?, Event_Name=?, Category=?, Venue_ID=?, Event_Date=?, Start_Time=?, End_Time=?, Description=?
       WHERE Event_ID = ?`,
      [faculty_id, event_name, category, venue_id, event_date, start_time, end_time, description, id]
    );

    res.json({ message: 'Event updated' });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/events/:id — Faculty only; refuse if registrations exist.
 */
router.delete('/:id', roleRequired(['faculty', 'admin']), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await pool.query('SELECT Faculty_ID FROM Event WHERE Event_ID = ?', [id]);
    if (!existing.length) return res.status(404).json({ message: 'Event not found' });

    if (
      req.session.user.role === 'faculty' &&
      existing[0].Faculty_ID !== req.session.user.linked_id
    ) {
      return res.status(403).json({ message: 'You can only delete your own events' });
    }

    const [[{ cnt }]] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM Registration WHERE Event_ID = ?',
      [id]
    );
    if (cnt > 0) {
      return res.status(409).json({
        message: `Cannot delete: ${cnt} registration(s) exist. Cancel them first.`,
      });
    }

    await pool.query('DELETE FROM Attendance WHERE Event_ID = ?', [id]);
    await pool.query('DELETE FROM Event WHERE Event_ID = ?', [id]);
    res.json({ message: 'Event deleted' });
  } catch (err) {
    next(err);
  }
});

// Export helper so other routes/tests could reuse it if needed
router._findVenueConflict = findVenueConflict;
module.exports = router;

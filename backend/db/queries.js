/**
 * The 14 Phase 3 analytical queries, exposed to the admin Reports panel.
 * Each entry: { id, title, description, sql, params? }.
 * Parameterized queries are NOT required here because these are read-only
 * canned reports with no user input.
 */

const PHASE3_QUERIES = [
  {
    id: 1,
    title: 'Q1 — All Students',
    description: 'Display all students in the Student table',
    sql: 'SELECT * FROM Student',
  },
  {
    id: 2,
    title: 'Q2 — All Faculty Organizers',
    description: 'Display all faculty organizers',
    sql: 'SELECT * FROM Faculty_Organizer',
  },
  {
    id: 3,
    title: 'Q3 — All Events by Date',
    description: 'Display all events ordered by date',
    sql: `SELECT Event_ID, Event_Name, Category, Event_Date, Start_Time, End_Time
          FROM Event
          ORDER BY Event_Date, Start_Time`,
  },
  {
    id: 4,
    title: 'Q4 — Technical Events',
    description: 'Display all events under the Technical category',
    sql: `SELECT Event_ID, Event_Name, Category, Event_Date
          FROM Event
          WHERE Category = 'Technical'`,
  },
  {
    id: 5,
    title: 'Q5 — Events with Venue',
    description: 'Show each event along with its venue name',
    sql: `SELECT E.Event_ID, E.Event_Name, V.Venue_Name, V.Location
          FROM Event E
          JOIN Venue V ON E.Venue_ID = V.Venue_ID`,
  },
  {
    id: 6,
    title: 'Q6 — Events with Organizer',
    description: 'Show each event along with its faculty organizer',
    sql: `SELECT E.Event_ID, E.Event_Name, F.First_Name, F.Last_Name, F.Department
          FROM Event E
          JOIN Faculty_Organizer F ON E.Faculty_ID = F.Faculty_ID`,
  },
  {
    id: 7,
    title: 'Q7 — Registrations Detail',
    description: 'Show student registrations along with student and event details',
    sql: `SELECT R.Registration_ID, S.First_Name, S.Last_Name, E.Event_Name, R.Registration_Status
          FROM Registration R
          JOIN Student S ON R.Student_ID = S.Student_ID
          JOIN Event E ON R.Event_ID = E.Event_ID`,
  },
  {
    id: 8,
    title: 'Q8 — Attendance Detail',
    description: 'Show attendance details with corresponding student and event names',
    sql: `SELECT A.Attendance_ID, S.First_Name, S.Last_Name, E.Event_Name, A.Attendance_Status, A.Check_In_Time
          FROM Attendance A
          JOIN Student S ON A.Student_ID = S.Student_ID
          JOIN Event E ON A.Event_ID = E.Event_ID`,
  },
  {
    id: 9,
    title: 'Q9 — Registrations per Event',
    description: 'Count the number of students registered for each event',
    sql: `SELECT E.Event_Name, COUNT(R.Registration_ID) AS Total_Registrations
          FROM Event E
          LEFT JOIN Registration R ON E.Event_ID = R.Event_ID
          GROUP BY E.Event_ID, E.Event_Name`,
  },
  {
    id: 10,
    title: 'Q10 — Events with >1 Present',
    description: 'Show events having more than one present attendee',
    sql: `SELECT E.Event_Name, COUNT(A.Attendance_ID) AS Present_Count
          FROM Event E
          JOIN Attendance A ON E.Event_ID = A.Event_ID
          WHERE A.Attendance_Status = 'Present'
          GROUP BY E.Event_ID, E.Event_Name
          HAVING COUNT(A.Attendance_ID) > 1`,
  },
  {
    id: 11,
    title: 'Q11 — Students w/ Multiple Events',
    description: 'Display students who registered for more than one event',
    sql: `SELECT S.Student_ID, S.First_Name, S.Last_Name, COUNT(R.Event_ID) AS Event_Count
          FROM Student S
          JOIN Registration R ON S.Student_ID = R.Student_ID
          GROUP BY S.Student_ID, S.First_Name, S.Last_Name
          HAVING COUNT(R.Event_ID) > 1`,
  },
  {
    id: 12,
    title: 'Q12 — Venue Usage',
    description: 'Display venue usage counts in descending order',
    sql: `SELECT V.Venue_Name, COUNT(E.Event_ID) AS Total_Events
          FROM Venue V
          LEFT JOIN Event E ON V.Venue_ID = E.Venue_ID
          GROUP BY V.Venue_ID, V.Venue_Name
          ORDER BY Total_Events DESC`,
  },
  {
    id: 13,
    title: 'Q13 — Absent Students',
    description: 'Show students who registered for events but were marked absent',
    sql: `SELECT S.First_Name, S.Last_Name, E.Event_Name, A.Attendance_Status
          FROM Attendance A
          JOIN Student S ON A.Student_ID = S.Student_ID
          JOIN Event E ON A.Event_ID = E.Event_ID
          WHERE A.Attendance_Status = 'Absent'`,
  },
  {
    id: 14,
    title: 'Q14 — Registrations vs Attendance',
    description: 'Compare registrations and attendance for each event (where reg > present)',
    sql: `SELECT
            E.Event_Name,
            (SELECT COUNT(*) FROM Registration R WHERE R.Event_ID = E.Event_ID) AS Registration_Count,
            (SELECT COUNT(*) FROM Attendance A WHERE A.Event_ID = E.Event_ID AND A.Attendance_Status = 'Present') AS Attendance_Count
          FROM Event E
          WHERE (SELECT COUNT(*) FROM Registration R WHERE R.Event_ID = E.Event_ID) >
                (SELECT COUNT(*) FROM Attendance A WHERE A.Event_ID = E.Event_ID AND A.Attendance_Status = 'Present')`,
  },
];

module.exports = { PHASE3_QUERIES };

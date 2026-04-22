# Smart Campus Event Management System (SCEMS)

Full-stack web application for Team 10's Database Management course project.
Built on the existing `smartcamsuseventdb` MySQL schema from Phase 3.

- Frontend: plain HTML / CSS / vanilla JS (Fetch API)
- Backend: Node.js + Express (REST API, session auth)
- Database: MySQL 8.x (existing 6 tables + new `Users` table)
- Auth: session-based with bcrypt password hashes

## 1. Prerequisites

- Node.js 18+ (tested on v24)
- MySQL 8.x running locally
- Your Phase 3 database `smartcamsuseventdb` already populated

## 2. Configure environment

Edit `backend/.env` and set your MySQL root password:

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASS=YOUR_MYSQL_PASSWORD
DB_NAME=smartcamsuseventdb
SESSION_SECRET=change_this_to_a_long_random_string
PORT=3000
```

## 3. Create the `Users` table (one-time)

In MySQL Workbench or CLI, run:

```sql
SOURCE database/users_migration.sql;
```

Or copy-paste the contents of `database/users_migration.sql`.

## 4. Install & seed

```powershell
cd C:\Users\ansar\smart-campus
npm install
npm run seed-users
```

`seed-users` creates a login account for every Student and Faculty row that
already exists in your database, plus an admin account:

| Role    | Email                    | Password      |
|---------|--------------------------|---------------|
| student | john.smith@univ.edu      | password123   |
| student | emma.johnson@univ.edu    | password123   |
| student | *(one per student row)*  | password123   |
| faculty | emily.clark@univ.edu     | password123   |
| faculty | james.miller@univ.edu    | password123   |
| faculty | sarah.anderson@univ.edu  | password123   |
| admin   | admin@univ.edu           | admin123      |

## 5. Run the server

```powershell
npm start
```

Then open: <http://localhost:3000/pages/login.html>

## 6. What to try

- Log in as `john.smith@univ.edu` / `password123` (student)
  - Browse events, register for one, cancel a pending registration
- Log in as `emily.clark@univ.edu` / `password123` (faculty)
  - Create an event (try double-booking a venue — you'll see a 409 error)
  - Mark attendance for a registered student
- Log in as `admin@univ.edu` / `admin123`
  - View KPI dashboard
  - Go to Reports and run any of the 14 Phase 3 SQL queries
  - CRUD venues and users

## Project layout

```
smart-campus/
├── backend/
│   ├── .env
│   ├── server.js                Express app entry point
│   ├── db/
│   │   ├── connection.js        mysql2 connection pool
│   │   └── queries.js           14 Phase 3 SQL queries
│   ├── middleware/
│   │   └── auth.js              authRequired + roleRequired
│   ├── routes/
│   │   ├── auth.js              login / register / logout / me
│   │   ├── events.js            event CRUD (faculty)
│   │   ├── registrations.js     student registration + cancel
│   │   ├── attendance.js        faculty mark attendance
│   │   └── admin.js             stats, reports, venues, users
│   └── scripts/
│       └── seed-users.js        one-command user seeder
├── frontend/
│   ├── css/main.css
│   ├── js/api.js                fetch wrapper
│   ├── js/auth.js               requireAuth / logout / navbar
│   ├── js/utils.js              formatters + toast
│   └── pages/
│       ├── login.html
│       ├── register.html
│       ├── student/             dashboard.html, events.html, my-events.html
│       ├── faculty/             dashboard.html, create-event.html, attendance.html
│       └── admin/               dashboard.html, reports.html, venues.html, users.html
├── database/
│   └── users_migration.sql      CREATE TABLE Users (+ active column)
├── package.json
└── README.md
```

## Acceptance criteria coverage

- AC-01: Phase 3 SQL already loaded in `smartcamsuseventdb`
- AC-02: Student register/login/browse/register/see-in-my-events — verified
- AC-03: Duplicate registration returns HTTP 409 (unique constraint + pre-check)
- AC-04: Faculty create/view/mark attendance — verified
- AC-05: Venue double-booking returns HTTP 409
- AC-06: Admin dashboard reads live DB data via `/api/admin/stats`
- AC-07: All 14 Phase 3 queries runnable from `/pages/admin/reports.html`
- AC-08: Passwords hashed with bcrypt (cost 10), never returned
- AC-09: `roleRequired` middleware blocks cross-role access with HTTP 403
- AC-10: All forms validate client-side before calling the API

## Troubleshooting

| Symptom                                 | Fix                                                |
|-----------------------------------------|----------------------------------------------------|
| `ER_ACCESS_DENIED_ERROR` on boot        | Wrong `DB_PASS` in `backend/.env`                  |
| `ER_NO_SUCH_TABLE: 'Users'`             | Run `database/users_migration.sql` once            |
| `Cannot GET /`                          | Visit `/pages/login.html` instead                  |
| Login says "Invalid email or password"  | Run `npm run seed-users` to create default users   |
| CORS / cookie issues                    | Access via `http://localhost:3000` (same origin)   |

# Glamour Forever — Employee Document Management Portal

A small demo MVP admin portal for the Glamour Forever nail salon group (UK). It gives the owner one place to manage branches, employees and their documents (passport, right to work, eVisa share codes, DBS, and so on), with automatic expiry tracking.

> **Demo only.** Authentication is a single admin account read from environment variables. This is **not production-ready**. See [Before production](#before-production).

## Tech

Node.js · Express 5 · EJS · PostgreSQL · Prisma · Multer · plain CSS/JS. No frontend framework, no build step.

## Requirements

- Node.js 18.18+
- PostgreSQL 13+
- npm

## Installation

```bash
npm install
```

## Environment

Copy `.env.example` to `.env`, then set `DATABASE_URL` to your PostgreSQL connection:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/glamour_forever"
SESSION_SECRET="change-this-secret"
ADMIN_EMAIL="admin@glamourforever.com"
ADMIN_PASSWORD="admin123"
PORT=3000
```

## Prisma

```bash
npx prisma generate
npx prisma migrate dev      # creates the database (if needed) and tables
npm run prisma:seed         # loads fictional demo data (only if the database is empty)
npm run prisma:seed:reset   # WIPES all data and reloads the demo data
```

The seed creates fictional UK data: 4 branches (London Soho, London Canary Wharf, Manchester, Edinburgh), 10 employees and 27 documents, each with a small sample PDF. Expiry dates are relative to the day you run the seed, so the dashboard always shows a mix of valid, expiring, urgent and expired documents. Phone numbers use Ofcom's ranges reserved for fiction.

## Start

Development (auto-restart):

```bash
npm run dev
```

Application:

```bash
npm start
```

Then open <http://localhost:3000>.

### Demo login

| Email | Password |
|---|---|
| `admin@glamourforever.com` | `admin123` |

(These come from `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`.)

## Deploying to Render (free trial)

`render.yaml` is a Render Blueprint that creates a free web service and a free PostgreSQL database in Frankfurt, the closest region to the UK.

1. Push this project to a GitHub repository. `.env` is git-ignored and must not be committed.
2. In Render, go to **New → Blueprint** and select the repository.
3. When prompted, enter `ADMIN_EMAIL` and `ADMIN_PASSWORD` for the hosted login. `SESSION_SECRET` is generated automatically, and `DATABASE_URL` is wired to the new database.
4. Deploy. The build runs the migrations and seeds the UK demo data the first time, when the database is empty. Later deploys keep your data.

Free-tier notes:

- The web service sleeps after about 15 minutes without traffic. The first request afterwards takes about a minute.
- Render's free PostgreSQL expires 30 days after creation. Upgrade it, or point `DATABASE_URL` at another provider, to keep the data longer.
- The database accepts no outside connections (`ipAllowList: []`), so only the web service can reach it.

## Project structure

```text
app.js                 Express setup, cookie sessions, login/logout, auth guard, error pages
helpers.js             Prisma client, constants, expiry-status + date/form helpers
routes/dashboard.js    Dashboard stats + documents needing attention
routes/employees.js    Employee CRUD, search/filter, documents + file uploads
routes/branches.js     Branch CRUD
views/                 EJS templates (layout.ejs wraps every page except login)
public/css/style.css   All styling
public/js/app.js       Small enhancements (delete confirms, clickable rows, flash dismiss)
prisma/schema.prisma   Branch, Employee, EmployeeDocument
prisma/seed.js         Fictional UK demo data
render.yaml            Render Blueprint (web service + PostgreSQL)
```

## Document expiry status

Status is calculated each time a document is displayed and is never stored (see `documentStatus()` in `helpers.js`):

| Status | Rule |
|---|---|
| Expired | Expiry date has passed |
| Urgent | Expires within 30 days |
| Expiring Soon | Expires within 90 days |
| Valid | More than 90 days away, or no expiry date |

The dashboard's "Expiring Soon" count covers everything within 90 days, urgent documents included.

## File uploads

- PDF, JPG, JPEG and PNG only (checked by extension and MIME type), with a 10 MB limit.
- Files are stored in PostgreSQL (`EmployeeDocument.fileData`) so they survive restarts on hosts without a persistent disk, such as Render's free tier. The Prisma client excludes `fileData` from queries by default (see `helpers.js`) and loads it only when a file is viewed or downloaded.
- Files are served only to a signed-in admin, through `/employees/:employeeId/documents/:documentId` (view inline) and `/employees/:employeeId/documents/:documentId/download`.
- To switch to S3 or other cloud storage later, change `fileFields()` and `sendFile()` at the top of `routes/employees.js`.

Every response sends `X-Robots-Tag: noindex`, and `/robots.txt` disallows all crawling.

## Before production

- Replace the single env-var admin with real user accounts (hashed passwords, roles).
- Use server-side sessions so a login can be revoked before its 8-hour cookie expires.
- Add CSRF tokens and login rate limiting.
- Move documents to private cloud storage with encryption at rest.
- Add audit logging for document access.

// Small shared helpers: Prisma client, constants, date + expiry-status helpers.
const { PrismaClient } = require('@prisma/client');

// File contents (fileData) are never loaded unless a query asks for them with
// `omit: { fileData: false }`, so lists and dashboards stay fast.
const prisma = new PrismaClient({
  omit: { employeeDocument: { fileData: true } },
});

// UK-focused document types. Plain strings, so adding one is just editing this list.
const DOCUMENT_TYPES = [
  'Passport',
  'Right to Work Check',
  'eVisa / Share Code',
  'Biometric Residence Permit',
  'National Insurance Number',
  'Driving Licence',
  'Proof of Address',
  'DBS Certificate',
  'Employment Contract',
  'Qualification (NVQ / VTCT)',
  'Other',
];

const JOB_TITLES = [
  'Nail Technician',
  'Senior Nail Technician',
  'Beauty Therapist',
  'Salon Manager',
  'Assistant Manager',
  'Receptionist',
];

const UK_REGIONS = [
  'Greater London', 'South East', 'South West', 'East of England', 'East Midlands',
  'West Midlands', 'Yorkshire and the Humber', 'North West', 'North East',
  'Scotland', 'Wales', 'Northern Ireland',
];

const EMPLOYMENT_STATUSES = ['Active', 'Inactive', 'On Leave', 'Terminated'];
const BRANCH_STATUSES = ['Active', 'Inactive'];

const DAY_MS = 24 * 60 * 60 * 1000;

// Today at midnight UTC. Dates are stored as plain dates (@db.Date), which
// Prisma returns as UTC midnight, so we compare against UTC midnight too.
function today() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function daysUntil(date) {
  return Math.round((new Date(date).getTime() - today().getTime()) / DAY_MS);
}

// Expiry status is calculated on display - never stored in the database.
//   Expired       -> expiry date has passed
//   Urgent        -> expires within 30 days
//   Expiring Soon -> expires within 90 days
//   Valid         -> more than 90 days away, or no expiry date
function documentStatus(expiryDate) {
  if (!expiryDate) return { label: 'Valid', key: 'valid', days: null };
  const days = daysUntil(expiryDate);
  if (days < 0) return { label: 'Expired', key: 'expired', days };
  if (days <= 30) return { label: 'Urgent', key: 'urgent', days };
  if (days <= 90) return { label: 'Expiring Soon', key: 'expiring', days };
  return { label: 'Valid', key: 'valid', days };
}

// "2028-08-15" -> "15 Aug 2028"
function formatDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

// Value for <input type="date">
function inputDate(date) {
  if (!date) return '';
  if (typeof date === 'string') return date; // already "YYYY-MM-DD" (re-rendered form)
  return new Date(date).toISOString().slice(0, 10);
}

function relativeDays(days) {
  if (days === null || days === undefined) return '—';
  if (days < 0) return `Expired ${Math.abs(days)} day${days === -1 ? '' : 's'} ago`;
  if (days === 0) return 'Expires today';
  return `${days} day${days === 1 ? '' : 's'}`;
}

function initials(firstName, lastName) {
  return ((firstName || '')[0] || '').toUpperCase() + ((lastName || '')[0] || '').toUpperCase();
}

// ---- Form input helpers ----

// Trim a form value and cap its length. Empty -> null.
function clean(value, maxLength = 255) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim().slice(0, maxLength);
  return s === '' ? null : s;
}

// Parse "YYYY-MM-DD" into a Date (UTC midnight). Invalid/empty -> null.
function parseDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(value + 'T00:00:00Z');
  return isNaN(d.getTime()) ? null : d;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Route param -> positive integer id, or null.
function toId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Simple session flash messages: setFlash(req, 'success', 'Saved.')
function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

module.exports = {
  prisma,
  DOCUMENT_TYPES,
  JOB_TITLES,
  UK_REGIONS,
  EMPLOYMENT_STATUSES,
  BRANCH_STATUSES,
  today,
  addDays,
  daysUntil,
  documentStatus,
  formatDate,
  inputDate,
  relativeDays,
  initials,
  clean,
  parseDate,
  isValidEmail,
  toId,
  setFlash,
};

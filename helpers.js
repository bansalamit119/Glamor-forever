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
const COMPANY_STATUSES = ['Active', 'Inactive'];

// Phone country codes for the dropdown next to phone fields. UK first (default).
const DEFAULT_PHONE_CODE = '+44';
const PHONE_COUNTRY_CODES = [
  { code: '+44', label: 'UK +44' },
  { code: '+353', label: 'IE +353' },
  { code: '+1', label: 'US/CA +1' },
  { code: '+33', label: 'FR +33' },
  { code: '+49', label: 'DE +49' },
  { code: '+34', label: 'ES +34' },
  { code: '+351', label: 'PT +351' },
  { code: '+39', label: 'IT +39' },
  { code: '+48', label: 'PL +48' },
  { code: '+40', label: 'RO +40' },
  { code: '+359', label: 'BG +359' },
  { code: '+370', label: 'LT +370' },
  { code: '+91', label: 'IN +91' },
  { code: '+92', label: 'PK +92' },
  { code: '+880', label: 'BD +880' },
  { code: '+84', label: 'VN +84' },
  { code: '+63', label: 'PH +63' },
  { code: '+86', label: 'CN +86' },
  { code: '+234', label: 'NG +234' },
  { code: '+27', label: 'ZA +27' },
  { code: '+971', label: 'AE +971' },
  { code: '+61', label: 'AU +61' },
];

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

// ("+44", "7700 900123") -> "+44 7700 900123"
function formatPhone(countryCode, number) {
  if (!number) return '—';
  return countryCode ? `${countryCode} ${number}` : number;
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

// Phone number without country code: digits, spaces, dashes, brackets.
function isValidPhone(value) {
  return /^[0-9][0-9 ()-]{3,19}$/.test(value);
}

// Form value -> a known country code, or null.
function phoneCode(value) {
  return PHONE_COUNTRY_CODES.some((c) => c.code === value) ? value : null;
}

// Form value(s) -> array of unique positive integer ids. Handles one value or many.
function toIds(value) {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return [...new Set(values.map(toId).filter(Boolean))];
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
  COMPANY_STATUSES,
  DEFAULT_PHONE_CODE,
  PHONE_COUNTRY_CODES,
  formatPhone,
  isValidPhone,
  phoneCode,
  toIds,
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

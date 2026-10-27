// Seed script - small, realistic but entirely FICTIONAL UK demo data.
// Expiry dates are relative to today so the dashboard always shows a mix of
// valid, expiring soon, urgent and expired documents.
// Phone numbers use Ofcom's ranges reserved for drama/fiction (e.g. 020 7946 0xxx, 07700 900xxx).
//
//   npm run prisma:seed         -> seeds only if the database is empty (safe on every deploy)
//   npm run prisma:seed:reset   -> WIPES all branches/employees/documents and reseeds
require('dotenv').config({ quiet: true });

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const force = process.argv.includes('--force');

function daysFromToday(days) {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + days));
}

function date(iso) {
  return new Date(iso + 'T00:00:00Z');
}

// Build a tiny one-page PDF so "View" works on seeded documents.
function samplePdf(lines) {
  const esc = (s) => String(s).replace(/[\\()]/g, (c) => '\\' + c);
  const text = lines
    .map((line, i) => `BT /F1 ${i === 0 ? 20 : 12} Tf 60 ${760 - i * 28} Td (${esc(line)}) Tj ET`)
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => { pdf += `${String(o).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf);
}

const branches = [
  { name: 'London Soho', region: 'Greater London', address: '42 Wardour Street, London W1D 6QZ', phone: '+44 20 7946 0123' },
  { name: 'London Canary Wharf', region: 'Greater London', address: 'Unit 8, Cabot Place, London E14 4QT', phone: '+44 20 7946 0456' },
  { name: 'Manchester', region: 'North West', address: '18 King Street, Manchester M2 4LQ', phone: '+44 161 496 0789' },
  { name: 'Edinburgh', region: 'Scotland', address: '55 George Street, Edinburgh EH2 2HT', phone: '+44 131 496 0321' },
];

const CITY = ['London', 'London', 'Manchester', 'Edinburgh'];

// docs: [documentType, expiry offset in days from today (null = no expiry)]
const employees = [
  { first: 'Sophie', last: 'Turnbull', title: 'Salon Manager', branch: 0, status: 'Active', dob: '1987-04-12', start: '2019-03-04',
    docs: [['Passport', 1400], ['Right to Work Check', null], ['National Insurance Number', null], ['Employment Contract', null]] },
  { first: 'Amara', last: 'Okoye', title: 'Senior Nail Technician', branch: 0, status: 'Active', dob: '1992-09-23', start: '2020-06-15',
    docs: [['eVisa / Share Code', 12], ['Passport', 900], ['Proof of Address', null]] },
  { first: 'Chloe', last: 'Harrington', title: 'Nail Technician', branch: 0, status: 'Active', dob: '1998-01-30', start: '2023-02-06',
    docs: [['Passport', 48], ['National Insurance Number', null], ['Qualification (NVQ / VTCT)', null]] },
  { first: 'Linh', last: 'Tran', title: 'Nail Technician', branch: 1, status: 'Active', dob: '1995-07-08', start: '2021-09-20',
    docs: [['eVisa / Share Code', 24], ['Biometric Residence Permit', -30], ['Qualification (NVQ / VTCT)', null]] },
  { first: 'Isla', last: 'McKenzie', title: 'Assistant Manager', branch: 1, status: 'Active', dob: '1990-05-19', start: '2018-10-01',
    docs: [['Driving Licence', 2100], ['DBS Certificate', null], ['Employment Contract', null]] },
  { first: 'Priya', last: 'Sharma', title: 'Receptionist', branch: 1, status: 'On Leave', dob: '2000-11-02', start: '2024-01-15',
    docs: [['Passport', 75], ['Proof of Address', null]] },
  { first: 'Megan', last: 'Price', title: 'Salon Manager', branch: 2, status: 'Active', dob: '1986-02-27', start: '2017-04-24',
    docs: [['Passport', 1600], ['Right to Work Check', null], ['Qualification (NVQ / VTCT)', null]] },
  { first: 'Daria', last: 'Kowalska', title: 'Senior Nail Technician', branch: 2, status: 'Active', dob: '1991-03-14', start: '2019-11-11',
    docs: [['eVisa / Share Code', -8], ['Passport', 61], ['National Insurance Number', null]] },
  { first: 'Grace', last: 'Adeyemi', title: 'Beauty Therapist', branch: 3, status: 'Active', dob: '1996-10-10', start: '2022-05-03',
    docs: [['Passport', 7], ['Qualification (NVQ / VTCT)', null]] },
  { first: 'Kirsty', last: 'Campbell', title: 'Nail Technician', branch: 3, status: 'Inactive', dob: '1993-12-01', start: '2020-08-17',
    docs: [['Driving Licence', -20], ['Right to Work Check', null]] },
];

// Fictional, correctly-shaped reference numbers per document type.
function documentNumber(type, i, j, last) {
  const n = String(482910 + i * 1337 + j * 71);
  switch (type) {
    case 'Passport': return `5${n}${(i + j) % 10}${i % 10}`.slice(0, 9);
    case 'eVisa / Share Code': return `W${n.slice(0, 2)} ${'KPXMRT'[i % 6]}${n.slice(2, 4)} ${'LQZNV'[j % 5]}${n.slice(4, 5)}`;
    case 'Biometric Residence Permit': return `ZU${n}${i % 10}`;
    case 'National Insurance Number': return `QQ ${n.slice(0, 2)} ${n.slice(2, 4)} ${n.slice(4, 6)} ${'ABCD'[i % 4]}`;
    case 'Driving Licence': return `${last.toUpperCase().padEnd(5, '9').slice(0, 5)}${n}${'ABCDEFGH'[i % 8]}${'XYZW'[j % 4]}9`;
    case 'DBS Certificate': return `00${n}${String(i).padStart(4, '0')}`;
    case 'Right to Work Check': return `RTW-${2017 + i}-${String(100 + i * 7).padStart(4, '0')}`;
    default: return null;
  }
}

async function main() {
  const existing = await prisma.branch.count();
  if (existing > 0 && !force) {
    console.log(`Database already has data (${existing} branches) - skipping seed. Use "npm run prisma:seed:reset" to wipe and reseed.`);
    return;
  }

  console.log('Clearing existing data...');
  await prisma.employeeDocument.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.branch.deleteMany();

  console.log('Creating branches...');
  const createdBranches = [];
  for (const b of branches) {
    createdBranches.push(await prisma.branch.create({ data: { ...b, status: 'Active' } }));
  }

  console.log('Creating employees and documents...');
  let docCount = 0;
  for (const [i, e] of employees.entries()) {
    const employee = await prisma.employee.create({
      data: {
        employeeNumber: `GF-${String(101 + i).padStart(5, '0')}`,
        firstName: e.first,
        lastName: e.last,
        email: `${e.first}.${e.last}@example.com`.toLowerCase(),
        phone: `+44 7700 900${String(100 + i * 37).slice(-3)}`,
        dateOfBirth: date(e.dob),
        address: `Flat ${i + 2}, ${10 + i * 7} Example Road, ${CITY[e.branch]}`,
        jobTitle: e.title,
        branchId: createdBranches[e.branch].id,
        employmentStatus: e.status,
        startDate: date(e.start),
        emergencyContactName: `${['Alex', 'Jordan', 'Sam', 'Taylor', 'Morgan', 'Casey'][i % 6]} ${e.last}`,
        emergencyContactPhone: `+44 7700 900${String(600 + i * 29).slice(-3)}`,
        notes: i === 0 ? 'Key holder. Responsible for weekly stock orders.' : null,
      },
    });

    for (const [j, [type, offset]] of e.docs.entries()) {
      const expiryDate = offset === null ? null : daysFromToday(offset);
      const issueDate = offset === null ? daysFromToday(-200 - i * 30) : daysFromToday(offset - 365 * 5);
      const number = documentNumber(type, i, j, e.last);
      const slug = type.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
      const pdf = samplePdf([
        `SAMPLE DOCUMENT - ${type}`,
        'Glamour Forever demo data - fictional, not a real document.',
        `Employee: ${e.first} ${e.last}`,
        `Reference: ${number || 'n/a'}`,
        `Expiry date: ${expiryDate ? expiryDate.toISOString().slice(0, 10) : 'No expiry'}`,
      ]);

      await prisma.employeeDocument.create({
        data: {
          employeeId: employee.id,
          documentType: type,
          documentNumber: number,
          issueDate,
          expiryDate,
          fileName: `${slug}-${e.last.toLowerCase()}.pdf`,
          mimeType: 'application/pdf',
          fileSize: pdf.length,
          fileData: pdf,
        },
      });
      docCount++;
    }
  }

  console.log(`Done: ${createdBranches.length} branches, ${employees.length} employees, ${docCount} documents.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

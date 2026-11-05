const path = require('path');
const express = require('express');
const multer = require('multer');
const {
  prisma, DOCUMENT_TYPES, EMPLOYMENT_STATUSES, DEFAULT_PHONE_CODE,
  clean, parseDate, isValidEmail, isValidPhone, phoneCode, toId, toIds, setFlash, documentStatus,
} = require('../helpers');

const router = express.Router();

// ============================================================================
// File storage
// Uploaded files are kept in memory by multer, then saved in the database
// (EmployeeDocument.fileData). This works on hosts without a persistent disk,
// such as Render's free tier. To move to S3/cloud storage later, change
// fileFields() and sendFile() below.
// ============================================================================
const MAX_FILE_SIZE_MB = 10;
const ALLOWED_FILES = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_FILES[ext] && ALLOWED_FILES[ext] === file.mimetype) return cb(null, true);
    cb(new Error('Only PDF, JPG, JPEG and PNG files are allowed.'));
  },
});

// Document fields to save for an uploaded file.
function fileFields(file) {
  return {
    fileName: clean(path.basename(file.originalname), 200),
    mimeType: ALLOWED_FILES[path.extname(file.originalname).toLowerCase()],
    fileSize: file.size,
    fileData: file.buffer,
  };
}

// Send a stored document file, inline (view in browser) or as a download.
async function sendFile(req, res, disposition) {
  const doc = await prisma.employeeDocument.findUnique({
    where: { id: req.document.id },
    select: { fileData: true, fileName: true, mimeType: true },
  });
  if (!doc.fileData) {
    setFlash(req, 'error', 'No file is attached to this document.');
    return res.redirect(`/employees/${req.employee.id}#documents`);
  }
  const name = doc.fileName || 'document';
  res.set({
    'Content-Type': doc.mimeType || 'application/octet-stream',
    'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`,
    'Cache-Control': 'private, no-store',
  });
  res.send(Buffer.from(doc.fileData));
}

// Run multer, but turn upload errors into a form error instead of a crash.
function handleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err) {
      req.uploadError = err.code === 'LIMIT_FILE_SIZE'
        ? `File is too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`
        : err.message;
    }
    next();
  });
}

// ============================================================================
// Shared helpers
// ============================================================================
function employeeNotFound(res) {
  return res.status(404).render('error', {
    title: 'Employee Not Found',
    message: 'This employee does not exist or may have been deleted.',
  });
}

function documentNotFound(res) {
  return res.status(404).render('error', {
    title: 'Document Not Found',
    message: 'This document does not exist or may have been deleted.',
  });
}

// Middleware: load the employee from :id or :employeeId into req.employee.
async function loadEmployee(req, res, next) {
  const id = toId(req.params.id || req.params.employeeId);
  const employee = id && await prisma.employee.findUnique({
    where: { id },
    include: { company: true, branches: { orderBy: { name: 'asc' } } },
  });
  if (!employee) return employeeNotFound(res);
  req.employee = employee;
  next();
}

// Middleware: load the document (which must belong to req.employee) into req.document.
async function loadDocument(req, res, next) {
  const id = toId(req.params.documentId);
  const document = id && await prisma.employeeDocument.findFirst({
    where: { id, employeeId: req.employee.id },
  });
  if (!document) return documentNotFound(res);
  req.document = document;
  next();
}

// Read + validate the employee form. Returns { data, branchIds, errors }.
// `data` holds the employee's own columns; `branchIds` are the selected branches (optional).
async function readEmployeeForm(body = {}) {
  const data = {
    firstName: clean(body.firstName, 80),
    lastName: clean(body.lastName, 80),
    employeeNumber: clean(body.employeeNumber, 40),
    email: clean(body.email, 160),
    phoneCountryCode: phoneCode(body.phoneCountryCode) || DEFAULT_PHONE_CODE,
    phone: clean(body.phone, 30),
    dateOfBirth: parseDate(body.dateOfBirth),
    address: clean(body.address, 255),
    jobTitle: clean(body.jobTitle, 80),
    companyId: toId(body.companyId),
    employmentStatus: EMPLOYMENT_STATUSES.includes(body.employmentStatus) ? body.employmentStatus : null,
    startDate: parseDate(body.startDate),
    emergencyContactName: clean(body.emergencyContactName, 120),
    emergencyContactPhoneCountryCode: phoneCode(body.emergencyContactPhoneCountryCode) || DEFAULT_PHONE_CODE,
    emergencyContactPhone: clean(body.emergencyContactPhone, 30),
    notes: clean(body.notes, 2000),
  };
  const branchIds = toIds(body.branchIds);

  const errors = [];
  if (!data.firstName) errors.push('First name is required.');
  if (!data.lastName) errors.push('Last name is required.');
  if (!data.employeeNumber) errors.push('Employee number is required.');
  if (!data.employmentStatus) errors.push('Employment status is required.');
  if (data.email && !isValidEmail(data.email)) errors.push('Email address is not valid.');
  if (data.phone && !isValidPhone(data.phone)) errors.push('Phone number may only contain digits, spaces, dashes and brackets.');
  if (data.emergencyContactPhone && !isValidPhone(data.emergencyContactPhone)) {
    errors.push('Emergency contact phone may only contain digits, spaces, dashes and brackets.');
  }
  if (body.dateOfBirth && !data.dateOfBirth) errors.push('Date of birth is not a valid date.');
  if (body.startDate && !data.startDate) errors.push('Start date is not a valid date.');
  if (!data.companyId) {
    errors.push('Company is required.');
  } else if (!(await prisma.company.findUnique({ where: { id: data.companyId } }))) {
    errors.push('Selected company does not exist.');
  }
  if (branchIds.length && (await prisma.branch.count({ where: { id: { in: branchIds } } })) !== branchIds.length) {
    errors.push('One or more selected branches do not exist.');
  }
  return { data, branchIds, errors };
}

// Read + validate the document form. Returns { data, errors }.
function readDocumentForm(body = {}) {
  const data = {
    documentType: DOCUMENT_TYPES.includes(body.documentType) ? body.documentType : null,
    documentNumber: clean(body.documentNumber, 80),
    issueDate: parseDate(body.issueDate),
    expiryDate: parseDate(body.expiryDate),
    notes: clean(body.notes, 2000),
  };
  const errors = [];
  if (!data.documentType) errors.push('Document type is required.');
  if (body.issueDate && !data.issueDate) errors.push('Issue date is not a valid date.');
  if (body.expiryDate && !data.expiryDate) errors.push('Expiry date is not a valid date.');
  if (data.issueDate && data.expiryDate && data.expiryDate < data.issueDate) {
    errors.push('Expiry date cannot be before the issue date.');
  }
  return { data, errors };
}

function isUniqueError(err) {
  return err && err.code === 'P2002';
}

// Suggest the next "GF-00000" style employee number for the new employee form.
async function nextEmployeeNumber() {
  const rows = await prisma.employee.findMany({ select: { employeeNumber: true } });
  const max = rows.reduce((m, r) => {
    const match = /^GF-(\d+)$/.exec(r.employeeNumber);
    return match ? Math.max(m, Number(match[1])) : m;
  }, 100);
  return `GF-${String(max + 1).padStart(5, '0')}`;
}

// Companies + branches for the employee form dropdown/checkboxes and list filters.
async function formOptions() {
  const [companies, branches] = await Promise.all([
    prisma.company.findMany({ orderBy: { name: 'asc' } }),
    prisma.branch.findMany({ orderBy: { name: 'asc' } }),
  ]);
  return { companies, branches };
}

// The phone country code is only kept when there is a number to go with it.
function withoutUnusedPhoneCodes(data) {
  return {
    ...data,
    phoneCountryCode: data.phone ? data.phoneCountryCode : null,
    emergencyContactPhoneCountryCode: data.emergencyContactPhone ? data.emergencyContactPhoneCountryCode : null,
  };
}

// ============================================================================
// Employees
// ============================================================================

// GET /employees?search=sarah&company=1&branch=1&status=Active
router.get('/', async (req, res) => {
  const search = clean(req.query.search, 100) || '';
  const companyId = toId(req.query.company);
  const branchId = toId(req.query.branch);
  const status = EMPLOYMENT_STATUSES.includes(req.query.status) ? req.query.status : '';

  const where = {};
  if (search) {
    // Every word must match name, employee number or email ("sarah smith" works).
    where.AND = search.split(/\s+/).map((word) => ({
      OR: [
        { firstName: { contains: word, mode: 'insensitive' } },
        { lastName: { contains: word, mode: 'insensitive' } },
        { employeeNumber: { contains: word, mode: 'insensitive' } },
        { email: { contains: word, mode: 'insensitive' } },
      ],
    }));
  }
  if (companyId) where.companyId = companyId;
  if (branchId) where.branches = { some: { id: branchId } };
  if (status) where.employmentStatus = status;

  const [employees, options, totalCount] = await Promise.all([
    prisma.employee.findMany({
      where,
      include: {
        company: true,
        branches: { orderBy: { name: 'asc' } },
        documents: { select: { expiryDate: true } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    }),
    formOptions(),
    prisma.employee.count(),
  ]);

  // Count documents needing attention per employee for the list badges.
  for (const e of employees) {
    const statuses = e.documents.map((d) => documentStatus(d.expiryDate).key);
    e.expiredCount = statuses.filter((s) => s === 'expired').length;
    e.attentionCount = statuses.filter((s) => s === 'urgent' || s === 'expiring').length;
  }

  res.render('employees/index', {
    title: 'Employees',
    employees,
    ...options,
    totalCount,
    filters: { search, company: companyId || '', branch: branchId || '', status },
  });
});

// GET /employees/new
router.get('/new', async (req, res) => {
  const options = await formOptions();
  const branchId = toId(req.query.branch);
  res.render('employees/new', {
    title: 'Add Employee',
    employee: {
      employeeNumber: await nextEmployeeNumber(),
      employmentStatus: 'Active',
      // Pre-select the company when one is passed in the URL or there is only one.
      companyId: toId(req.query.company) || (options.companies.length === 1 ? options.companies[0].id : null),
      branchIds: branchId ? [branchId] : [],
    },
    ...options,
    errors: [],
  });
});

// POST /employees
router.post('/', async (req, res) => {
  const { data, branchIds, errors } = await readEmployeeForm(req.body);
  const renderForm = async (errs) => res.status(400).render('employees/new', {
    title: 'Add Employee', employee: { ...data, branchIds }, ...(await formOptions()), errors: errs,
  });

  if (errors.length) return renderForm(errors);
  try {
    const employee = await prisma.employee.create({
      data: { ...withoutUnusedPhoneCodes(data), branches: { connect: branchIds.map((id) => ({ id })) } },
    });
    setFlash(req, 'success', 'Employee created successfully.');
    res.redirect(`/employees/${employee.id}`);
  } catch (err) {
    if (isUniqueError(err)) return renderForm([`Employee number ${data.employeeNumber} is already in use.`]);
    throw err;
  }
});

// GET /employees/:id
router.get('/:id', loadEmployee, async (req, res) => {
  const documents = await prisma.employeeDocument.findMany({
    where: { employeeId: req.employee.id },
    orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { documentType: 'asc' }],
  });
  res.render('employees/show', {
    title: `${req.employee.firstName} ${req.employee.lastName}`,
    employee: req.employee,
    documents,
  });
});

// GET /employees/:id/edit
router.get('/:id/edit', loadEmployee, async (req, res) => {
  res.render('employees/edit', {
    title: 'Edit Employee',
    employee: { ...req.employee, branchIds: req.employee.branches.map((b) => b.id) },
    ...(await formOptions()),
    errors: [],
  });
});

// POST /employees/:id/edit
router.post('/:id/edit', loadEmployee, async (req, res) => {
  const { id } = req.employee;
  const { data, branchIds, errors } = await readEmployeeForm(req.body);
  const renderForm = async (errs) => res.status(400).render('employees/edit', {
    title: 'Edit Employee', employee: { ...data, branchIds, id }, ...(await formOptions()), errors: errs,
  });

  if (errors.length) return renderForm(errors);
  try {
    await prisma.employee.update({
      where: { id },
      data: { ...withoutUnusedPhoneCodes(data), branches: { set: branchIds.map((branchId) => ({ id: branchId })) } },
    });
    setFlash(req, 'success', 'Employee updated successfully.');
    res.redirect(`/employees/${id}`);
  } catch (err) {
    if (isUniqueError(err)) return renderForm([`Employee number ${data.employeeNumber} is already in use.`]);
    throw err;
  }
});

// POST /employees/:id/delete - removes the employee, their documents and files
router.post('/:id/delete', loadEmployee, async (req, res) => {
  const { id, firstName, lastName } = req.employee;
  await prisma.employee.delete({ where: { id } }); // documents (and their files) cascade-delete
  setFlash(req, 'success', `${firstName} ${lastName} was deleted.`);
  res.redirect('/employees');
});

// ============================================================================
// Employee documents
// ============================================================================

// GET /employees/:id/documents/new
router.get('/:id/documents/new', loadEmployee, (req, res) => {
  res.render('documents/form', {
    title: 'Add Document',
    employee: req.employee,
    document: { documentType: DOCUMENT_TYPES.includes(req.query.type) ? req.query.type : '' },
    errors: [],
    maxFileSizeMb: MAX_FILE_SIZE_MB,
  });
});

// POST /employees/:id/documents
router.post('/:id/documents', loadEmployee, handleUpload, async (req, res) => {
  const { data, errors } = readDocumentForm(req.body);
  if (req.uploadError) errors.push(req.uploadError);

  if (errors.length) {
    return res.status(400).render('documents/form', {
      title: 'Add Document', employee: req.employee, document: data, errors, maxFileSizeMb: MAX_FILE_SIZE_MB,
    });
  }

  if (req.file) Object.assign(data, fileFields(req.file));
  await prisma.employeeDocument.create({ data: { ...data, employeeId: req.employee.id } });
  setFlash(req, 'success', req.file ? 'Document uploaded successfully.' : 'Document saved successfully.');
  res.redirect(`/employees/${req.employee.id}#documents`);
});

// GET /employees/:employeeId/documents/:documentId - open the file in the browser
router.get('/:employeeId/documents/:documentId', loadEmployee, loadDocument, (req, res) => {
  return sendFile(req, res, 'inline');
});

// GET /employees/:employeeId/documents/:documentId/download
router.get('/:employeeId/documents/:documentId/download', loadEmployee, loadDocument, (req, res) => {
  return sendFile(req, res, 'attachment');
});

// GET /employees/:employeeId/documents/:documentId/edit
router.get('/:employeeId/documents/:documentId/edit', loadEmployee, loadDocument, (req, res) => {
  res.render('documents/form', {
    title: 'Edit Document', employee: req.employee, document: req.document, errors: [], maxFileSizeMb: MAX_FILE_SIZE_MB,
  });
});

// POST /employees/:employeeId/documents/:documentId/edit - optionally replaces the file
router.post('/:employeeId/documents/:documentId/edit', loadEmployee, loadDocument, handleUpload, async (req, res) => {
  const existing = req.document;
  const { data, errors } = readDocumentForm(req.body);
  if (req.uploadError) errors.push(req.uploadError);

  if (errors.length) {
    return res.status(400).render('documents/form', {
      title: 'Edit Document',
      employee: req.employee,
      document: { ...data, id: existing.id, fileName: existing.fileName },
      errors,
      maxFileSizeMb: MAX_FILE_SIZE_MB,
    });
  }

  if (req.file) Object.assign(data, fileFields(req.file)); // replaces the old file
  await prisma.employeeDocument.update({ where: { id: existing.id }, data });

  setFlash(req, 'success', 'Document updated successfully.');
  res.redirect(`/employees/${req.employee.id}#documents`);
});

// POST /employees/:employeeId/documents/:documentId/delete
router.post('/:employeeId/documents/:documentId/delete', loadEmployee, loadDocument, async (req, res) => {
  await prisma.employeeDocument.delete({ where: { id: req.document.id } });
  setFlash(req, 'success', `${req.document.documentType} document deleted.`);
  res.redirect(`/employees/${req.employee.id}#documents`);
});

module.exports = router;

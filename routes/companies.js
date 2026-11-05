const express = require('express');
const { prisma, COMPANY_STATUSES, clean, isValidEmail, toId, setFlash } = require('../helpers');

const router = express.Router();

// Read + validate the company form. Returns { data, errors }.
function readCompanyForm(body = {}) {
  const data = {
    name: clean(body.name, 120),
    companyNumber: clean(body.companyNumber, 40),
    address: clean(body.address, 255),
    phone: clean(body.phone, 40),
    email: clean(body.email, 160),
    status: COMPANY_STATUSES.includes(body.status) ? body.status : 'Active',
  };
  const errors = [];
  if (!data.name) errors.push('Company name is required.');
  if (data.email && !isValidEmail(data.email)) errors.push('Email address is not valid.');
  return { data, errors };
}

function companyNotFound(res) {
  return res.status(404).render('error', {
    title: 'Company Not Found',
    message: 'This company does not exist or may have been deleted.',
  });
}

function findCompany(id) {
  return id && prisma.company.findUnique({
    where: { id },
    include: { _count: { select: { employees: true } } },
  });
}

// GET /companies
router.get('/', async (req, res) => {
  const companies = await prisma.company.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { employees: true } } },
  });
  res.render('companies/index', { title: 'Companies', companies });
});

// GET /companies/new
router.get('/new', (req, res) => {
  res.render('companies/new', { title: 'Add Company', company: { status: 'Active' }, errors: [] });
});

// POST /companies
router.post('/', async (req, res) => {
  const { data, errors } = readCompanyForm(req.body);
  if (errors.length) {
    return res.status(400).render('companies/new', { title: 'Add Company', company: data, errors });
  }
  await prisma.company.create({ data });
  setFlash(req, 'success', 'Company created successfully.');
  res.redirect('/companies');
});

// GET /companies/:id/edit
router.get('/:id/edit', async (req, res) => {
  const company = await findCompany(toId(req.params.id));
  if (!company) return companyNotFound(res);
  res.render('companies/edit', { title: 'Edit Company', company, errors: [] });
});

// POST /companies/:id/edit
router.post('/:id/edit', async (req, res) => {
  const existing = await findCompany(toId(req.params.id));
  if (!existing) return companyNotFound(res);

  const { data, errors } = readCompanyForm(req.body);
  if (errors.length) {
    return res.status(400).render('companies/edit', {
      title: 'Edit Company',
      company: { ...data, id: existing.id, _count: existing._count },
      errors,
    });
  }
  await prisma.company.update({ where: { id: existing.id }, data });
  setFlash(req, 'success', 'Company updated successfully.');
  res.redirect('/companies');
});

// POST /companies/:id/delete - only allowed when the company has no employees
router.post('/:id/delete', async (req, res) => {
  const company = await findCompany(toId(req.params.id));
  if (!company) return companyNotFound(res);

  if (company._count.employees > 0) {
    setFlash(req, 'error', `Unable to delete ${company.name}: move its ${company._count.employees} employee(s) to another company first.`);
    return res.redirect(`/companies/${company.id}/edit`);
  }
  await prisma.company.delete({ where: { id: company.id } });
  setFlash(req, 'success', 'Company deleted successfully.');
  res.redirect('/companies');
});

module.exports = router;

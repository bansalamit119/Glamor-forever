const express = require('express');
const { prisma, BRANCH_STATUSES, clean, toId, setFlash } = require('../helpers');

const router = express.Router();

// Read + validate the branch form. Returns { data, errors }.
function readBranchForm(body = {}) {
  const data = {
    name: clean(body.name, 120),
    region: clean(body.region, 80),
    address: clean(body.address, 255),
    phone: clean(body.phone, 40),
    status: BRANCH_STATUSES.includes(body.status) ? body.status : 'Active',
  };
  const errors = [];
  if (!data.name) errors.push('Branch name is required.');
  if (!data.region) errors.push('Region is required.');
  return { data, errors };
}

function branchNotFound(res) {
  return res.status(404).render('error', {
    title: 'Branch Not Found',
    message: 'This branch does not exist or may have been deleted.',
  });
}

// GET /branches
router.get('/', async (req, res) => {
  const branches = await prisma.branch.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { employees: true } } },
  });
  res.render('branches/index', { title: 'Branches', branches });
});

// GET /branches/new
router.get('/new', (req, res) => {
  res.render('branches/new', { title: 'Add Branch', branch: { status: 'Active' }, errors: [] });
});

// POST /branches
router.post('/', async (req, res) => {
  const { data, errors } = readBranchForm(req.body);
  if (errors.length) {
    return res.status(400).render('branches/new', { title: 'Add Branch', branch: data, errors });
  }
  await prisma.branch.create({ data });
  setFlash(req, 'success', 'Branch created successfully.');
  res.redirect('/branches');
});

// GET /branches/:id/edit
router.get('/:id/edit', async (req, res) => {
  const id = toId(req.params.id);
  const branch = id && await prisma.branch.findUnique({
    where: { id },
    include: { _count: { select: { employees: true } } },
  });
  if (!branch) return branchNotFound(res);
  res.render('branches/edit', { title: 'Edit Branch', branch, errors: [] });
});

// POST /branches/:id/edit
router.post('/:id/edit', async (req, res) => {
  const id = toId(req.params.id);
  const existing = id && await prisma.branch.findUnique({
    where: { id },
    include: { _count: { select: { employees: true } } },
  });
  if (!existing) return branchNotFound(res);

  const { data, errors } = readBranchForm(req.body);
  if (errors.length) {
    return res.status(400).render('branches/edit', {
      title: 'Edit Branch',
      branch: { ...data, id, _count: existing._count },
      errors,
    });
  }
  await prisma.branch.update({ where: { id }, data });
  setFlash(req, 'success', 'Branch updated successfully.');
  res.redirect('/branches');
});

// POST /branches/:id/delete - only allowed when the branch has no employees
router.post('/:id/delete', async (req, res) => {
  const id = toId(req.params.id);
  const branch = id && await prisma.branch.findUnique({
    where: { id },
    include: { _count: { select: { employees: true } } },
  });
  if (!branch) return branchNotFound(res);

  if (branch._count.employees > 0) {
    setFlash(req, 'error', `Unable to delete ${branch.name}: move or remove its ${branch._count.employees} employee(s) first.`);
    return res.redirect(`/branches/${id}/edit`);
  }
  await prisma.branch.delete({ where: { id } });
  setFlash(req, 'success', 'Branch deleted successfully.');
  res.redirect('/branches');
});

module.exports = router;

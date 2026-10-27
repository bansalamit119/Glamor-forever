const express = require('express');
const { prisma, today, addDays } = require('../helpers');

const router = express.Router();

router.get('/', async (req, res) => {
  const now = today();
  const in90Days = addDays(now, 90);
  const in30Days = addDays(now, 30);

  const [
    totalEmployees,
    activeEmployees,
    totalBranches,
    expiringSoon,
    urgent,
    expired,
    attentionDocuments,
    branches,
  ] = await Promise.all([
    prisma.employee.count(),
    prisma.employee.count({ where: { employmentStatus: 'Active' } }),
    prisma.branch.count(),
    // "Expiring soon" = expires within the next 90 days (includes urgent ones)
    prisma.employeeDocument.count({ where: { expiryDate: { gte: now, lte: in90Days } } }),
    prisma.employeeDocument.count({ where: { expiryDate: { gte: now, lte: in30Days } } }),
    prisma.employeeDocument.count({ where: { expiryDate: { lt: now } } }),
    // Documents requiring attention: expired or expiring within 90 days, soonest first
    prisma.employeeDocument.findMany({
      where: { expiryDate: { lte: in90Days } },
      include: { employee: { include: { branch: true } } },
      orderBy: { expiryDate: 'asc' },
      take: 10,
    }),
    prisma.branch.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { employees: true } } },
    }),
  ]);

  res.render('dashboard', {
    title: 'Dashboard',
    stats: { totalEmployees, activeEmployees, totalBranches, expiringSoon, urgent, expired },
    attentionDocuments,
    branches,
  });
});

module.exports = router;

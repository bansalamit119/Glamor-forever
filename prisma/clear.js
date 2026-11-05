// Deletes ALL data: every company, branch, employee and document (including uploaded files,
// which are stored in the database). Tables stay in place and IDs restart at 1.
//
//   npm run db:clear -- --yes
//
// Without --yes it only shows what would be deleted. Runs against whatever
// DATABASE_URL points to, so double-check the target before confirming.
require('dotenv').config({ quiet: true });

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const confirmed = process.argv.includes('--yes');

// Show host/database only, never the password.
function describeTarget() {
  try {
    const url = new URL(process.env.DATABASE_URL);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return '(DATABASE_URL not set or invalid)';
  }
}

async function main() {
  const [branches, employees, documents, companies] = await Promise.all([
    prisma.branch.count(),
    prisma.employee.count(),
    prisma.employeeDocument.count(),
    prisma.company.count(),
  ]);

  console.log(`Database: ${describeTarget()}`);
  console.log(`Found: ${companies} companies, ${branches} branches, ${employees} employees, ${documents} documents.`);

  if (!confirmed) {
    console.log('\nNothing deleted. Re-run with --yes to delete ALL of the above:');
    console.log('  npm run db:clear -- --yes');
    return;
  }

  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "EmployeeDocument", "Employee", "Branch", "Company" RESTART IDENTITY CASCADE'
  );
  console.log('All data deleted. Run "npm run prisma:seed" to load the demo data again.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

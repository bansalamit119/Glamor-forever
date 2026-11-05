-- Adds companies, makes employee branches many-to-many (and optional), and
-- splits phone country codes into their own columns.
-- Hand-written so EXISTING DATA IS KEPT:
--   * existing employees are assigned to a default company "Glamour Forever Ltd"
--   * each employee's current branch is copied into the new join table
--   * a leading "+44" is moved from phone numbers into the country-code columns

-- CreateTable
CREATE TABLE "Company" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "companyNumber" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_BranchToEmployee" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_BranchToEmployee_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_BranchToEmployee_B_index" ON "_BranchToEmployee"("B");

-- New employee columns (companyId starts nullable so existing rows can be filled)
ALTER TABLE "Employee"
ADD COLUMN "companyId" INTEGER,
ADD COLUMN "emergencyContactPhoneCountryCode" TEXT,
ADD COLUMN "phoneCountryCode" TEXT;

-- Data: default company for existing employees
INSERT INTO "Company" ("name", "status", "updatedAt")
SELECT 'Glamour Forever Ltd', 'Active', CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "Employee");

UPDATE "Employee" SET "companyId" = (SELECT MIN("id") FROM "Company");

-- Data: copy each employee's single branch into the join table (A = Branch, B = Employee)
INSERT INTO "_BranchToEmployee" ("A", "B")
SELECT "branchId", "id" FROM "Employee" WHERE "branchId" IS NOT NULL;

-- Data: split "+44 7700 900123" into "+44" and "7700 900123"
UPDATE "Employee"
SET "phoneCountryCode" = '+44', "phone" = regexp_replace("phone", '^\+44\s*', '')
WHERE "phone" LIKE '+44%';

UPDATE "Employee"
SET "emergencyContactPhoneCountryCode" = '+44',
    "emergencyContactPhone" = regexp_replace("emergencyContactPhone", '^\+44\s*', '')
WHERE "emergencyContactPhone" LIKE '+44%';

-- Now every employee has a company
ALTER TABLE "Employee" ALTER COLUMN "companyId" SET NOT NULL;

-- Drop the old single-branch column
ALTER TABLE "Employee" DROP CONSTRAINT "Employee_branchId_fkey";
ALTER TABLE "Employee" DROP COLUMN "branchId";

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BranchToEmployee" ADD CONSTRAINT "_BranchToEmployee_A_fkey" FOREIGN KEY ("A") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BranchToEmployee" ADD CONSTRAINT "_BranchToEmployee_B_fkey" FOREIGN KEY ("B") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

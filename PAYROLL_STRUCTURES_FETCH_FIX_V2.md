# EMS Payroll Structures Fetch Fix V2

## What this fixes

The latest EMS backend uses Express 5. Express 5 exposes `req.query` through a getter, so the payroll validator's `req[source] = result.data` assignment can throw when the structures list validates query parameters. Creating a structure uses `req.body`, so a structure can save successfully while fetching/listing fails with HTTP 500.

V2 stores parsed query parameters on `req.validatedQuery` and updates the payroll structures/periods controllers to consume them. It synchronizes the duplicate `payroll.validation.js` file with the active `payroll.validators.js`, and adds a regression test. No Prisma schema change is required.

## Apply

Extract this ZIP into the backend project root (the folder containing `package.json`), then run:

```bash
node scripts/apply-payroll-structures-fetch-flexibility-v2.mjs
node --check src/modules/payroll/payroll.validators.js
node --check src/modules/payroll/payroll.validation.js
node --check src/modules/payroll/payroll.controller.js
npm test -- tests/unit/payroll-structure-query-validation.test.js
npm test -- tests/unit/payroll-structure-validation.test.js
npm run prisma:validate
```

If those pass, deploy the backend to Render. The list request should return the saved tenant payroll structures rather than the Express query-assignment 500.

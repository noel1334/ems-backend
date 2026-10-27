# Finance: Payroll period management and payment distribution

## Period editing and deletion
- A period can be edited only while its status is `DRAFT` and it has no payroll items, disbursements, or payout batch.
- A period can be deleted only while its status is `DRAFT` and it has no payroll items, disbursements, or payout batch.
- Update/delete operations are tenant-scoped, permission-protected, transactional, and audit-logged.
- Processed payroll is deliberately protected to preserve the payroll audit trail. Use the existing correction workflow where eligible, or a documented adjustment in a later payroll.
- Routes: `PATCH /api/v1/payroll/periods/:id` and `DELETE /api/v1/payroll/periods/:id`.
- The seed permissions include `payroll:runs:DELETE`; the Payroll Officer template includes this permission.

## Payout distribution
After a finalized payroll's payment register is prepared, choose a provider and run **Preview & validate**. The distribution displays each pending employee, bank name, masked account suffix, net salary, estimated fee, and whether the employee is `VALID` or `BLOCKED`, including validation errors. The summary distinguishes eligible employees from those requiring attention and can export a CSV without exposing full account numbers.

## Validation
Run the backend unit tests and structural verification described in the release instructions. Keep `PAYROLL_PAYOUTS_ENABLED=false` until sandbox transfers and reconciliation have been verified.

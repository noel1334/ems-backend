# EMS Leave + Flexible Scheduling v3 (Backend)

This patch addresses two areas:

1. Leave request persistence. Unpaid leave no longer requires or consumes a paid leave balance. Paid leave continues to validate available entitlement. Request dates, duration and half-day period receive explicit validation and clearer errors. Approval, rejection, cancellation and editing keep paid balances consistent while unpaid requests avoid paid-balance ledger entries.
2. Flexible scheduling. Scheduling drafts are persisted by the existing generator, can be edited while they remain in DRAFT, and can then be approved or published. Draft assignment edits validate that the generation, employee assignment and selected active shifts belong to the requested company.

The platform routes are mounted on the existing platform router, which is protected by `authenticate` and `requireSuperAdmin`. Company routes continue using the tenant middleware and permission checks. No Prisma migration is required.

## Apply

Run `apply-leave-flex-scheduling-v3.mjs` from the backend repository root. The helper rewrites only the leave service and scheduling route wiring described in this patch, then removes its temporary patch assets so they are not accidentally committed. To reapply, extract the ZIP again.

After it runs, check the files with `node --check`. Existing local development has reported a `vitest: Permission denied` issue in Termux, so that test runner is not assumed to work. Review/deploy on Render after pushing. No claim is made that a live production request was executed by this patch.

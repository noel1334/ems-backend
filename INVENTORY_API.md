# EMS Inventory & Store API

Inventory is company-scoped and uses database transactions with PostgreSQL row locks.

## Core workflow

1. Store Keeper authenticates with the normal EMS access token.
2. Store Keeper scans/selects an employee biometric using `POST /api/v1/inventory/verify`.
3. The backend validates the provider-issued biometric reference against the employee's active biometric record and creates a short-lived, single-use verification reference.
4. `POST /api/v1/inventory/transactions` creates an ISSUE or RETURN in `PENDING_EMPLOYEE_CONFIRMATION` state. ISSUE quantities are reserved immediately so concurrent transactions cannot over-allocate stock.
5. The employee calls `/transactions/:id/confirm` or `/transactions/:id/dispute` using their authenticated employee account.
6. Only confirmation creates the immutable inventory ledger movement and changes physical quantity. A dispute releases any ISSUE reservation.

Raw fingerprint/face templates are not stored by the inventory module. The module stores only the biometric record ID, provider, verification method and an opaque verification reference.

## Tracking

- Inventory items: SKU, barcode, location, quantity, reserved quantity, minimum stock.
- Receipts: immutable `RECEIPT` ledger entries.
- Issues/returns: linked to employee, store keeper, biometric verification and transaction.
- Adjustments: `ADJUSTMENT`, `DAMAGE`, `LOSS` ledger entries.
- Ledger entries record balance before/after and a reference.
- All company access is tenant-scoped.

## Important production requirement

The biometric provider/device gateway remains responsible for the actual fingerprint/face matching. EMS only accepts a provider-issued verification reference. A production device integration should never send raw templates to the browser or store them in EMS.

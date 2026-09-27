# Stage 28 — Reporting & Exports

Adds tenant-scoped reporting APIs for employees, attendance, leave, payroll, and overtime.

Formats:
- JSON report data
- CSV download
- XLSX export via ExcelJS
- PDF export via PDFKit

Endpoints:
- GET /api/v1/reports/:type?format=json|csv
- GET /api/v1/reports/export/:type?format=xlsx|pdf

Supported types: employees, attendance, leave, payroll, overtime.

All reports require authentication and the `reports:reports:READ` permission; file exports require `reports:reports:EXPORT`. Results are tenant-scoped and capped at 10,000 rows per export to protect the API from unbounded memory usage.

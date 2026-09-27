# Stage 27 — Notifications & Alerts

Adds tenant-scoped in-app notifications with unread counts, read/read-all, deletion, filtering, pagination, and a reusable notification service for attendance, leave, payroll, scheduling, payments, biometrics, and security events.

The service is provider-neutral: email/push delivery can be added without changing the notification data model or API. No third-party email credential is required for the core stage.

## API
- GET `/api/v1/notifications`
- PATCH `/api/v1/notifications/:id/read`
- PATCH `/api/v1/notifications/read-all`
- DELETE `/api/v1/notifications/:id`

## Service integration
Import `createNotification` or `notifyUsers` from `src/modules/notifications/notification.service.js` from domain workflows. Always supply the authenticated tenant/company ID.

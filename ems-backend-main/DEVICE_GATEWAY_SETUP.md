# Stage 23 — Attendance Device Gateway

The EMS now supports a provider-neutral gateway for physical fingerprint/face attendance terminals.

## Admin device registration
Authenticated admin/HR calls:
`POST /api/v1/attendance-devices/register`

Payload example:
```json
{"name":"Main Gate Terminal","deviceId":"GATE-001","deviceType":"FACE_FINGERPRINT_TERMINAL"}
```
The response contains the device API key **once**. Store it securely on the gateway/terminal configuration.

## Device heartbeat
`GET /api/v1/attendance-devices/gateway/heartbeat`
Header: `X-Device-API-Key: <device-key>`

## Recognition event
`POST /api/v1/attendance-devices/gateway/events`
Header: `X-Device-API-Key: <device-key>`

Payload:
```json
{"type":"FACE","templateReference":"provider-subject-123","confidence":0.94,"action":"AUTO","occurredAt":"2026-09-20T09:30:00.000Z"}
```
Use `type: FINGERPRINT` for fingerprint terminals. `AUTO` checks out an open attendance record or checks in when none is open. Devices may explicitly send `CHECK_IN` or `CHECK_OUT`.

The device gateway is intentionally provider-neutral: the physical terminal/SDK performs biometric capture and matching, while EMS validates the device, tenant, biometric reference, employee, schedule and attendance rules.

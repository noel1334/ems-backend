# Stage 22 — Fingerprint Attendance

This stage adds a provider-neutral fingerprint enrollment and attendance API.

## Important hardware boundary

A normal web browser cannot directly read a fingerprint sensor. The scanner must be a supported attendance terminal/certified USB reader with a local SDK/bridge, or another device gateway that captures a fingerprint and produces a template/reference.

The EMS backend deliberately does **not** store raw fingerprint images/templates. The enrollment endpoint receives the captured template transiently, hashes it for duplicate protection, and stores only the hash plus the provider/device reference.

## Endpoints

`POST /api/v1/biometrics/fingerprint/enroll`

```json
{
  "employeeId": "employee-uuid",
  "deviceReference": "terminal-001",
  "templateBase64": "...",
  "templateReference": "provider-subject-123",
  "provider": "DEVICE_GATEWAY",
  "finger": "RIGHT_INDEX",
  "templateFormat": "ISO_19794_2",
  "qualityScore": 0.91
}
```

`POST /api/v1/biometrics/fingerprint/verify-and-attend`

```json
{
  "deviceReference": "terminal-001",
  "templateBase64": "...",
  "threshold": 0.80
}
```

The configured fingerprint gateway must return a provider match containing `matched: true` and the enrolled `templateReference`. The EMS then resolves that reference inside the current company/tenant and records attendance.

## Configuration

```env
FINGERPRINT_PROVIDER_URL=http://127.0.0.1:8081
FINGERPRINT_PROVIDER_API_KEY=change-me
FINGERPRINT_THRESHOLD=0.80
```

No paid fingerprint SaaS is required. A self-hosted/open-source gateway or the manufacturer's device SDK can implement the provider contract.

## Security

- Device must exist as an active `AttendanceDevice` for the company.
- Biometric records are tenant scoped.
- Active duplicate enrollment is rejected.
- A duplicate template hash within a company is rejected.
- Raw template bytes are not persisted by EMS.
- Provider API credentials stay on the backend.
- Every enrollment/attendance operation is audited.

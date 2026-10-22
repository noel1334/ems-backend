# EMS Face Recognition Setup (face-api.js)

EMS now uses `face-api.js` in the React browser for detection and descriptor generation. The Node.js backend compares the submitted 128-value descriptor only against active face enrollments for the authenticated tenant. CompreFace and its Docker service are no longer required by this integration.

## Render environment variables

Set the following variables on the EMS backend web service in Render:

- `BIOMETRIC_ENCRYPTION_KEY`: exactly 64 hexadecimal characters (32 random bytes). Generate in Termux with `openssl rand -hex 32`. Keep the value secret, do not commit it, and keep a secure backup. Losing this key means existing encrypted face descriptors cannot be decrypted.
- `FACE_API_DISTANCE_THRESHOLD`: start with `0.52` and tune using consented, representative tests. A lower face-api.js Euclidean distance indicates a closer match. Do not assume this value guarantees a particular false-match rate.

No Prisma migration is required: encrypted descriptors are stored in the existing `BiometricRecord.metadata` JSON field and the existing employee/company relations are reused.

## Security and operational notes

- Enrollment requires an explicit consent confirmation in the frontend. No camera images are sent to the backend or stored; only the numerical descriptor is sent over HTTPS and encrypted with AES-256-GCM before storage.
- The matching query is scoped by the backend-derived company ID and only reads active `face-api.js` records.
- `CHECK_IN` and `CHECK_OUT` are passed to the existing schedule-aware attendance service explicitly.
- Recognition itself is not liveness detection. A photograph/video replay or a modified browser can spoof client-generated descriptors. Use supervised pilot operation with a manual fallback; do not rely on this alone for access control, payroll disputes, or unattended security decisions.
- Face matching uses an older face-api.js release. Test camera compatibility and accuracy on the actual phones and lighting conditions before production use.

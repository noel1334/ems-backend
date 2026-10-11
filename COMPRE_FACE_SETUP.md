# Stage 21 — Facial Recognition Attendance

This stage uses **CompreFace**, a free/open-source facial-recognition REST API, instead of a paid cloud recognition API.

## Architecture

1. HR enrolls an employee's face through `POST /api/v1/biometrics/face/enroll`.
2. The backend sends the enrollment image to CompreFace.
3. CompreFace stores the face representation under a tenant-scoped subject.
4. EMS stores only the provider subject/reference in `BiometricRecord`.
5. At attendance, the camera/client sends a face image to `POST /api/v1/biometrics/face/recognize-and-attend`.
6. CompreFace returns candidate subjects and similarity.
7. EMS applies the configured threshold, verifies the subject belongs to the requesting company, validates the attendance device, and records attendance.

## Environment

```env
COMPRE_FACE_URL="http://localhost:8000"
COMPRE_FACE_API_KEY="your-recognition-service-api-key"
COMPRE_FACE_THRESHOLD=0.80
```

Never expose `COMPRE_FACE_API_KEY` to the frontend.

## Important

CompreFace is self-hosted/open-source; it is not a hosted unlimited free SaaS. The recognition service must run somewhere you control. This keeps the EMS backend independent of a paid recognition vendor.

The current API accepts JPEG/PNG/WebP images up to the existing upload limit. Raw face images are not stored in the EMS database.

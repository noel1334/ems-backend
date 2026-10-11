# Supabase Storage setup

This backend uses **Supabase Storage** as the default managed upload provider. It is not dependent on Cloudinary or ImageKit.

## Free plan

Supabase currently lists 1 GB Storage on the Free plan and a 50 MB maximum global file size on Free projects. Free-plan bandwidth and other quotas apply. Treat these as provider limits that can change over time.

## 1. Create a Supabase project

Create a project in Supabase and open **Storage**.

Create these private buckets:

- `employee-photos`
- `employee-documents`

Keep the buckets private. The backend uses the service-role key only on the server and generates short-lived signed URLs for application users.

## 2. Configure `.env`

```env
STORAGE_PROVIDER="supabase"
SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
SUPABASE_PHOTO_BUCKET="employee-photos"
SUPABASE_DOCUMENT_BUCKET="employee-documents"
SUPABASE_SIGNED_URL_TTL_SECONDS=900
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser or commit it to source control.

## 3. Existing employee APIs

The existing employee profile APIs continue to work:

- `POST /api/v1/employees/:id/documents`
- `GET /api/v1/employees/:id/documents`
- `DELETE /api/v1/employees/:id/documents/:documentId`
- `POST /api/v1/employees/:id/profile-photo`

Uploaded objects are namespaced by company and employee:

`companyId/employeeId/category/random-file-name.ext`

The database stores the provider/object key. The API returns a short-lived signed URL rather than exposing a private bucket publicly.

## 4. Local development fallback

If Supabase is not available yet, set:

```env
STORAGE_PROVIDER="local"
```

This keeps the existing local `uploads/` implementation available for development only. Production should use managed private storage.

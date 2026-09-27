import crypto from "node:crypto";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { env } from "../../config/env.js";
import AppError from "../errors/AppError.js";

const configured = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);

const client = configured
  ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

const assertConfigured = () => {
  if (!client) {
    throw new AppError(
      "Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      503,
      "STORAGE_NOT_CONFIGURED",
    );
  }
};

const safeExtension = (originalName = "") => {
  const ext = path.extname(originalName).toLowerCase();
  return /^[a-z0-9.]+$/.test(ext) ? ext : "";
};

const storagePath = ({ companyId, employeeId, category, originalName }) => {
  const ext = safeExtension(originalName);
  return `${companyId}/${employeeId}/${category}/${crypto.randomUUID()}${ext}`;
};

const bucketFor = (category) =>
  category === "profile-photo" ? env.SUPABASE_PHOTO_BUCKET : env.SUPABASE_DOCUMENT_BUCKET;

export const supabaseStorage = {
  async upload(file, { companyId, employeeId, category = "document" } = {}) {
    assertConfigured();
    if (!file?.buffer) throw new AppError("File content is required", 400, "FILE_REQUIRED");
    if (!companyId || !employeeId) throw new AppError("Tenant and employee are required", 400, "STORAGE_SCOPE_REQUIRED");

    const bucket = bucketFor(category);
    const objectPath = storagePath({ companyId, employeeId, category, originalName: file.originalname });
    const { error } = await client.storage.from(bucket).upload(objectPath, file.buffer, {
      contentType: file.mimetype,
      cacheControl: "3600",
      upsert: false,
    });
    if (error) throw new AppError(`Storage upload failed: ${error.message}`, 502, "STORAGE_UPLOAD_FAILED");

    return {
      fileName: file.originalname,
      storageKey: `${bucket}/${objectPath}`,
      fileUrl: `supabase://${bucket}/${objectPath}`,
      mimeType: file.mimetype,
      fileSize: file.size,
    };
  },

  async delete(storageKey) {
    assertConfigured();
    if (!storageKey) return;
    const [bucket, ...parts] = storageKey.split("/");
    if (!bucket || !parts.length) return;
    const { error } = await client.storage.from(bucket).remove([parts.join("/")]);
    if (error) throw new AppError(`Storage delete failed: ${error.message}`, 502, "STORAGE_DELETE_FAILED");
  },

  async signedUrl(storageKey, expiresIn = env.SUPABASE_SIGNED_URL_TTL_SECONDS) {
    assertConfigured();
    if (!storageKey) return null;
    const [bucket, ...parts] = storageKey.split("/");
    if (!bucket || !parts.length) return null;
    const { data, error } = await client.storage.from(bucket).createSignedUrl(parts.join("/"), expiresIn);
    if (error) throw new AppError(`Storage access URL failed: ${error.message}`, 502, "STORAGE_SIGNED_URL_FAILED");
    return data?.signedUrl ?? null;
  },
};

export const isSupabaseStorageConfigured = configured;

import AppError from "../../common/errors/AppError.js";
import { env } from "../../config/env.js";

const configured = Boolean(env.COMPRE_FACE_URL && env.COMPRE_FACE_API_KEY);

const assertConfigured = () => {
  if (!configured) {
    throw new AppError(
      "Facial recognition is not configured. Set COMPRE_FACE_URL and COMPRE_FACE_API_KEY.",
      503,
      "FACE_RECOGNITION_NOT_CONFIGURED",
    );
  }
};

const endpoint = (path) => `${env.COMPRE_FACE_URL.replace(/\/$/, "")}/api/v1/recognition${path}`;

const request = async (path, formData) => {
  assertConfigured();
  const response = await fetch(endpoint(path), {
    method: "POST",
    headers: { "x-api-key": env.COMPRE_FACE_API_KEY },
    body: formData,
  });

  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  if (!response.ok) {
    throw new AppError(
      data?.message || data?.error || "Facial recognition provider request failed",
      502,
      "FACE_RECOGNITION_PROVIDER_ERROR",
    );
  }
  return data;
};

export const enroll = async ({ subject, file }) => {
  const form = new FormData();
  form.append("file", new Blob([file.buffer], { type: file.mimetype }), file.originalname || "face.jpg");
  return request(`/faces?subject=${encodeURIComponent(subject)}`, form);
};

export const recognize = async ({ file }) => {
  const form = new FormData();
  form.append("file", new Blob([file.buffer], { type: file.mimetype }), file.originalname || "face.jpg");
  return request("/recognize", form);
};

export const isConfigured = () => configured;

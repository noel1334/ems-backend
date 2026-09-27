import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(5000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, "JWT_ACCESS_SECRET must contain at least 32 characters"),

  JWT_REFRESH_SECRET: z
    .string()
    .min(32, "JWT_REFRESH_SECRET must contain at least 32 characters"),

  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),

  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

  COOKIE_SECURE: z
    .string()
    .transform((value) => value.toLowerCase() === "true")
    .default("false"),

  COOKIE_SAME_SITE: z.enum(["strict", "lax", "none"]).default("lax"),

  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  REQUIRE_HTTPS: z.string().transform((value) => value.toLowerCase() === "true").default("false"),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),

  MAX_FILE_SIZE: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 1024 * 1024),

  APP_BASE_URL: z.string().url().default("http://localhost:5000"),
  STORAGE_PROVIDER: z.enum(["supabase", "local"]).default("supabase"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_PHOTO_BUCKET: z.string().min(1).default("employee-photos"),
  SUPABASE_DOCUMENT_BUCKET: z.string().min(1).default("employee-documents"),
  SUPABASE_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().max(86400).default(900),
  COMPRE_FACE_URL: z.string().url().optional(),
  COMPRE_FACE_API_KEY: z.string().min(1).optional(),
  COMPRE_FACE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.80),
  FINGERPRINT_PROVIDER_URL: z.string().url().optional(),
  FINGERPRINT_PROVIDER_API_KEY: z.string().min(1).optional(),
  FINGERPRINT_THRESHOLD: z.coerce.number().min(0).max(1).default(0.80),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_PUBLIC_KEY: z.string().optional(),
  PAYSTACK_BASE_URL: z.string().url().default("https://api.paystack.co"),
  FLUTTERWAVE_SECRET_KEY: z.string().optional(),
  FLUTTERWAVE_PUBLIC_KEY: z.string().optional(),
  FLUTTERWAVE_WEBHOOK_HASH: z.string().optional(),
  FLUTTERWAVE_BASE_URL: z.string().url().default("https://api.flutterwave.com/v3"),
});

const parsedEnv = envSchema.superRefine((value, ctx) => {
  if (value.NODE_ENV === "production") {
    if (!value.COOKIE_SECURE) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["COOKIE_SECURE"], message: "COOKIE_SECURE must be true in production" });
    if (value.CORS_ORIGIN.includes("*")) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["CORS_ORIGIN"], message: "Wildcard CORS is not allowed in production" });
    if (value.REQUIRE_HTTPS && value.APP_BASE_URL.startsWith("http://")) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["APP_BASE_URL"], message: "APP_BASE_URL must use HTTPS in production" });
    if (!value.SUPABASE_SERVICE_ROLE_KEY && value.STORAGE_PROVIDER === "supabase") ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["SUPABASE_SERVICE_ROLE_KEY"], message: "Supabase service role key is required when using Supabase storage" });
  }
}).safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ Invalid environment configuration:");

  console.error(parsedEnv.error.flatten().fieldErrors);

  process.exit(1);
}

export const env = parsedEnv.data;

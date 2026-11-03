import { z } from "zod";

const uuid = z.string().uuid();

export const registerSchema = z.object({
  employeeId: uuid,
  type: z.enum(["FINGERPRINT", "FACE", "IRIS", "PALM", "OTHER"]),
  provider: z.string().trim().max(100).optional().nullable(),
  templateReference: z.string().trim().min(1).max(255).optional().nullable(),
  templateHash: z.string().trim().min(1).max(255).optional().nullable(),
  deviceReference: z.string().trim().max(255).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const idSchema = z.object({ id: uuid });

export const verifySchema = z.object({
  templateReference: z.string().trim().min(1).max(255),
  type: z.enum(["FINGERPRINT", "FACE", "IRIS", "PALM", "OTHER"]).optional(),
  deviceReference: z.string().trim().max(255).optional().nullable(),
});

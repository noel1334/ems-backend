import { z } from "zod";

const uuid = z.string().uuid();
const base64 = z.string().min(16).max(10_000_000);

export const enrollSchema = z.object({
  employeeId: uuid,
  deviceReference: z.string().trim().min(1).max(255),
  templateBase64: base64,
  templateReference: z.string().trim().min(1).max(255),
  provider: z.string().trim().max(100).optional().nullable(),
  finger: z.enum(["LEFT_THUMB", "LEFT_INDEX", "LEFT_MIDDLE", "LEFT_RING", "LEFT_LITTLE", "RIGHT_THUMB", "RIGHT_INDEX", "RIGHT_MIDDLE", "RIGHT_RING", "RIGHT_LITTLE"]).optional(),
  templateFormat: z.string().trim().max(100).default("ISO_19794_2"),
  qualityScore: z.number().min(0).max(1).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const verifyAndAttendSchema = z.object({
  deviceReference: z.string().trim().min(1).max(255),
  templateBase64: base64,
  threshold: z.number().min(0).max(1).optional(),
  occurredAt: z.string().datetime().optional(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
});

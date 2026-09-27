import { z } from "zod";

const optionalString = z.string().trim().min(1).optional().nullable();

export const createCompanySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Company name must contain at least 2 characters")
    .max(150, "Company name cannot exceed 150 characters"),

  legalName: z.string().trim().max(200).optional().nullable(),

  slug: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug may contain lowercase letters, numbers and hyphens only"
    ),

  email: z.string().trim().email("Invalid company email address").max(255),

  phone: optionalString,

  address: optionalString,

  city: optionalString,

  state: optionalString,

  country: z.string().trim().min(2).max(100).default("Nigeria"),

  timezone: z.string().trim().min(1).default("Africa/Lagos"),

  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase())
    .default("NGN"),
});

export const updateCompanySchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),

  legalName: optionalString,

  email: z.string().trim().email().max(255).optional(),

  phone: optionalString,

  address: optionalString,

  city: optionalString,

  state: optionalString,

  country: z.string().trim().min(2).max(100).optional(),

  timezone: z.string().trim().min(1).optional(),

  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase())
    .optional(),
});

export const updateCompanyStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "INACTIVE"]),
});

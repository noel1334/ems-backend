import { z } from "zod";

export const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(160),
  industry: z.enum(["HEALTHCARE", "MANUFACTURING", "EDUCATION", "CONSTRUCTION", "HOSPITALITY", "RETAIL", "LOGISTICS", "FINANCE", "AGRICULTURE", "TECHNOLOGY", "ENERGY", "REAL_ESTATE", "TELECOMMUNICATIONS", "MEDIA", "SECURITY", "MINING", "UTILITIES", "GOVERNMENT", "NGO", "PROFESSIONAL_SERVICES", "CORPORATE", "OTHER"]).default("CORPORATE"),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  country: z.string().trim().max(80).default("Nigeria"),
  timezone: z.string().trim().max(80).default("Africa/Lagos"),
  currency: z.string().trim().length(3).default("NGN"),
  plan: z.enum(["FREE", "STARTER", "PROFESSIONAL", "ENTERPRISE"]).default("FREE"),
  admin: z.object({
    email: z.string().trim().email().transform((value) => value.toLowerCase()),
    password: z.string().min(10).max(100),
    firstName: z.string().trim().min(2).max(80),
    lastName: z.string().trim().min(2).max(80),
  }),
});

export const updateTenantSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  industry: z.enum(["HEALTHCARE", "MANUFACTURING", "EDUCATION", "CONSTRUCTION", "HOSPITALITY", "RETAIL", "LOGISTICS", "FINANCE", "AGRICULTURE", "TECHNOLOGY", "ENERGY", "REAL_ESTATE", "TELECOMMUNICATIONS", "MEDIA", "SECURITY", "MINING", "UTILITIES", "GOVERNMENT", "NGO", "PROFESSIONAL_SERVICES", "CORPORATE", "OTHER"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "INACTIVE"]).optional(),
  plan: z.enum(["FREE", "STARTER", "PROFESSIONAL", "ENTERPRISE"]).optional(),
  isSubscriptionActive: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0);

export const createPlatformUserSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(255).transform((value) => value.toLowerCase()),
  password: z.string().min(8, "Password must contain at least 8 characters").max(128),
  firstName: z.string().trim().min(2).max(100),
  lastName: z.string().trim().min(2).max(100),
  middleName: z.string().trim().max(100).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  jobTitle: z.string().trim().max(150).optional().nullable(),
  employeeType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN", "TEMPORARY"]).optional().default("FULL_TIME"),
  departmentId: z.string().uuid().optional().nullable(),
  designationId: z.string().uuid().optional().nullable(),
  roleIds: z.array(z.string().uuid()).min(1, "Select at least one company role").max(20)
    .refine((ids) => new Set(ids).size === ids.length, "Role selections must be unique"),
});


export const updatePlatformUserSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED", "LOCKED"]),
});

export const assignPlatformUserRolesSchema = z.object({
  roleIds: z.array(z.string().uuid()).min(1, "Select at least one company role").max(20)
    .refine((ids) => new Set(ids).size === ids.length, "Role selections must be unique"),
});


const tenantRoleNameSchema = z.string().trim().min(2, "Role name must contain at least 2 characters").max(100).regex(/^[A-Za-z0-9 _-]+$/, "Role name may contain letters, numbers, spaces, underscores and hyphens only");
const permissionIdsSchema = z.array(z.string().uuid()).max(200).default([]).refine((ids) => new Set(ids).size === ids.length, "Permission selections must be unique");

export const createTenantRoleSchema = z.object({
  name: tenantRoleNameSchema,
  description: z.string().trim().max(500).optional().nullable(),
  permissionIds: permissionIdsSchema,
  sourceTemplateId: z.string().uuid().optional().nullable(),
});

export const updateTenantRoleSchema = z.object({
  name: tenantRoleNameSchema.optional(),
  description: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
  permissionIds: z.array(z.string().uuid()).max(200).optional().refine((ids) => ids === undefined || new Set(ids).size === ids.length, "Permission selections must be unique"),
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const platformPermissionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(200),
  module: z.string().trim().max(100).optional(),
  search: z.string().trim().max(100).optional(),
});

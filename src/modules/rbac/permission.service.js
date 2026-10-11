import prisma from "../../config/database.js";

export const listPermissions = async ({ module, resource, action, search, page = 1, limit = 50 } = {}) => {
  const where = {
    isActive: true,
    ...(module ? { module } : {}),
    ...(resource ? { resource } : {}),
    ...(action ? { action } : {}),
    ...(search ? { OR: [{ module: { contains: search, mode: "insensitive" } }, { resource: { contains: search, mode: "insensitive" } }, { description: { contains: search, mode: "insensitive" } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.permission.findMany({ where, orderBy: [{ module: "asc" }, { resource: "asc" }, { action: "asc" }], skip: (page - 1) * limit, take: limit }),
    prisma.permission.count({ where }),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const getPermission = (id) => prisma.permission.findUnique({ where: { id } });

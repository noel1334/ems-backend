import prisma from "../../config/database.js";

const roleInclude = {
    permissions: {
        include: {
            permission: true
        }
    },
    users: {
        include: {
            user: true
        }
    }
};

const userInclude = {
    roles: {
        include: {
            role: true
        }
    },
    company: true
};

export const findUserById = async (
    userId,
    tx = prisma
) =>
    tx.user.findUnique({
        where: { id: userId },
        include: userInclude
    });

export const findUserByEmail = async (
    email,
    tx = prisma
) =>
    tx.user.findFirst({
        where: {
            email: email.toLowerCase()
        },
        include: userInclude
    });

export const findUserByIdAndCompany = async (
    userId,
    companyId,
    tx = prisma
) =>
    tx.user.findFirst({
        where: {
            id: userId,
            companyId
        },
        include: userInclude
    });

export const listUsers = async (
    {
        companyId,
        search,
        status,
        skip,
        take
    },
    tx = prisma
) => {
    const where = {
        companyId,
        ...(status ? { status } : {}),
        ...(search
            ? {
                  OR: [
                      {
                          firstName: {
                              contains: search,
                              mode: "insensitive"
                          }
                      },
                      {
                          lastName: {
                              contains: search,
                              mode: "insensitive"
                          }
                      },
                      {
                          email: {
                              contains: search,
                              mode: "insensitive"
                          }
                      },
                      {
                          phone: {
                              contains: search,
                              mode: "insensitive"
                          }
                      }
                  ]
              }
            : {})
    };

    const [users, total] = await Promise.all([
        tx.user.findMany({
            where,
            include: userInclude,
            orderBy: {
                createdAt: "desc"
            },
            skip,
            take
        }),
        tx.user.count({ where })
    ]);

    return {
        users,
        total
    };
};

export const createUser = async (
    data,
    tx = prisma
) =>
    tx.user.create({
        data,
        include: userInclude
    });

export const updateUser = async (
    userId,
    data,
    tx = prisma
) =>
    tx.user.update({
        where: { id: userId },
        data,
        include: userInclude
    });

export const deleteUser = async (
    userId,
    tx = prisma
) =>
    tx.user.delete({
        where: { id: userId }
    });

export const findRolesByIds = async (
    roleIds,
    companyId,
    tx = prisma
) =>
    tx.role.findMany({
        where: {
            id: {
                in: roleIds
            },
            isActive: true,
            OR: [
                { companyId },
                {
                    companyId: null,
                    scope: "SYSTEM"
                }
            ]
        }
    });

export const findRoleById = async (
    roleId,
    companyId,
    tx = prisma
) =>
    tx.role.findFirst({
        where: {
            id: roleId,
            OR: [
                { companyId },
                {
                    companyId: null,
                    scope: "SYSTEM"
                }
            ]
        },
        include: roleInclude
    });

export const findCompanyRoleByName = async (
    name,
    companyId,
    tx = prisma
) =>
    tx.role.findFirst({
        where: {
            companyId,
            name
        }
    });

export const createRole = async (
    data,
    tx = prisma
) =>
    tx.role.create({
        data
    });

export const updateRole = async (
    roleId,
    data,
    tx = prisma
) =>
    tx.role.update({
        where: {
            id: roleId
        },
        data,
        include: roleInclude
    });

export const listRoles = async (
    {
        companyId,
        page,
        limit,
        search,
        scope
    },
    tx = prisma
) => {
    const where = {
        OR: [
            {
                companyId
            },
            {
                companyId: null,
                scope: "SYSTEM"
            }
        ],
        ...(search
            ? {
                  name: {
                      contains: search,
                      mode: "insensitive"
                  }
              }
            : {}),
        ...(scope ? { scope } : {})
    };

    const [roles, total] = await Promise.all([
        tx.role.findMany({
            where,
            include: roleInclude,
            orderBy: [
                {
                    isSystem: "desc"
                },
                {
                    name: "asc"
                }
            ],
            skip: (page - 1) * limit,
            take: limit
        }),
        tx.role.count({ where })
    ]);

    return {
        roles,
        total
    };
};

export const createRolePermissions = async (
    data,
    tx = prisma
) =>
    tx.rolePermission.createMany({
        data,
        skipDuplicates: true
    });

export const deleteRolePermissions = async (
    roleId,
    tx = prisma
) =>
    tx.rolePermission.deleteMany({
        where: {
            roleId
        }
    });

export const findPermissionsByIds = async (
    permissionIds,
    tx = prisma
) =>
    tx.permission.findMany({
        where: {
            id: {
                in: permissionIds
            },
            isActive: true
        }
    });

export const listPermissions = async (
    {
        module,
        action,
        search,
        page,
        limit
    },
    tx = prisma
) => {
    const where = {
        isActive: true,
        ...(module ? { module } : {}),
        ...(action ? { action } : {}),
        ...(search
            ? {
                  OR: [
                      {
                          module: {
                              contains: search,
                              mode: "insensitive"
                          }
                      },
                      {
                          resource: {
                              contains: search,
                              mode: "insensitive"
                          }
                      },
                      {
                          description: {
                              contains: search,
                              mode: "insensitive"
                          }
                      }
                  ]
              }
            : {})
    };

    const [permissions, total] = await Promise.all([
        tx.permission.findMany({
            where,
            orderBy: [
                {
                    module: "asc"
                },
                {
                    resource: "asc"
                },
                {
                    action: "asc"
                }
            ],
            skip: (page - 1) * limit,
            take: limit
        }),
        tx.permission.count({ where })
    ]);

    return {
        permissions,
        total
    };
};

export const findRoleUsers = async (
    roleId,
    tx = prisma
) =>
    tx.userRole.findMany({
        where: {
            roleId
        },
        include: {
            user: {
                include: {
                    company: true
                }
            }
        },
        orderBy: {
            assignedAt: "desc"
        }
    });

export const deleteUserRoles = async (
    userId,
    tx = prisma
) =>
    tx.userRole.deleteMany({
        where: {
            userId
        }
    });

export const createUserRole = async (
    data,
    tx = prisma
) =>
    tx.userRole.create({
        data
    });

export const createManyUserRoles = async (
    data,
    tx = prisma
) =>
    tx.userRole.createMany({
        data,
        skipDuplicates: true
    });

export const findUserRole = async (
    userId,
    roleId,
    tx = prisma
) =>
    tx.userRole.findUnique({
        where: {
            userId_roleId: {
                userId,
                roleId
            }
        }
    });

export const deleteUserRole = async (
    userId,
    roleId,
    tx = prisma
) =>
    tx.userRole.delete({
        where: {
            userId_roleId: {
                userId,
                roleId
            }
        }
    });

export const revokeUserSessions = async (
    userId,
    tx = prisma
) =>
    tx.userSession.updateMany({
        where: {
            userId,
            status: "ACTIVE"
        },
        data: {
            status: "REVOKED",
            revokedAt: new Date()
        }
    });

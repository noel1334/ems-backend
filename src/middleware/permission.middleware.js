import { AppError } from "../common/errors/AppError.js";
import prisma from "../config/database.js";

export const requirePermission = (
    moduleName,
    resource,
    action
) => {
    return async (req, res, next) => {
        try {
            if (!req.user?.userId) {
                throw new AppError(
                    "Authentication required",
                    401,
                    "AUTHENTICATION_REQUIRED"
                );
            }

            const user = await prisma.user.findUnique({
                where: {
                    id: req.user.userId
                },
                select: {
                    id: true,
                    companyId: true,
                    status: true,
                    roles: {
                        where: {
                            role: {
                                isActive: true
                            }
                        },
                        include: {
                            role: {
                                include: {
                                    permissions: {
                                        include: {
                                            permission: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });

            if (!user) {
                throw new AppError(
                    "User not found",
                    401,
                    "USER_NOT_FOUND"
                );
            }

            if (user.status !== "ACTIVE") {
                throw new AppError(
                    "User account is not active",
                    403,
                    "ACCOUNT_NOT_ACTIVE"
                );
            }

            /*
                   * A company user must belong to the current tenant.
                          */
            if (
                req.tenant?.id &&
                user.companyId !== req.tenant.id
            ) {
                throw new AppError(
                    "User does not belong to this company",
                    403,
                    "TENANT_ACCESS_DENIED"
                );
            }

            /*
                   * SUPER_ADMIN is allowed to bypass normal
                          * company permissions.
                                 *
                                        * Tenant-sensitive operations still need to
                                               * explicitly decide whether SUPER_ADMIN access
                                                      * is appropriate.
                                                             */
            const hasSuperAdminRole =
                user.roles.some(
                    (userRole) =>
                        userRole.role.name ===
                        "SUPER_ADMIN"
                );

            if (hasSuperAdminRole) {
                req.permission = {
                    module: moduleName,
                    resource,
                    action,
                    grantedBy: "SUPER_ADMIN"
                };

                return next();
            }

            const hasPermission =
                user.roles.some((userRole) =>
                    userRole.role.permissions.some(
                        (rolePermission) => {
                            const permission =
                                rolePermission.permission;

                            return (
                                permission.module ===
                                moduleName &&
                                permission.resource ===
                                resource &&
                                permission.action ===
                                action &&
                                permission.isActive
                            );
                        }
                    )
                );

            if (!hasPermission) {
                throw new AppError(
                    `Permission denied: ${moduleName}.${resource}.${action}`,
                    403,
                    "PERMISSION_DENIED"
                );
            }

            req.permission = {
                module: moduleName,
                resource,
                action,
                grantedBy: "ROLE"
            };

            return next();
        } catch (error) {
            return next(error);
        }
    };
};
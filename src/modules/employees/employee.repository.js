import prisma from "../../config/database.js";

const employeeInclude = {
    department: {
        select: {
            id: true,
            name: true,
            code: true
        }
    },

    designation: {
        select: {
            id: true,
            name: true,
            code: true
        }
    },

    manager: {
        select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true
        }
    }
};

export const createEmployee = async (data, tx = prisma) => {
    return tx.employee.create({
        data,
        include: employeeInclude
    });
};

export const findEmployeeById = async (
    employeeId,
    companyId,
    tx = prisma
) => {
    return tx.employee.findFirst({
        where: {
            id: employeeId,
            companyId
        },
        include: employeeInclude
    });
};

export const findEmployeeByNumber = async (
    employeeNumber,
    companyId,
    tx = prisma
) => {
    return tx.employee.findFirst({
        where: {
            employeeNumber,
            companyId
        }
    });
};

export const findEmployeeByEmail = async (
    email,
    companyId,
    tx = prisma
) => {
    return tx.employee.findFirst({
        where: {
            email,
            companyId
        }
    });
};

export const findDepartmentById = async (
    departmentId,
    companyId,
    tx = prisma
) => {
    return tx.department.findFirst({
        where: {
            id: departmentId,
            companyId
        }
    });
};

export const findDesignationById = async (
    designationId,
    companyId,
    tx = prisma
) => {
    return tx.designation.findFirst({
        where: {
            id: designationId,
            companyId
        }
    });
};

export const findManagerById = async (
    managerId,
    companyId,
    tx = prisma
) => {
    return tx.employee.findFirst({
        where: {
            id: managerId,
            companyId
        }
    });
};

export const listEmployees = async ({
    companyId,
    page,
    limit,
    search,
    departmentId,
    designationId,
    employeeType,
    employmentStatus
}) => {
    const skip = (page - 1) * limit;

    const where = {
        companyId
    };

    if (departmentId) {
        where.departmentId = departmentId;
    }

    if (designationId) {
        where.designationId = designationId;
    }

    if (employeeType) {
        where.employeeType = employeeType;
    }

    if (employmentStatus) {
        where.employmentStatus = employmentStatus;
    }

    if (search) {
        where.OR = [
            {
                employeeNumber: {
                    contains: search,
                    mode: "insensitive"
                }
            },
            {
                firstName: {
                    contains: search,
                    mode: "insensitive"
                }
            },
            {
                middleName: {
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
        ];
    }

    const [items, total] = await Promise.all([
        prisma.employee.findMany({
            where,
            skip,
            take: limit,
            include: employeeInclude,
            orderBy: {
                createdAt: "desc"
            }
        }),

        prisma.employee.count({
            where
        })
    ]);

    return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
    };
};

export const updateEmployee = async (
    employeeId,
    companyId,
    data,
    tx = prisma
) => {
    return tx.employee.updateMany({
        where: {
            id: employeeId,
            companyId
        },
        data
    });
};

export const getUpdatedEmployee = async (
    employeeId,
    companyId,
    tx = prisma
) => {
    return tx.employee.findFirst({
        where: {
            id: employeeId,
            companyId
        },
        include: employeeInclude
    });
};

export const deleteEmployee = async (
    employeeId,
    companyId,
    tx = prisma
) => {
    return tx.employee.deleteMany({
        where: {
            id: employeeId,
            companyId
        }
    });
};

export const countEmployees = async (
    companyId,
    tx = prisma
) => {
    return tx.employee.count({
        where: {
            companyId
        }
    });
};
import prisma from "../../config/database.js";

export const createDepartment = async (data, tx = prisma) => {
    return tx.department.create({
        data,

        include: {
            _count: {
                select: {
                    designations: true,
                    employees: true
                }
            }
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
        },

        include: {
            _count: {
                select: {
                    designations: true,
                    employees: true
                }
            }
        }
    });
};

export const findDepartmentByName = async (
    name,
    companyId,
    tx = prisma
) => {
    return tx.department.findFirst({
        where: {
            companyId,
            name: {
                equals: name,
                mode: "insensitive"
            }
        }
    });
};

export const findDepartmentByCode = async (
    code,
    companyId,
    tx = prisma
) => {
    return tx.department.findFirst({
        where: {
            companyId,
            code: {
                equals: code,
                mode: "insensitive"
            }
        }
    });
};

export const listDepartments = async (
    {
        companyId,
        search,
        isActive,
        skip,
        take
    },
    tx = prisma
) => {
    const where = {
        companyId
    };

    if (typeof isActive === "boolean") {
        where.isActive = isActive;
    }

    if (search) {
        where.OR = [
            {
                name: {
                    contains: search,
                    mode: "insensitive"
                }
            },
            {
                code: {
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
        ];
    }

    const [items, total] = await Promise.all([
        tx.department.findMany({
            where,
            skip,
            take,
            orderBy: {
                name: "asc"
            },
            include: {
                _count: {
                    select: {
                        designations: true,
                        employees: true
                    }
                }
            }
        }),

        tx.department.count({
            where
        })
    ]);

    return {
        items,
        total
    };
};

export const updateDepartment = async (
    departmentId,
    companyId,
    data,
    tx = prisma
) => {
    return tx.department.updateMany({
        where: {
            id: departmentId,
            companyId
        },
        data
    });
};

export const getUpdatedDepartment = async (
    departmentId,
    companyId,
    tx = prisma
) => {
    return findDepartmentById(
        departmentId,
        companyId,
        tx
    );
};

export const deleteDepartment = async (
    departmentId,
    companyId,
    tx = prisma
) => {
    return tx.department.deleteMany({
        where: {
            id: departmentId,
            companyId
        }
    });
};
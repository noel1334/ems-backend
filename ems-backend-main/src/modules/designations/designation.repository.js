import prisma from "../../config/database.js";

const designationInclude = {
    department: {
        select: {
            id: true,
            name: true,
            code: true
        }
    },

    _count: {
        select: {
            employees: true
        }
    }
};

export const createDesignation = async (
    data,
    tx = prisma
) => {
    return tx.designation.create({
        data,
        include: designationInclude
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
        },
        include: designationInclude
    });
};

export const findDesignationByName = async (
    name,
    companyId,
    tx = prisma
) => {
    return tx.designation.findFirst({
        where: {
            companyId,
            name: {
                equals: name,
                mode: "insensitive"
            }
        }
    });
};

export const findDesignationByCode = async (
    code,
    companyId,
    tx = prisma
) => {
    return tx.designation.findFirst({
        where: {
            companyId,
            code: {
                equals: code,
                mode: "insensitive"
            }
        }
    });
};

export const findDepartmentForCompany = async (
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

export const listDesignations = async (
    {
        companyId,
        search,
        departmentId,
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

    if (departmentId) {
        where.departmentId = departmentId;
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
        tx.designation.findMany({
            where,
            skip,
            take,
            orderBy: {
                name: "asc"
            },
            include: designationInclude
        }),

        tx.designation.count({
            where
        })
    ]);

    return {
        items,
        total
    };
};

export const updateDesignation = async (
    designationId,
    companyId,
    data,
    tx = prisma
) => {
    return tx.designation.updateMany({
        where: {
            id: designationId,
            companyId
        },
        data
    });
};

export const getUpdatedDesignation = async (
    designationId,
    companyId,
    tx = prisma
) => {
    return findDesignationById(
        designationId,
        companyId,
        tx
    );
};

export const deleteDesignation = async (
    designationId,
    companyId,
    tx = prisma
) => {
    return tx.designation.deleteMany({
        where: {
            id: designationId,
            companyId
        }
    });
};
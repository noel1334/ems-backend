export const mapDesignation = (designation) => {
    if (!designation) {
        return null;
    }

    return {
        id: designation.id,
        companyId: designation.companyId,

        name: designation.name,
        code: designation.code,
        description: designation.description,
        isActive: designation.isActive,

        department: designation.department
            ? {
                id: designation.department.id,
                name: designation.department.name,
                code: designation.department.code
            }
            : null,

        employeeCount:
            designation._count?.employees ?? undefined,

        createdAt: designation.createdAt,
        updatedAt: designation.updatedAt
    };
};

export const mapDesignationList = (
    designations
) => designations.map(mapDesignation);
 
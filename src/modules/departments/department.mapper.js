export const mapDepartment = (department) => {
    if (!department) {
        return null;
    }

    return {
        id: department.id,
        companyId: department.companyId,
        name: department.name,
        code: department.code,
        description: department.description,
        isActive: department.isActive,

        designationCount:
            department._count?.designations ?? undefined,

        employeeCount:
            department._count?.employees ?? undefined,

        createdAt: department.createdAt,
        updatedAt: department.updatedAt
    };
};

export const mapDepartmentList = (departments) =>
    departments.map(mapDepartment);

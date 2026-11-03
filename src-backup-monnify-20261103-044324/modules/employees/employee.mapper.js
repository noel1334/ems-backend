export const mapEmployee = (employee) => {
    if (!employee) {
        return null;
    }

    return {
        id: employee.id,
        companyId: employee.companyId,
        employeeNumber: employee.employeeNumber,

        firstName: employee.firstName,
        middleName: employee.middleName,
        lastName: employee.lastName,

        fullName: [
            employee.firstName,
            employee.middleName,
            employee.lastName
        ]
            .filter(Boolean)
            .join(" "),

        email: employee.email,
        phone: employee.phone,
        gender: employee.gender,
        dateOfBirth: employee.dateOfBirth,
        maritalStatus: employee.maritalStatus ?? null,

        address: employee.address,
        city: employee.city,
        state: employee.state,
        country: employee.country,

        jobTitle: employee.jobTitle,
        profilePhotoUrl: employee.profilePhotoUrl ?? null,

        employeeType: employee.employeeType,
        employmentStatus: employee.employmentStatus,

        hireDate: employee.hireDate,
        terminationDate: employee.terminationDate,
        departmentId: employee.departmentId ?? null,
        designationId: employee.designationId ?? null,
        managerId: employee.managerId ?? null,
        userId: employee.user?.id ?? null,

        department: employee.department
            ? {
                id: employee.department.id,
                name: employee.department.name,
                code: employee.department.code
            }
            : null,

        designation: employee.designation
            ? {
                id: employee.designation.id,
                name: employee.designation.name,
                code: employee.designation.code
            }
            : null,

        manager: employee.manager
            ? {
                id: employee.manager.id,
                employeeNumber: employee.manager.employeeNumber,
                firstName: employee.manager.firstName,
                lastName: employee.manager.lastName
            }
            : null,

        createdAt: employee.createdAt,
        updatedAt: employee.updatedAt
    };
};

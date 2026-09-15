import prisma from "../../config/database.js";
import AppError from "../../common/errors/AppError.js";

import {
    createEmployee,
    findEmployeeById,
    findEmployeeByNumber,
    findEmployeeByEmail,
    findDepartmentById,
    findDesignationById,
    findManagerById,
    listEmployees,
    updateEmployee,
    getUpdatedEmployee,
    deleteEmployee
} from "./employee.repository.js";

import { mapEmployee } from "./employee.mapper.js";

const generateEmployeeNumber = async (companyId, tx = prisma) => {
    const employees = await tx.employee.findMany({
        where: {
            companyId
        },
        select: {
            employeeNumber: true
        },
        orderBy: {
            employeeNumber: "desc"
        },
        take: 1
    });

    if (employees.length === 0) {
        return "EMP-000001";
    }

    const latestNumber = employees[0].employeeNumber;

    const match = latestNumber.match(/^EMP-(\d+)$/);

    if (!match) {
        const count = await tx.employee.count({
            where: {
                companyId
            }
        });

        return `EMP-${String(count + 1).padStart(6, "0")}`;
    }

    const nextNumber = Number(match[1]) + 1;

    return `EMP-${String(nextNumber).padStart(6, "0")}`;
};

const validateDepartment = async (
    departmentId,
    companyId,
    tx
) => {
    if (!departmentId) {
        return null;
    }

    const department = await findDepartmentById(
        departmentId,
        companyId,
        tx
    );

    if (!department) {
        throw new AppError(
            "Department not found in this company",
            404,
            "DEPARTMENT_NOT_FOUND"
        );
    }

    if (!department.isActive) {
        throw new AppError(
            "Cannot assign employee to an inactive department",
            400,
            "DEPARTMENT_INACTIVE"
        );
    }

    return department;
};

const validateDesignation = async (
    designationId,
    companyId,
    tx
) => {
    if (!designationId) {
        return null;
    }

    const designation = await findDesignationById(
        designationId,
        companyId,
        tx
    );

    if (!designation) {
        throw new AppError(
            "Designation not found in this company",
            404,
            "DESIGNATION_NOT_FOUND"
        );
    }

    if (!designation.isActive) {
        throw new AppError(
            "Cannot assign employee to an inactive designation",
            400,
            "DESIGNATION_INACTIVE"
        );
    }

    return designation;
};

const validateManager = async (
    managerId,
    companyId,
    tx
) => {
    if (!managerId) {
        return null;
    }

    const manager = await findManagerById(
        managerId,
        companyId,
        tx
    );

    if (!manager) {
        throw new AppError(
            "Manager not found in this company",
            404,
            "MANAGER_NOT_FOUND"
        );
    }

    if (manager.employmentStatus !== "ACTIVE") {
        throw new AppError(
            "Manager must have an active employment status",
            400,
            "INVALID_MANAGER"
        );
    }

    return manager;
};

export const createEmployeeService = async ({
    companyId,
    data
}) => {
    return prisma.$transaction(async (tx) => {
        if (data.email) {
            const existingEmail = await findEmployeeByEmail(
                data.email,
                companyId,
                tx
            );

            if (existingEmail) {
                throw new AppError(
                    "An employee with this email already exists",
                    409,
                    "EMPLOYEE_EMAIL_EXISTS"
                );
            }
        }

        await validateDepartment(
            data.departmentId,
            companyId,
            tx
        );

        await validateDesignation(
            data.designationId,
            companyId,
            tx
        );

        await validateManager(
            data.managerId,
            companyId,
            tx
        );

        if (
            data.managerId &&
            data.managerId === data.id
        ) {
            throw new AppError(
                "An employee cannot be their own manager",
                400,
                "INVALID_MANAGER"
            );
        }

        const employeeNumber =
            await generateEmployeeNumber(companyId, tx);

        const employee = await createEmployee(
            {
                companyId,
                employeeNumber,

                firstName: data.firstName,
                middleName: data.middleName ?? null,
                lastName: data.lastName,

                email: data.email ?? null,
                phone: data.phone ?? null,

                gender: data.gender ?? null,
                dateOfBirth: data.dateOfBirth ?? null,

                address: data.address ?? null,
                city: data.city ?? null,
                state: data.state ?? null,
                country: data.country ?? "Nigeria",

                jobTitle: data.jobTitle ?? null,

                employeeType:
                    data.employeeType ?? "FULL_TIME",

                employmentStatus:
                    data.employmentStatus ?? "ACTIVE",

                hireDate: data.hireDate,

                terminationDate:
                    data.terminationDate ?? null,

                departmentId:
                    data.departmentId ?? null,

                designationId:
                    data.designationId ?? null,

                managerId:
                    data.managerId ?? null
            },
            tx
        );

        return mapEmployee(employee);
    });
};

export const getEmployeeService = async ({
    employeeId,
    companyId
}) => {
    const employee = await findEmployeeById(
        employeeId,
        companyId
    );

    if (!employee) {
        throw new AppError(
            "Employee not found",
            404,
            "EMPLOYEE_NOT_FOUND"
        );
    }

    return mapEmployee(employee);
};

export const listEmployeesService = async ({
    companyId,
    query
}) => {
    const result = await listEmployees({
        companyId,
        ...query
    });

    return {
        items: result.items.map(mapEmployee),
        pagination: {
            page: result.page,
            limit: result.limit,
            total: result.total,
            totalPages: result.totalPages
        }
    };
};

export const updateEmployeeService = async ({
    employeeId,
    companyId,
    data
}) => {
    return prisma.$transaction(async (tx) => {
        const existingEmployee =
            await findEmployeeById(
                employeeId,
                companyId,
                tx
            );

        if (!existingEmployee) {
            throw new AppError(
                "Employee not found",
                404,
                "EMPLOYEE_NOT_FOUND"
            );
        }

        if (
            data.email !== undefined &&
            data.email !== existingEmployee.email
        ) {
            if (data.email) {
                const existingEmail =
                    await findEmployeeByEmail(
                        data.email,
                        companyId,
                        tx
                    );

                if (
                    existingEmail &&
                    existingEmail.id !== employeeId
                ) {
                    throw new AppError(
                        "An employee with this email already exists",
                        409,
                        "EMPLOYEE_EMAIL_EXISTS"
                    );
                }
            }
        }

        if (data.departmentId !== undefined) {
            await validateDepartment(
                data.departmentId,
                companyId,
                tx
            );
        }

        if (data.designationId !== undefined) {
            await validateDesignation(
                data.designationId,
                companyId,
                tx
            );
        }

        if (data.managerId !== undefined) {
            if (data.managerId === employeeId) {
                throw new AppError(
                    "An employee cannot be their own manager",
                    400,
                    "INVALID_MANAGER"
                );
            }

            await validateManager(
                data.managerId,
                companyId,
                tx
            );
        }

        const updateData = {
            ...data
        };

        if (updateData.email !== undefined) {
            updateData.email =
                updateData.email || null;
        }

        const result = await updateEmployee(
            employeeId,
            companyId,
            updateData,
            tx
        );

        if (result.count === 0) {
            throw new AppError(
                "Employee could not be updated",
                404,
                "EMPLOYEE_NOT_FOUND"
            );
        }

        const updatedEmployee =
            await getUpdatedEmployee(
                employeeId,
                companyId,
                tx
            );

        return mapEmployee(updatedEmployee);
    });
};

export const deleteEmployeeService = async ({
    employeeId,
    companyId
}) => {
    return prisma.$transaction(async (tx) => {
        const employee = await findEmployeeById(
            employeeId,
            companyId,
            tx
        );

        if (!employee) {
            throw new AppError(
                "Employee not found",
                404,
                "EMPLOYEE_NOT_FOUND"
            );
        }

        const subordinates =
            await tx.employee.count({
                where: {
                    companyId,
                    managerId: employeeId
                }
            });

        if (subordinates > 0) {
            throw new AppError(
                "Cannot delete an employee who has direct reports. Reassign their reports first.",
                400,
                "EMPLOYEE_HAS_SUBORDINATES"
            );
        }

        await deleteEmployee(
            employeeId,
            companyId,
            tx
        );

        return {
            id: employeeId
        };
    });
};
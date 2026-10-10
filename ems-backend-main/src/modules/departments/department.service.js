import prisma from "../../config/database.js";
import { AppError } from "../../common/errors/AppError.js";
import {
    createDepartment,
    findDepartmentById,
    findDepartmentByName,
    findDepartmentByCode,
    listDepartments,
    updateDepartment,
    getUpdatedDepartment,
    deleteDepartment
} from "./department.repository.js";
import {
    mapDepartment,
    mapDepartmentList
} from "./department.mapper.js";

const normalizeName = (value) => value.trim();

const normalizeCode = (value) =>
    value.trim().toUpperCase();

export const createDepartmentService = async ({
    companyId,
    data
}) => {
    const name = normalizeName(data.name);
    const code = normalizeCode(data.code);

    const existingName = await findDepartmentByName(
        name,
        companyId
    );

    if (existingName) {
        throw new AppError(
            "A department with this name already exists",
            409,
            "DEPARTMENT_NAME_EXISTS"
        );
    }

    const existingCode = await findDepartmentByCode(
        code,
        companyId
    );

    if (existingCode) {
        throw new AppError(
            "A department with this code already exists",
            409,
            "DEPARTMENT_CODE_EXISTS"
        );
    }

    const department = await createDepartment({
        companyId,
        name,
        code,
        description: data.description ?? null
    });

    return mapDepartment(department);
};

export const getDepartmentService = async ({
    companyId,
    departmentId
}) => {
    const department = await findDepartmentById(
        departmentId,
        companyId
    );

    if (!department) {
        throw new AppError(
            "Department not found",
            404,
            "DEPARTMENT_NOT_FOUND"
        );
    }

    return mapDepartment(department);
};

export const listDepartmentService = async ({
    companyId,
    query
}) => {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const skip = (page - 1) * limit;

    const result = await listDepartments({
        companyId,
        search: query.search,
        isActive: query.isActive,
        skip,
        take: limit
    });

    return {
        items: mapDepartmentList(result.items),

        pagination: {
            page,
            limit,
            total: result.total,
            totalPages: Math.ceil(result.total / limit)
        }
    };
};

export const updateDepartmentService = async ({
    companyId,
    departmentId,
    data
}) => {
    const existing = await findDepartmentById(
        departmentId,
        companyId
    );

    if (!existing) {
        throw new AppError(
            "Department not found",
            404,
            "DEPARTMENT_NOT_FOUND"
        );
    }

    const updateData = {};

    if (data.name !== undefined) {
        const name = normalizeName(data.name);

        if (name.toLowerCase() !== existing.name.toLowerCase()) {
            const duplicate = await findDepartmentByName(
                name,
                companyId
            );

            if (duplicate && duplicate.id !== departmentId) {
                throw new AppError(
                    "A department with this name already exists",
                    409,
                    "DEPARTMENT_NAME_EXISTS"
                );
            }
        }

        updateData.name = name;
    }

    if (data.code !== undefined) {
        const code = normalizeCode(data.code);

        if (code.toLowerCase() !== existing.code.toLowerCase()) {
            const duplicate = await findDepartmentByCode(
                code,
                companyId
            );

            if (duplicate && duplicate.id !== departmentId) {
                throw new AppError(
                    "A department with this code already exists",
                    409,
                    "DEPARTMENT_CODE_EXISTS"
                );
            }
        }

        updateData.code = code;
    }

    if (data.description !== undefined) {
        updateData.description = data.description;
    }

    if (data.isActive !== undefined) {
        updateData.isActive = data.isActive;
    }

    await updateDepartment(
        departmentId,
        companyId,
        updateData
    );

    const updated = await getUpdatedDepartment(
        departmentId,
        companyId
    );

    return mapDepartment(updated);
};

export const deleteDepartmentService = async ({
    companyId,
    departmentId
}) => {
    const existing = await findDepartmentById(
        departmentId,
        companyId
    );

    if (!existing) {
        throw new AppError(
            "Department not found",
            404,
            "DEPARTMENT_NOT_FOUND"
        );
    }

    if (existing._count?.employees > 0) {
        throw new AppError(
            "Cannot delete a department that has employees. Deactivate it instead.",
            409,
            "DEPARTMENT_HAS_EMPLOYEES"
        );
    }

    await prisma.$transaction(async (tx) => {
        await tx.designation.updateMany({
            where: {
                companyId,
                departmentId
            },
            data: {
                departmentId: null
            }
        });

        await deleteDepartment(
            departmentId,
            companyId,
            tx
        );
    });

    return {
        id: departmentId,
        deleted: true
    };
};
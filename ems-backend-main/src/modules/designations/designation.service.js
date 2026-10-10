import { AppError } from "../../common/errors/AppError.js";

import {
    createDesignation,
    findDesignationById,
    findDesignationByName,
    findDesignationByCode,
    findDepartmentForCompany,
    listDesignations,
    updateDesignation,
    getUpdatedDesignation,
    deleteDesignation
} from "./designation.repository.js";

import {
    mapDesignation,
    mapDesignationList
} from "./designation.mapper.js";

const normalizeName = (value) => value.trim();

const normalizeCode = (value) =>
    value.trim().toUpperCase();

export const createDesignationService = async ({
    companyId,
    data
}) => {
    const name = normalizeName(data.name);
    const code = normalizeCode(data.code);

    if (data.departmentId) {
        const department =
            await findDepartmentForCompany(
                data.departmentId,
                companyId
            );

        if (!department) {
            throw new AppError(
                "Department not found",
                404,
                "DEPARTMENT_NOT_FOUND"
            );
        }

        if (!department.isActive) {
            throw new AppError(
                "Cannot assign a designation to an inactive department",
                409,
                "DEPARTMENT_INACTIVE"
            );
        }
    }

    const existingName =
        await findDesignationByName(
            name,
            companyId
        );

    if (existingName) {
        throw new AppError(
            "A designation with this name already exists",
            409,
            "DESIGNATION_NAME_EXISTS"
        );
    }

    const existingCode =
        await findDesignationByCode(
            code,
            companyId
        );

    if (existingCode) {
        throw new AppError(
            "A designation with this code already exists",
            409,
            "DESIGNATION_CODE_EXISTS"
        );
    }

    const designation =
        await createDesignation({
            companyId,
            name,
            code,
            departmentId: data.departmentId ?? null,
            description: data.description ?? null
        });

    return mapDesignation(designation);
};

export const getDesignationService = async ({
    companyId,
    designationId
}) => {
    const designation =
        await findDesignationById(
            designationId,
            companyId
        );

    if (!designation) {
        throw new AppError(
            "Designation not found",
            404,
            "DESIGNATION_NOT_FOUND"
        );
    }

    return mapDesignation(designation);
};

export const listDesignationService = async ({
    companyId,
    query
}) => {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const skip = (page - 1) * limit;

    const result =
        await listDesignations({
            companyId,
            search: query.search,
            departmentId: query.departmentId,
            isActive: query.isActive,
            skip,
            take: limit
        });

    return {
        items: mapDesignationList(result.items),

        pagination: {
            page,
            limit,
            total: result.total,
            totalPages: Math.ceil(
                result.total / limit
            )
        }
    };
};

export const updateDesignationService = async ({
    companyId,
    designationId,
    data
}) => {
    const existing =
        await findDesignationById(
            designationId,
            companyId
        );

    if (!existing) {
        throw new AppError(
            "Designation not found",
            404,
            "DESIGNATION_NOT_FOUND"
        );
    }

    const updateData = {};

    if (data.name !== undefined) {
        const name = normalizeName(data.name);

        if (
            name.toLowerCase() !==
            existing.name.toLowerCase()
        ) {
            const duplicate =
                await findDesignationByName(
                    name,
                    companyId
                );

            if (
                duplicate &&
                duplicate.id !== designationId
            ) {
                throw new AppError(
                    "A designation with this name already exists",
                    409,
                    "DESIGNATION_NAME_EXISTS"
                );
            }
        }

        updateData.name = name;
    }

    if (data.code !== undefined) {
        const code = normalizeCode(data.code);

        if (
            code.toLowerCase() !==
            existing.code.toLowerCase()
        ) {
            const duplicate =
                await findDesignationByCode(
                    code,
                    companyId
                );

            if (
                duplicate &&
                duplicate.id !== designationId
            ) {
                throw new AppError(
                    "A designation with this code already exists",
                    409,
                    "DESIGNATION_CODE_EXISTS"
                );
            }
        }

        updateData.code = code;
    }

    if (data.departmentId !== undefined) {
        if (data.departmentId !== null) {
            const department =
                await findDepartmentForCompany(
                    data.departmentId,
                    companyId
                );

            if (!department) {
                throw new AppError(
                    "Department not found",
                    404,
                    "DEPARTMENT_NOT_FOUND"
                );
            }

            if (!department.isActive) {
                throw new AppError(
                    "Cannot assign a designation to an inactive department",
                    409,
                    "DEPARTMENT_INACTIVE"
                );
            }
        }

        updateData.departmentId =
            data.departmentId;
    }

    if (data.description !== undefined) {
        updateData.description =
            data.description;
    }

    if (data.isActive !== undefined) {
        updateData.isActive =
            data.isActive;
    }

    await updateDesignation(
        designationId,
        companyId,
        updateData
    );

    const updated =
        await getUpdatedDesignation(
            designationId,
            companyId
        );

    return mapDesignation(updated);
};

export const deleteDesignationService = async ({
    companyId,
    designationId
}) => {
    const existing =
        await findDesignationById(
            designationId,
            companyId
        );

    if (!existing) {
        throw new AppError(
            "Designation not found",
            404,
            "DESIGNATION_NOT_FOUND"
        );
    }

    if (
        existing._count?.employees > 0
    ) {
        throw new AppError(
            "Cannot delete a designation that has employees. Deactivate it instead.",
            409,
            "DESIGNATION_HAS_EMPLOYEES"
        );
    }

    await deleteDesignation(
        designationId,
        companyId
    );

    return {
        id: designationId,
        deleted: true
    };
};
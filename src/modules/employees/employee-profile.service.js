import prisma from "../../config/database.js";
import AppError from "../../common/errors/AppError.js";
import { resolveMonnifyAccount } from "../payments/monnify/monnify.service.js";

import { validateUploadedFileContent } from "../../middleware/upload.middleware.js";

import {
    findEmployee,
    createBankAccount,
    findBankAccount,
    listBankAccounts,
    updateBankAccount,
    deleteBankAccount,
    clearPrimaryBankAccounts,
    createEducation,
    findEducation,
    listEducation,
    updateEducation,
    deleteEducation,
    createExperience,
    findExperience,
    listExperience,
    updateExperience,
    deleteExperience,
    createDocument,
    findDocument,
    listDocuments,
    deleteDocument,
    updateEmployeePhoto
} from "./employee-profile.repository.js";

import {
    mapBankAccount,
    mapEducation,
    mapExperience,
    mapDocument
} from "./employee-profile.mapper.js";

const accessUrl = async (storage, storageKey) => {
    if (!storageKey) return null;
    if (typeof storage.signedUrl === "function") return storage.signedUrl(storageKey);
    return null;
};

const requireEmployee = async (
    employeeId,
    companyId,
    tx = prisma
) => {
    const employee = await findEmployee(
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

    return employee;
};

const verifyMonnifyBankAccount = async ({ companyId, accountNumber, bankCode }) => {
    if (!bankCode) return null;
    const verified = await resolveMonnifyAccount(companyId, accountNumber, bankCode);
    return {
        bankName: verified.bankName,
        monnifyBankCode: verified.bankCode,
        accountName: verified.accountName,
        monnifyVerifiedAt: new Date(verified.verifiedAt)
    };
};

export const addBankAccountService = async ({
    employeeId,
    companyId,
    data
}) => {
    await requireEmployee(employeeId, companyId);
    const verification = await verifyMonnifyBankAccount({
        companyId,
        accountNumber: data.accountNumber,
        bankCode: data.monnifyBankCode
    });

    return prisma.$transaction(
        async (tx) => {
            await requireEmployee(employeeId, companyId, tx);
            if (data.isPrimary) await clearPrimaryBankAccounts(employeeId, tx);

            const account = await createBankAccount({
                employeeId,
                bankName: verification?.bankName ?? data.bankName,
                paystackBankCode: data.paystackBankCode ?? null,
                flutterwaveBankCode: data.flutterwaveBankCode ?? null,
                monnifyBankCode: verification?.monnifyBankCode ?? null,
                monnifyVerifiedAt: verification?.monnifyVerifiedAt ?? null,
                accountName: verification?.accountName ?? data.accountName,
                accountNumber: data.accountNumber,
                accountType: data.accountType ?? null,
                isPrimary: data.isPrimary ?? true,
                isActive: data.isActive ?? true
            }, tx);

            return mapBankAccount(account);
        }
    );
};

export const listBankAccountsService =
    async ({
        employeeId,
        companyId
    }) => {
        await requireEmployee(
            employeeId,
            companyId
        );

        const accounts =
            await listBankAccounts(
                employeeId
            );

        return accounts.map(
            mapBankAccount
        );
    };

export const updateBankAccountService = async ({
    employeeId,
    companyId,
    accountId,
    data
}) => {
    await requireEmployee(employeeId, companyId);
    const existing = await findBankAccount(accountId, employeeId);
    if (!existing) throw new AppError("Bank account not found", 404, "BANK_ACCOUNT_NOT_FOUND");

    const codeWasProvided = Object.prototype.hasOwnProperty.call(data, "monnifyBankCode");
    const nextMonnifyCode = codeWasProvided
        ? String(data.monnifyBankCode ?? "").trim() || null
        : existing.monnifyBankCode;
    const nextAccountNumber = data.accountNumber ?? existing.accountNumber;
    const beneficiaryChanged =
        (data.accountNumber !== undefined && String(data.accountNumber) !== String(existing.accountNumber)) ||
        (data.bankName !== undefined && String(data.bankName) !== String(existing.bankName)) ||
        (codeWasProvided && nextMonnifyCode !== existing.monnifyBankCode) ||
        data.accountName !== undefined;

    let updateData = { ...data };
    if (nextMonnifyCode && beneficiaryChanged) {
        const verification = await verifyMonnifyBankAccount({
            companyId,
            accountNumber: nextAccountNumber,
            bankCode: nextMonnifyCode
        });
        updateData = {
            ...updateData,
            bankName: verification.bankName,
            monnifyBankCode: verification.monnifyBankCode,
            accountName: verification.accountName,
            monnifyVerifiedAt: verification.monnifyVerifiedAt
        };
    } else if (codeWasProvided && !nextMonnifyCode) {
        updateData = { ...updateData, monnifyBankCode: null, monnifyVerifiedAt: null };
    }

    return prisma.$transaction(async (tx) => {
        await requireEmployee(employeeId, companyId, tx);
        if (updateData.isPrimary === true) await clearPrimaryBankAccounts(employeeId, tx);

        const result = await updateBankAccount(accountId, employeeId, updateData, tx);
        if (result.count === 0) throw new AppError("Bank account could not be updated", 404, "BANK_ACCOUNT_NOT_FOUND");
        const updated = await findBankAccount(accountId, employeeId, tx);
        return mapBankAccount(updated);
    });
};

export const deleteBankAccountService =
    async ({
        employeeId,
        companyId,
        accountId
    }) => {
        await requireEmployee(
            employeeId,
            companyId
        );

        const account =
            await findBankAccount(
                accountId,
                employeeId
            );

        if (!account) {
            throw new AppError(
                "Bank account not found",
                404,
                "BANK_ACCOUNT_NOT_FOUND"
            );
        }

        await deleteBankAccount(
            accountId,
            employeeId
        );
    };

export const addEducationService = async ({
    employeeId,
    companyId,
    data
}) => {
    await requireEmployee(
        employeeId,
        companyId
    );

    const education =
        await createEducation({
            employeeId,
            institution:
                data.institution,
            qualification:
                data.qualification,
            fieldOfStudy:
                data.fieldOfStudy ?? null,
            startDate:
                data.startDate ?? null,
            endDate:
                data.endDate ?? null,
            grade:
                data.grade ?? null,
            description:
                data.description ?? null
        });

    return mapEducation(
        education
    );
};

export const listEducationService =
    async ({
        employeeId,
        companyId
    }) => {
        await requireEmployee(
            employeeId,
            companyId
        );

        const records =
            await listEducation(
                employeeId
            );

        return records.map(
            mapEducation
        );
    };

export const updateEducationService =
    async ({
        employeeId,
        companyId,
        educationId,
        data
    }) => {
        await requireEmployee(
            employeeId,
            companyId
        );

        const existing =
            await findEducation(
                educationId,
                employeeId
            );

        if (!existing) {
            throw new AppError(
                "Education record not found",
                404,
                "EDUCATION_NOT_FOUND"
            );
        }

        const result =
            await updateEducation(
                educationId,
                employeeId,
                data
            );

        if (result.count === 0) {
            throw new AppError(
                "Education record could not be updated",
                404,
                "EDUCATION_NOT_FOUND"
            );
        }

        const updated =
            await findEducation(
                educationId,
                employeeId
            );

        return mapEducation(
            updated
        );
    };

export const deleteEducationService =
    async ({
        employeeId,
        companyId,
        educationId
    }) => {
        await requireEmployee(
            employeeId,
            companyId
        );

        const result =
            await deleteEducation(
                educationId,
                employeeId
            );

        if (result.count === 0) {
            throw new AppError(
                "Education record not found",
                404,
                "EDUCATION_NOT_FOUND"
            );
        }
    };

export const addExperienceService =
    async ({
        employeeId,
        companyId,
        data
    }) => {
        await requireEmployee(
            employeeId,
            companyId
        );

        const experience =
            await createExperience({
                employeeId,
                companyName:
                    data.companyName,
                jobTitle:
                    data.jobTitle ?? null,
                employmentType:
                    data.employmentType ?? null,
                startDate:
                    data.startDate ?? null,
                endDate:
                    data.endDate ?? null,
                responsibilities:
                    data.responsibilities ?? null,
                reasonForLeaving:
                    data.reasonForLeaving ?? null
            });

        return mapExperience(
            experience
        );
    };

export const listExperienceService =
    async ({
        employeeId,
        companyId
    }) => {
        await requireEmployee(
            employeeId,
            companyId
        );

        const records =
            await listExperience(
                employeeId
            );

        return records.map(
            mapExperience
        );
    };

export const updateExperienceService =
    async ({
        employeeId,
        companyId,
        experienceId,
        data
    }) => {
        await requireEmployee(
            employeeId,
            companyId
        );

        const existing =
            await findExperience(
                experienceId,
                employeeId
            );

        if (!existing) {
            throw new AppError(
                "Experience record not found",
                404,
                "EXPERIENCE_NOT_FOUND"
            );
        }

        const result =
            await updateExperience(
                experienceId,
                employeeId,
                data
            );

        if (result.count === 0) {
            throw new AppError(
                "Experience record could not be updated",
                404,
                "EXPERIENCE_NOT_FOUND"
            );
        }

        const updated =
            await findExperience(
                experienceId,
                employeeId
            );

        return mapExperience(
            updated
        );
    };

export const deleteExperienceService =
    async ({
        employeeId,
        companyId,
        experienceId
    }) => {
        await requireEmployee(
            employeeId,
            companyId
        );

        const result =
            await deleteExperience(
                experienceId,
                employeeId
            );

        if (result.count === 0) {
            throw new AppError(
                "Experience record not found",
                404,
                "EXPERIENCE_NOT_FOUND"
            );
        }
    };

export const listDocumentsService =
    async ({
        employeeId,
        companyId,
        storage
    }) => {
        await requireEmployee(
            employeeId,
            companyId
        );

        const documents =
            await listDocuments(
                employeeId
            );

        return Promise.all(
            documents.map(async (document) => ({
                ...mapDocument(document),
                fileUrl: await accessUrl(storage, document.storageKey),
            }))
        );
    };

export const uploadDocumentService =
    async ({
        employeeId,
        companyId,
        data,
        file,
        storage
    }) => {
        await requireEmployee(
            employeeId,
            companyId
        );

        if (!file) {
            throw new AppError("Document file is required", 400, "FILE_REQUIRED");
        }
        if (!validateUploadedFileContent(file)) {
            throw new AppError("Uploaded file content does not match its declared type", 400, "INVALID_FILE_CONTENT");
        }

        const uploaded =
            await storage.upload(file, { companyId, employeeId, category: "document" });

        try {
            const document =
                await createDocument({
                    employeeId,
                    documentType:
                        data.documentType,
                    title: data.title,
                    fileName:
                        uploaded.fileName,
                    fileUrl:
                        uploaded.fileUrl,
                    storageKey:
                        uploaded.storageKey,
                    mimeType:
                        uploaded.mimeType,
                    fileSize:
                        uploaded.fileSize,
                    expiresAt:
                        data.expiresAt ?? null
                });

            return {
                ...mapDocument(document),
                fileUrl: await accessUrl(storage, uploaded.storageKey),
            };
        } catch (error) {
            await storage.delete(
                uploaded.storageKey
            );

            throw error;
        }
    };

export const deleteDocumentService =
    async ({
        employeeId,
        companyId,
        documentId,
        storage
    }) => {
        await requireEmployee(
            employeeId,
            companyId
        );

        const document =
            await findDocument(
                documentId,
                employeeId
            );

        if (!document) {
            throw new AppError(
                "Document not found",
                404,
                "DOCUMENT_NOT_FOUND"
            );
        }

        await deleteDocument(
            documentId,
            employeeId
        );

        if (document.storageKey) {
            await storage.delete(
                document.storageKey
            );
        }
    };

export const updateProfilePhotoService =
    async ({
        employeeId,
        companyId,
        file,
        storage
    }) => {
        await requireEmployee(
            employeeId,
            companyId
        );

        if (!file) {
            throw new AppError(
                "Profile photo is required",
                400,
                "FILE_REQUIRED"
            );
        }
        if (!validateUploadedFileContent(file)) {
            throw new AppError("Uploaded file content does not match its declared type", 400, "INVALID_FILE_CONTENT");
        }

        const uploaded =
            await storage.upload(file, { companyId, employeeId, category: "profile-photo" });

        try {
            const employee =
                await findEmployee(
                    employeeId,
                    companyId
                );

            if (
                employee.profilePhotoKey
            ) {
                await storage.delete(
                    employee.profilePhotoKey
                );
            }

            const result =
                await updateEmployeePhoto(
                    employeeId,
                    companyId,
                    {
                        profilePhotoUrl:
                            uploaded.fileUrl,
                        profilePhotoKey:
                            uploaded.storageKey
                    }
                );

            if (result.count === 0) {
                throw new AppError(
                    "Employee could not be updated",
                    404,
                    "EMPLOYEE_NOT_FOUND"
                );
            }

            return {
                profilePhotoUrl: await accessUrl(storage, uploaded.storageKey),
                profilePhotoKey: uploaded.storageKey,
            };
        } catch (error) {
            await storage.delete(
                uploaded.storageKey
            );

            throw error;
        }
    };
import prisma from "../../config/database.js";
import AppError from "../../common/errors/AppError.js";
import { resolveMonnifyAccount } from "../payments/monnify/monnify.service.js";
import { validateProviderBankCode } from "../payments/bank-directory.service.js";

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

const MONNIFY_NAME_ENQUIRY_PATH = "/api/v2/disbursements/account/validate";

// Monnify code 99 is a temporary Name Enquiry processing failure, not proof
// that the employee's bank details are invalid. Only suppress this exact
// endpoint failure; bank-directory/authentication failures must still surface.
const isMonnifyNameEnquiryUnavailable = (error) =>
    [error?.code, error?.details?.providerCode].some((code) => String(code ?? "").trim() === "99") &&
    String(error?.details?.request?.path ?? "").trim() === MONNIFY_NAME_ENQUIRY_PATH;

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

export const addBankAccountService = async ({
    employeeId,
    companyId,
    data
}) => {
    // Check tenant ownership before contacting any provider.
    await requireEmployee(employeeId, companyId);
    if (data.paystackBankCode) await validateProviderBankCode("PAYSTACK", data.paystackBankCode);
    if (data.flutterwaveBankCode) await validateProviderBankCode("FLUTTERWAVE", data.flutterwaveBankCode);
    const verifiedMonnify = data.monnifyBankCode
        ? await resolveMonnifyAccount(companyId, data.accountNumber, data.monnifyBankCode)
        : null;

    return prisma.$transaction(
        async (tx) => {
            await requireEmployee(
                employeeId,
                companyId,
                tx
            );

            if (data.isPrimary) {
                await clearPrimaryBankAccounts(
                    employeeId,
                    tx
                );
            }

            const account =
                await createBankAccount(
                    {
                        employeeId,
                        bankName: data.bankName,
                        paystackBankCode: data.paystackBankCode ?? null,
                        flutterwaveBankCode: data.flutterwaveBankCode ?? null,
                        monnifyBankCode: verifiedMonnify?.bankCode ?? null,
                        monnifyVerifiedAt: verifiedMonnify?.verifiedAt ? new Date(verifiedMonnify.verifiedAt) : null,
                        accountName: verifiedMonnify?.accountName ?? data.accountName,
                        accountNumber: data.accountNumber,
                        accountType:
                            data.accountType ?? null,
                        isPrimary:
                            data.isPrimary ?? true,
                        isActive:
                            data.isActive ?? true
                    },
                    tx
                );

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

    const nextAccountNumber = String(data.accountNumber ?? existing.accountNumber).trim();
    const hasMonnifyCode = Object.prototype.hasOwnProperty.call(data, "monnifyBankCode");
    const nextMonnifyCode = hasMonnifyCode
        ? String(data.monnifyBankCode ?? "").trim() || null
        : existing.monnifyBankCode ?? null;
    const accountNumberChanged = nextAccountNumber !== String(existing.accountNumber);
    const monnifyCodeChanged = hasMonnifyCode && nextMonnifyCode !== String(existing.monnifyBankCode ?? "");
    const paystackCodeChanged = Object.prototype.hasOwnProperty.call(data, "paystackBankCode")
        && String(data.paystackBankCode ?? "") !== String(existing.paystackBankCode ?? "");
    const flutterwaveCodeChanged = Object.prototype.hasOwnProperty.call(data, "flutterwaveBankCode")
        && String(data.flutterwaveBankCode ?? "") !== String(existing.flutterwaveBankCode ?? "");
    const accountNameChanged = Object.prototype.hasOwnProperty.call(data, "accountName")
        && String(data.accountName ?? "") !== String(existing.accountName ?? "");
    const bankNameChanged = Object.prototype.hasOwnProperty.call(data, "bankName")
        && String(data.bankName ?? "") !== String(existing.bankName ?? "");
    const onlyOtherProviderCodeChanged = (paystackCodeChanged || flutterwaveCodeChanged)
        && !monnifyCodeChanged
        && !accountNumberChanged
        && !accountNameChanged
        && !bankNameChanged;
    const updateData = { ...data };

    if (paystackCodeChanged && data.paystackBankCode) await validateProviderBankCode("PAYSTACK", data.paystackBankCode);
    if (flutterwaveCodeChanged && data.flutterwaveBankCode) await validateProviderBankCode("FLUTTERWAVE", data.flutterwaveBankCode);

    if (nextMonnifyCode && (
        monnifyCodeChanged
        || accountNumberChanged
        || accountNameChanged
        || bankNameChanged
        || (!existing.monnifyVerifiedAt && !onlyOtherProviderCodeChanged)
    )) {
        // Verify when Monnify beneficiary details change, or retry a previously
        // unverified beneficiary on an ordinary bank-account save. A Paystack or
        // Flutterwave code-only edit must never depend on Monnify availability.
        try {
            const verified = await resolveMonnifyAccount(companyId, nextAccountNumber, nextMonnifyCode);
            updateData.monnifyBankCode = verified.bankCode;
            updateData.monnifyVerifiedAt = new Date(verified.verifiedAt);
            updateData.accountName = verified.accountName;
        } catch (error) {
            if (!isMonnifyNameEnquiryUnavailable(error)) throw error;

            // Keep the selected company-specific Monnify bank code and all profile
            // edits. Preserve a non-empty manual/existing account name, but leave
            // verifiedAt null so payroll preflight still requires a successful
            // Name Enquiry before any Monnify salary transfer is submitted.
            updateData.monnifyBankCode = nextMonnifyCode;
            updateData.monnifyVerifiedAt = null;
            const retainedAccountName = String(data.accountName ?? "").trim()
                || String(existing.accountName ?? "").trim();
            if (retainedAccountName) updateData.accountName = retainedAccountName;
            else delete updateData.accountName;
        }
    } else if (hasMonnifyCode && !nextMonnifyCode) {
        updateData.monnifyBankCode = null;
        updateData.monnifyVerifiedAt = null;
    } else if (accountNumberChanged && !nextMonnifyCode) {
        updateData.monnifyBankCode = null;
        updateData.monnifyVerifiedAt = null;
    }

    const effectiveAccountNameChanged = Object.prototype.hasOwnProperty.call(updateData, "accountName")
        && String(updateData.accountName ?? "") !== String(existing.accountName ?? "");
    if (accountNumberChanged || paystackCodeChanged || effectiveAccountNameChanged) {
        // Cached Paystack recipients are bound to the original beneficiary fingerprint.
        updateData.paystackRecipientCode = null;
        updateData.paystackRecipientMode = null;
        updateData.paystackRecipientFingerprint = null;
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
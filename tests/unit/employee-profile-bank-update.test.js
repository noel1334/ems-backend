import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    prisma: { $transaction: vi.fn() },
    findEmployee: vi.fn(),
    createBankAccount: vi.fn(),
    findBankAccount: vi.fn(),
    listBankAccounts: vi.fn(),
    updateBankAccount: vi.fn(),
    deleteBankAccount: vi.fn(),
    clearPrimaryBankAccounts: vi.fn(),
    createEducation: vi.fn(),
    findEducation: vi.fn(),
    listEducation: vi.fn(),
    updateEducation: vi.fn(),
    deleteEducation: vi.fn(),
    createExperience: vi.fn(),
    findExperience: vi.fn(),
    listExperience: vi.fn(),
    updateExperience: vi.fn(),
    deleteExperience: vi.fn(),
    createDocument: vi.fn(),
    findDocument: vi.fn(),
    listDocuments: vi.fn(),
    deleteDocument: vi.fn(),
    updateEmployeePhoto: vi.fn(),
    resolveMonnifyAccount: vi.fn(),
    validateProviderBankCode: vi.fn(),
}));

vi.mock("../../src/config/database.js", () => ({ default: mocks.prisma }));
vi.mock("../../src/modules/employees/employee-profile.repository.js", () => ({
    findEmployee: mocks.findEmployee,
    createBankAccount: mocks.createBankAccount,
    findBankAccount: mocks.findBankAccount,
    listBankAccounts: mocks.listBankAccounts,
    updateBankAccount: mocks.updateBankAccount,
    deleteBankAccount: mocks.deleteBankAccount,
    clearPrimaryBankAccounts: mocks.clearPrimaryBankAccounts,
    createEducation: mocks.createEducation,
    findEducation: mocks.findEducation,
    listEducation: mocks.listEducation,
    updateEducation: mocks.updateEducation,
    deleteEducation: mocks.deleteEducation,
    createExperience: mocks.createExperience,
    findExperience: mocks.findExperience,
    listExperience: mocks.listExperience,
    updateExperience: mocks.updateExperience,
    deleteExperience: mocks.deleteExperience,
    createDocument: mocks.createDocument,
    findDocument: mocks.findDocument,
    listDocuments: mocks.listDocuments,
    deleteDocument: mocks.deleteDocument,
    updateEmployeePhoto: mocks.updateEmployeePhoto,
}));
vi.mock("../../src/modules/payments/monnify/monnify.service.js", () => ({
    resolveMonnifyAccount: mocks.resolveMonnifyAccount,
}));
vi.mock("../../src/modules/payments/bank-directory.service.js", () => ({
    validateProviderBankCode: mocks.validateProviderBankCode,
}));
vi.mock("../../src/middleware/upload.middleware.js", () => ({
    validateUploadedFileContent: vi.fn(),
}));

import { updateBankAccountService } from "../../src/modules/employees/employee-profile.service.js";

const currentBank = () => ({
    id: "bank-1",
    employeeId: "employee-1",
    bankName: "Moniepoint MFB",
    paystackBankCode: "50515",
    flutterwaveBankCode: "090405",
    monnifyBankCode: "50515",
    monnifyVerifiedAt: null,
    accountName: "Noel Victor",
    accountNumber: "8103490626",
    accountType: "SAVINGS",
    isPrimary: true,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
});

const nameEnquiryUnavailable = () => Object.assign(
    new Error("Monnify returned code 99 (unexpected processing error)"),
    {
        code: "99",
        details: {
            provider: "MONNIFY",
            providerCode: "99",
            request: { method: "GET", path: "/api/v2/disbursements/account/validate" },
        },
    },
);

describe("employee bank-account updates", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.prisma.$transaction.mockImplementation(async (callback) => callback({}));
        mocks.findEmployee.mockResolvedValue({ id: "employee-1", companyId: "company-1" });
        mocks.findBankAccount.mockResolvedValue(currentBank());
        mocks.updateBankAccount.mockResolvedValue({ count: 1 });
        mocks.validateProviderBankCode.mockResolvedValue(true);
    });

    it("does not call Monnify when only a Paystack bank code is changed", async () => {
        await updateBankAccountService({
            employeeId: "employee-1",
            companyId: "company-1",
            accountId: "bank-1",
            data: { paystackBankCode: "058" },
        });

        expect(mocks.resolveMonnifyAccount).not.toHaveBeenCalled();
        expect(mocks.updateBankAccount).toHaveBeenCalledWith(
            "bank-1",
            "employee-1",
            expect.objectContaining({ paystackBankCode: "058" }),
            expect.anything(),
        );
    });

    it("retries an unverified Monnify beneficiary on a normal bank-account save", async () => {
        mocks.resolveMonnifyAccount.mockResolvedValue({
            bankCode: "50515",
            accountName: "Noel Victor",
            verifiedAt: "2026-11-03T12:00:00.000Z",
        });

        await updateBankAccountService({
            employeeId: "employee-1",
            companyId: "company-1",
            accountId: "bank-1",
            data: { accountType: "SAVINGS" },
        });

        expect(mocks.resolveMonnifyAccount).toHaveBeenCalledWith("company-1", "8103490626", "50515");
        expect(mocks.updateBankAccount).toHaveBeenCalledWith(
            "bank-1",
            "employee-1",
            expect.objectContaining({
                monnifyBankCode: "50515",
                monnifyVerifiedAt: new Date("2026-11-03T12:00:00.000Z"),
                accountName: "Noel Victor",
            }),
            expect.anything(),
        );
    });

    it("saves a changed Monnify bank code and preserves the account name when Name Enquiry returns code 99", async () => {
        mocks.resolveMonnifyAccount.mockRejectedValue(nameEnquiryUnavailable());

        await updateBankAccountService({
            employeeId: "employee-1",
            companyId: "company-1",
            accountId: "bank-1",
            data: {
                bankName: "Moniepoint MFB",
                monnifyBankCode: "50516",
                accountName: "Noel Victor",
                accountNumber: "8103490626",
            },
        });

        expect(mocks.resolveMonnifyAccount).toHaveBeenCalledWith("company-1", "8103490626", "50516");
        expect(mocks.updateBankAccount).toHaveBeenCalledWith(
            "bank-1",
            "employee-1",
            expect.objectContaining({
                monnifyBankCode: "50516",
                monnifyVerifiedAt: null,
                accountName: "Noel Victor",
            }),
            expect.anything(),
        );
    });

    it("does not erase the stored account name if the client submits an empty value during code 99", async () => {
        mocks.resolveMonnifyAccount.mockRejectedValue(nameEnquiryUnavailable());

        await updateBankAccountService({
            employeeId: "employee-1",
            companyId: "company-1",
            accountId: "bank-1",
            data: {
                monnifyBankCode: "50516",
                accountName: "",
                accountNumber: "8103490626",
            },
        });

        expect(mocks.updateBankAccount).toHaveBeenCalledWith(
            "bank-1",
            "employee-1",
            expect.objectContaining({
                monnifyBankCode: "50516",
                monnifyVerifiedAt: null,
                accountName: "Noel Victor",
            }),
            expect.anything(),
        );
    });

    it("still rejects code 99 from the Monnify bank-directory endpoint", async () => {
        const directoryFailure = nameEnquiryUnavailable();
        directoryFailure.details.request.path = "/api/v1/banks";
        mocks.resolveMonnifyAccount.mockRejectedValue(directoryFailure);

        await expect(updateBankAccountService({
            employeeId: "employee-1",
            companyId: "company-1",
            accountId: "bank-1",
            data: { monnifyBankCode: "50516", accountNumber: "8103490626" },
        })).rejects.toThrow(/code 99/i);

        expect(mocks.updateBankAccount).not.toHaveBeenCalled();
    });
});

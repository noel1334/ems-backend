export const mapBankAccount = (account) => ({
    id: account.id,
    employeeId: account.employeeId,
    bankName: account.bankName,
    accountName: account.accountName,
    accountNumber: account.accountNumber,
    accountType: account.accountType,
    isPrimary: account.isPrimary,
    isActive: account.isActive,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt
});

export const mapEducation = (education) => ({
    id: education.id,
    employeeId: education.employeeId,
    institution: education.institution,
    qualification: education.qualification,
    fieldOfStudy: education.fieldOfStudy,
    startDate: education.startDate,
    endDate: education.endDate,
    grade: education.grade,
    description: education.description,
    createdAt: education.createdAt,
    updatedAt: education.updatedAt
});

export const mapExperience = (experience) => ({
    id: experience.id,
    employeeId: experience.employeeId,
    companyName: experience.companyName,
    jobTitle: experience.jobTitle,
    employmentType: experience.employmentType,
    startDate: experience.startDate,
    endDate: experience.endDate,
    responsibilities: experience.responsibilities,
    reasonForLeaving: experience.reasonForLeaving,
    createdAt: experience.createdAt,
    updatedAt: experience.updatedAt
});

export const mapDocument = (document) => ({
    id: document.id,
    employeeId: document.employeeId,
    documentType: document.documentType,
    title: document.title,
    fileName: document.fileName,
    fileUrl: document.fileUrl,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    expiresAt: document.expiresAt,
    isActive: document.isActive,
    uploadedAt: document.uploadedAt,
    updatedAt: document.updatedAt
});

import { AppError } from "../../common/errors/AppError.js";
import {
  createCompany,
  findCompanyByEmail,
  findCompanyById,
  findCompanyBySlug,
  updateCompany,
} from "./company.repository.js";

export const createCompanyService = async (data) => {
  const normalizedEmail = data.email.toLowerCase();

  const existingSlug = await findCompanyBySlug(data.slug);

  if (existingSlug) {
    throw new AppError("A company with this slug already exists", 409, {
      code: "COMPANY_SLUG_EXISTS",
    });
  }

  const existingEmail = await findCompanyByEmail(normalizedEmail);

  if (existingEmail) {
    throw new AppError("A company with this email already exists", 409, {
      code: "COMPANY_EMAIL_EXISTS",
    });
  }

  return createCompany({
    ...data,
    email: normalizedEmail,
  });
};

export const getCompanyService = async (companyId) => {
  const company = await findCompanyById(companyId);

  if (!company) {
    throw new AppError("Company not found", 404, {
      code: "COMPANY_NOT_FOUND",
    });
  }

  return company;
};

export const updateCompanyService = async (companyId, data) => {
  const company = await findCompanyById(companyId);

  if (!company) {
    throw new AppError("Company not found", 404, {
      code: "COMPANY_NOT_FOUND",
    });
  }

  if (data.email) {
    const email = data.email.toLowerCase();

    const existingCompany = await findCompanyByEmail(email);

    if (existingCompany && existingCompany.id !== companyId) {
      throw new AppError("Another company is already using this email", 409, {
        code: "COMPANY_EMAIL_EXISTS",
      });
    }

    data.email = email;
  }

  return updateCompany(companyId, data);
};

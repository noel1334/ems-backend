import { AppError } from "../common/errors/AppError.js";
import { findCompanyById } from "../modules/companies/company.repository.js";

export const tenantMiddleware = async (req, res, next) => {
  try {
    if (!req.user) {
      throw new AppError("Authentication is required", 401, {
        code: "AUTHENTICATION_REQUIRED",
      });
    }

    const companyId = req.user.companyId;

    if (!companyId) {
      throw new AppError("No company is associated with this account", 403, {
        code: "TENANT_NOT_FOUND",
      });
    }

    const company = await findCompanyById(companyId);

    if (!company) {
      throw new AppError("Company not found", 404, {
        code: "COMPANY_NOT_FOUND",
      });
    }

    if (company.status !== "ACTIVE") {
      throw new AppError("This company account is not active", 403, {
        code: "COMPANY_NOT_ACTIVE",
      });
    }

    req.tenant = {
      id: company.id,
      company,
    };

    next();
  } catch (error) {
    next(error);
  }
};

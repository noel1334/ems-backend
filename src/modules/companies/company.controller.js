import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { successResponse } from "../../common/utils/response.js";
import {
  createCompanyService,
  getCompanyService,
  updateCompanyService,
} from "./company.service.js";
import {
  createCompanySchema,
  updateCompanySchema,
} from "./company.validation.js";
import { mapCompany } from "./company.mapper.js";

export const createCompany = asyncHandler(async (req, res) => {
  const data = createCompanySchema.parse(req.body);

  const company = await createCompanyService(data);

  return successResponse(res, {
    statusCode: 201,
    message: "Company created successfully",
    data: mapCompany(company),
  });
});

export const getCompany = asyncHandler(async (req, res) => {
  const company = await getCompanyService(req.tenant.id);

  return successResponse(res, {
    message: "Company retrieved successfully",
    data: mapCompany(company),
  });
});

export const updateCompany = asyncHandler(async (req, res) => {
  const data = updateCompanySchema.parse(req.body);

  const company = await updateCompanyService(req.tenant.id, data);

  return successResponse(res, {
    message: "Company updated successfully",
    data: mapCompany(company),
  });
});

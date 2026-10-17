import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { AppError } from "../../common/errors/AppError.js";
import * as platformService from "./platform.service.js";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  employeeListSchema,
} from "../employees/employee.validation.js";
import {
  createEmployeeService,
  getEmployeeService,
  listEmployeesService,
  updateEmployeeService,
  deleteEmployeeService,
} from "../employees/employee.service.js";
import {
  createDepartmentSchema,
  updateDepartmentSchema,
  departmentListQuerySchema,
} from "../departments/department.validation.js";
import {
  createDepartmentService,
  getDepartmentService,
  listDepartmentService,
  updateDepartmentService,
  deleteDepartmentService,
} from "../departments/department.service.js";
import {
  createDesignationSchema,
  updateDesignationSchema,
  designationListQuerySchema,
} from "../designations/designation.validation.js";
import {
  createDesignationService,
  getDesignationService,
  listDesignationService,
  updateDesignationService,
  deleteDesignationService,
} from "../designations/designation.service.js";

// These handlers are mounted only after authMiddleware + requireSuperAdmin.
// Every operation takes its tenant from the URL and passes that exact companyId
// into the existing tenant-scoped services. The ordinary tenant routes remain
// unchanged and still require req.tenant from tenantMiddleware.
async function assertTargetTenant(companyId) {
  if (!companyId) throw new AppError("A company must be selected", 400, { code: "TENANT_SCOPE_REQUIRED" });
  await platformService.getTenant(companyId);
}

function parseBody(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("Validation failed", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }
  return parsed.data;
}

function parseQuery(schema, query) {
  const parsed = schema.safeParse(query);
  if (!parsed.success) {
    throw new AppError("Invalid query parameters", 400, {
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }
  return parsed.data;
}

const companyId = (req) => req.params.id;

// Employees
export const listTenantEmployees = asyncHandler(async (req, res) => {
  await assertTargetTenant(companyId(req));
  const query = parseQuery(employeeListSchema, req.query);
  const result = await listEmployeesService({ companyId: companyId(req), query });
  return res.json({ success: true, data: result.items, pagination: result.pagination });
});

export const createTenantEmployee = asyncHandler(async (req, res) => {
  await assertTargetTenant(companyId(req));
  const data = parseBody(createEmployeeSchema, req.body);
  const result = await createEmployeeService({ companyId: companyId(req), data });
  return res.status(201).json({ success: true, message: "Employee created successfully", data: result });
});

export const getTenantEmployee = asyncHandler(async (req, res) => {
  await assertTargetTenant(companyId(req));
  const result = await getEmployeeService({ companyId: companyId(req), employeeId: req.params.employeeId });
  return res.json({ success: true, data: result });
});

export const updateTenantEmployee = asyncHandler(async (req, res) => {
  await assertTargetTenant(companyId(req));
  const data = parseBody(updateEmployeeSchema, req.body);
  const result = await updateEmployeeService({ companyId: companyId(req), employeeId: req.params.employeeId, data });
  return res.json({ success: true, message: "Employee updated successfully", data: result });
});

export const deleteTenantEmployee = asyncHandler(async (req, res) => {
  await assertTargetTenant(companyId(req));
  const result = await deleteEmployeeService({ companyId: companyId(req), employeeId: req.params.employeeId });
  return res.json({ success: true, message: "Employee deleted successfully", data: result });
});

// Departments. The list deliberately includes active and inactive records so
// platform owners can reactivate them; callers may still pass isActive=true/false.
export const listTenantDepartmentsCrud = asyncHandler(async (req, res) => {
  await assertTargetTenant(companyId(req));
  const query = parseQuery(departmentListQuerySchema, req.query);
  const result = await listDepartmentService({ companyId: companyId(req), query });
  return res.json({ success: true, data: result.items, pagination: result.pagination });
});

export const createTenantDepartment = asyncHandler(async (req, res) => {
  await assertTargetTenant(companyId(req));
  const data = parseBody(createDepartmentSchema, req.body);
  const result = await createDepartmentService({ companyId: companyId(req), data });
  return res.status(201).json({ success: true, message: "Department created successfully", data: result });
});

export const getTenantDepartment = asyncHandler(async (req, res) => {
  await assertTargetTenant(companyId(req));
  const result = await getDepartmentService({ companyId: companyId(req), departmentId: req.params.departmentId });
  return res.json({ success: true, data: result });
});

export const updateTenantDepartment = asyncHandler(async (req, res) => {
  await assertTargetTenant(companyId(req));
  const data = parseBody(updateDepartmentSchema, req.body);
  const result = await updateDepartmentService({ companyId: companyId(req), departmentId: req.params.departmentId, data });
  return res.json({ success: true, message: "Department updated successfully", data: result });
});

export const deleteTenantDepartment = asyncHandler(async (req, res) => {
  await assertTargetTenant(companyId(req));
  const result = await deleteDepartmentService({ companyId: companyId(req), departmentId: req.params.departmentId });
  return res.json({ success: true, message: "Department deleted successfully", data: result });
});

// Designations
export const listTenantDesignationsCrud = asyncHandler(async (req, res) => {
  await assertTargetTenant(companyId(req));
  const query = parseQuery(designationListQuerySchema, req.query);
  const result = await listDesignationService({ companyId: companyId(req), query });
  return res.json({ success: true, data: result.items, pagination: result.pagination });
});

export const createTenantDesignation = asyncHandler(async (req, res) => {
  await assertTargetTenant(companyId(req));
  const data = parseBody(createDesignationSchema, req.body);
  const result = await createDesignationService({ companyId: companyId(req), data });
  return res.status(201).json({ success: true, message: "Designation created successfully", data: result });
});

export const getTenantDesignation = asyncHandler(async (req, res) => {
  await assertTargetTenant(companyId(req));
  const result = await getDesignationService({ companyId: companyId(req), designationId: req.params.designationId });
  return res.json({ success: true, data: result });
});

export const updateTenantDesignation = asyncHandler(async (req, res) => {
  await assertTargetTenant(companyId(req));
  const data = parseBody(updateDesignationSchema, req.body);
  const result = await updateDesignationService({ companyId: companyId(req), designationId: req.params.designationId, data });
  return res.json({ success: true, message: "Designation updated successfully", data: result });
});

export const deleteTenantDesignation = asyncHandler(async (req, res) => {
  await assertTargetTenant(companyId(req));
  const result = await deleteDesignationService({ companyId: companyId(req), designationId: req.params.designationId });
  return res.json({ success: true, message: "Designation deleted successfully", data: result });
});

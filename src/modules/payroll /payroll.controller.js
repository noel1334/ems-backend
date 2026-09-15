import {
  addComponent,
  approvePayroll,
  assignSalary,
  calculatePayroll,
  createPeriod,
  createStructure,
  deactivateStructure,
  finalizePayroll,
  getCompanyId,
  getEmployeePayrollHistory,
  getPeriod,
  listPeriods,
  listStructures,
  updateStructure,
} from "./payroll.service.js";

const success = (res, data, status = 200) => {
  return res.status(status).json({
    success: true,
    data,
  });
};

export const listPayrollStructures = async (req, res) => {
  return success(res, await listStructures(getCompanyId(req), req.query));
};

export const createPayrollStructure = async (req, res) => {
  return success(res, await createStructure(getCompanyId(req), req.body), 201);
};

export const updatePayrollStructure = async (req, res) => {
  return success(
    res,
    await updateStructure(getCompanyId(req), req.params.id, req.body)
  );
};

export const deletePayrollStructure = async (req, res) => {
  return success(
    res,
    await deactivateStructure(getCompanyId(req), req.params.id)
  );
};

export const createComponent = async (req, res) => {
  return success(
    res,
    await addComponent(getCompanyId(req), req.params.structureId, req.body),
    201
  );
};

export const createSalary = async (req, res) => {
  return success(res, await assignSalary(getCompanyId(req), req.body), 201);
};

export const listPayrollPeriods = async (req, res) => {
  return success(res, await listPeriods(getCompanyId(req), req.query));
};

export const createPayrollPeriod = async (req, res) => {
  return success(res, await createPeriod(getCompanyId(req), req.body), 201);
};

export const getPayrollPeriod = async (req, res) => {
  return success(res, await getPeriod(getCompanyId(req), req.params.id));
};

export const calculate = async (req, res) => {
  return success(
    res,
    await calculatePayroll(getCompanyId(req), req.params.id, req.user.id)
  );
};

export const approve = async (req, res) => {
  return success(
    res,
    await approvePayroll(getCompanyId(req), req.params.id, req.user.id)
  );
};

export const finalize = async (req, res) => {
  return success(res, await finalizePayroll(getCompanyId(req), req.params.id));
};

export const employeeHistory = async (req, res) => {
  return success(
    res,
    await getEmployeePayrollHistory(getCompanyId(req), req.params.employeeId)
  );
};

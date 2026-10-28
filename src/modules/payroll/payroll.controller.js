import {
  executePayrollPayouts, verifyPayrollPayout, getPayrollPayoutConfiguration,
  previewPayrollPayoutBatch, approvePayrollPayoutBatch, getPayrollPayoutBatch, retryFailedPayrollPayout,
  reconcilePayrollPayoutFee,
} from "./payroll.payout.service.js";

import {
  addComponent,
  updateComponent as updatePayrollComponent,
  deactivateComponent,
  approvePayroll,
  assignSalary,
  calculatePayroll,
  createPeriod,
  updatePeriod,
  deletePeriod,
  setPeriodActive,
  createStructure,
  finalizePayroll,
  reopenPayrollForCorrection,
  listPayrollDisbursements,
  preparePayrollDisbursements,
  updatePayrollDisbursement,
  getCompanyId,
  getEmployeePayrollHistory,
  getPeriod,
  listPeriods,
  listStructures,
  listEmployeeSalaries,
  updateSalaryStatus,
  deleteStructurePermanently,
  updateStructure,
} from "./payroll.service.js";

const success = (res, data, status = 200) => {
  return res.status(status).json({
    success: true,
    data,
  });
};

export const listPayrollStructures = async (req, res) => {
  return success(res, await listStructures(getCompanyId(req), req.validatedQuery ?? req.query));
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
    await deleteStructurePermanently(getCompanyId(req), req.params.id)
  );
};

export const createComponent = async (req, res) => {
  return success(
    res,
    await addComponent(getCompanyId(req), req.params.structureId, req.body),
    201
  );
};

export const updateComponent = async (req, res) => {
  return success(
    res,
    await updatePayrollComponent(
      getCompanyId(req),
      req.params.structureId,
      req.params.componentId,
      req.body
    )
  );
};

export const deleteComponent = async (req, res) => {
  return success(
    res,
    await deactivateComponent(
      getCompanyId(req),
      req.params.structureId,
      req.params.componentId
    )
  );
};

export const listSalaries = async (req, res) => {
  return success(res, await listEmployeeSalaries(getCompanyId(req), req.validatedQuery ?? req.query));
};

export const setSalaryStatus = async (req, res) => {
  return success(res, await updateSalaryStatus(getCompanyId(req), req.params.id, req.body.status));
};

export const createSalary = async (req, res) => {
  return success(res, await assignSalary(getCompanyId(req), req.body), 201);
};

export const listPayrollPeriods = async (req, res) => {
  return success(res, await listPeriods(getCompanyId(req), req.validatedQuery ?? req.query));
};

export const createPayrollPeriod = async (req, res) => {
  return success(res, await createPeriod(getCompanyId(req), req.body), 201);
};

export const updatePayrollPeriod = async (req, res) => {
  return success(res, await updatePeriod(getCompanyId(req), req.params.id, req.body, req.user.userId));
};

export const deletePayrollPeriod = async (req, res) => {
  return success(res, await deletePeriod(getCompanyId(req), req.params.id, req.user.userId));
};

export const setPayrollPeriodActive = async (req, res) => {
  return success(res, await setPeriodActive(getCompanyId(req), req.params.id, req.body.isActive, req.user.userId));
};

export const getPayrollPeriod = async (req, res) => {
  return success(res, await getPeriod(getCompanyId(req), req.params.id));
};

export const calculate = async (req, res) => {
  return success(
    res,
    await calculatePayroll(getCompanyId(req), req.params.id, req.user.userId)
  );
};

export const approve = async (req, res) => {
  return success(
    res,
    await approvePayroll(getCompanyId(req), req.params.id, req.user.userId)
  );
};

export const finalize = async (req, res) => {
  return success(res, await finalizePayroll(getCompanyId(req), req.params.id, req.user.userId));
};

export const employeeHistory = async (req, res) => {
  return success(
    res,
    await getEmployeePayrollHistory(getCompanyId(req), req.params.employeeId)
  );
};


export const reopenForCorrection = async (req, res) => success(res, await reopenPayrollForCorrection(getCompanyId(req), req.params.id, req.user.userId, req.body.reason));
export const listDisbursements = async (req, res) => success(res, await listPayrollDisbursements(getCompanyId(req), req.params.id));
export const prepareDisbursements = async (req, res) => success(res, await preparePayrollDisbursements(getCompanyId(req), req.params.id, req.user.userId), 201);
export const updateDisbursement = async (req, res) => success(res, await updatePayrollDisbursement(getCompanyId(req), req.params.disbursementId, req.user.userId, req.body));
export const executeDisbursementPayouts = async (req, res) => success(res, await executePayrollPayouts(getCompanyId(req), req.params.id, req.user.userId, req.body.provider), 202);
export const verifyDisbursementPayout = async (req, res) => success(res, await verifyPayrollPayout(getCompanyId(req), req.params.disbursementId, req.user.userId));

export const getPayoutConfiguration = async (req, res) => success(res, await getPayrollPayoutConfiguration());

export const getPayoutBatch = async (req, res) => success(res, await getPayrollPayoutBatch(getCompanyId(req), req.params.id));
export const previewPayoutBatch = async (req, res) => success(res, await previewPayrollPayoutBatch(getCompanyId(req), req.params.id, req.user.userId, req.body.provider));
export const approvePayoutBatch = async (req, res) => success(res, await approvePayrollPayoutBatch(getCompanyId(req), req.params.id, req.user.userId));
export const retryDisbursementPayout = async (req, res) => success(res, await retryFailedPayrollPayout(getCompanyId(req), req.params.disbursementId, req.user.userId, req.body?.provider), 202);
export const reconcileDisbursementPayoutFee = async (req, res) => success(res, await reconcilePayrollPayoutFee(getCompanyId(req), req.params.disbursementId, req.user.userId, req.body));

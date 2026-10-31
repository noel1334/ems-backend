import * as service from "./monnify.service.js";
const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
export const connection = async (req,res) => ok(res, await service.getConnection(req.user.companyId));
export const save = async (req,res) => ok(res, await service.saveConnection(req.user.companyId, req.body));
export const remove = async (req,res) => ok(res, await service.removeConnection(req.user.companyId));
export const test = async (req,res) => ok(res, await service.testConnection(req.user.companyId));
export const banks = async (req,res) => ok(res, await service.listBanks(req.user.companyId));
export const validate = async (req,res) => ok(res, await service.validateAccount(req.user.companyId, req.body.accountNumber, req.body.bankCode));
export const submit = async (req,res) => ok(res, await service.submitBatch(req.user.companyId, req.body.payrollPeriodId, req.user.userId, req.body), 202);
export const authorize = async (req,res) => ok(res, await service.authorizeBatch(req.user.companyId, req.params.id, req.body.otp));
export const refresh = async (req,res) => ok(res, await service.refreshBatch(req.user.companyId, req.params.id));
export const batches = async (req,res) => ok(res, await service.listBatches(req.user.companyId));

export const payrollPreview = async (req,res) => ok(res, await service.previewPayroll(req.user.companyId, req.params.periodId));
export const payrollSubmit = async (req,res) => ok(res, await service.submitPayroll(req.user.companyId, req.params.periodId, req.user.userId), 202);
export const payrollRefresh = async (req,res) => ok(res, await service.refreshPayrollBatch(req.user.companyId, req.params.id));

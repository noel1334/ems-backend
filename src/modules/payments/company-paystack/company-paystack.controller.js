import * as service from "./company-paystack.service.js";
const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
export const connection = async (req, res) => ok(res, await service.getConnection(req.user.companyId));
export const save = async (req, res) => ok(res, await service.saveConnection(req.user.companyId, req.body?.secretKey));
export const remove = async (req, res) => ok(res, await service.removeConnection(req.user.companyId));
export const test = async (req, res) => ok(res, await service.testConnection(req.user.companyId));
export const banks = async (req, res) => ok(res, await service.listBanks(req.user.companyId));
export const batches = async (req, res) => ok(res, await service.listBatches(req.user.companyId));
export const preview = async (req, res) => ok(res, await service.previewPayroll(req.user.companyId, req.body?.payrollPeriodId));
export const submit = async (req, res) => ok(res, await service.submitPayroll(req.user.companyId, req.body?.payrollPeriodId, req.user.userId, req.body?.previewFingerprint), 202);
export const authorize = async (req, res) => ok(res, await service.authorizeSingleTransfer(req.user.companyId, req.params.id, req.body?.otp));
export const refresh = async (req, res) => ok(res, await service.refreshBatch(req.user.companyId, req.params.id));

export const singlePayrollSubmit = async (req, res) => ok(res, await service.submitSinglePayrollTransfer(req.user.companyId, req.params.periodId, req.params.disbursementId, req.user.userId), 202);
export const singlePayrollAuthorize = async (req, res) => ok(res, await service.authorizeSinglePayrollTransfer(req.user.companyId, req.params.disbursementId, req.body?.otp));
export const singlePayrollRefresh = async (req, res) => ok(res, await service.refreshSinglePayrollTransfer(req.user.companyId, req.params.disbursementId));

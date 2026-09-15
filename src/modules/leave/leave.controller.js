import asyncHandler from "../../common/utils/asyncHandler.js";
import * as service from "./leave.service.js";
const ok = (res, data, status = 200) =>
  res.status(status).json({ success: true, data });
export const listTypes = asyncHandler(async (req, res) =>
  ok(res, await service.listTypes(req))
);
export const getType = asyncHandler(async (req, res) =>
  ok(res, await service.getType(req))
);
export const createType = asyncHandler(async (req, res) =>
  ok(res, await service.createType(req), 201)
);
export const updateType = asyncHandler(async (req, res) =>
  ok(res, await service.updateType(req))
);
export const deleteType = asyncHandler(async (req, res) =>
  ok(res, await service.deleteType(req))
);
export const listBalances = asyncHandler(async (req, res) =>
  ok(res, await service.listBalances(req))
);
export const initializeBalance = asyncHandler(async (req, res) =>
  ok(res, await service.initializeBalance(req), 201)
);
export const adjustBalance = asyncHandler(async (req, res) =>
  ok(res, await service.adjustBalance(req))
);
export const listRequests = asyncHandler(async (req, res) =>
  ok(res, await service.listRequests(req))
);
export const getRequest = asyncHandler(async (req, res) =>
  ok(res, await service.getRequest(req))
);
export const createRequest = asyncHandler(async (req, res) =>
  ok(res, await service.createRequest(req), 201)
);
export const updateRequest = asyncHandler(async (req, res) =>
  ok(res, await service.updateRequest(req))
);
export const approveRequest = asyncHandler(async (req, res) =>
  ok(res, await service.approveRequest(req))
);
export const rejectRequest = asyncHandler(async (req, res) =>
  ok(res, await service.rejectRequest(req))
);
export const cancelRequest = asyncHandler(async (req, res) =>
  ok(res, await service.cancelRequest(req))
);
export const employeeHistory = asyncHandler(async (req, res) =>
  ok(res, await service.employeeHistory(req))
);
export const reportSummary = asyncHandler(async (req, res) =>
  ok(res, await service.reportSummary(req))
);

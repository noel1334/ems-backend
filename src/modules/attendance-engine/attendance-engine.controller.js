import asyncHandler from "../../common/utils/asyncHandler.js";
import { processAttendanceRange } from "./attendance-engine.service.js";

export const processAttendanceRangeController = asyncHandler(async (req, res) => {
  const result = await processAttendanceRange({
    companyId: req.user.companyId,
    ...req.body,
  });
  return res.status(200).json({ success: true, message: "Attendance engine processed successfully", data: result });
});

import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import * as c from "./self-service.controller.js";

const router = Router();
router.use(authenticate);
router.get("/me", c.profile);
router.get("/attendance", c.attendance);
// These endpoints derive employee identity from the authenticated user; the
// client cannot submit another employee's ID for self-service clock actions.
router.post("/attendance/check-in", c.checkInAttendance);
router.post("/attendance/check-out", c.checkOutAttendance);
router.post("/attendance/break/start", c.startAttendanceBreak);
router.post("/attendance/break/end", c.endAttendanceBreak);
router.get("/schedule", c.schedule);
router.get("/leave", c.leave);
router.get("/payslips", c.payslips);
export default router;

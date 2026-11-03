import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";
import * as c from "./scheduling.controller.js";
import * as draftController from "./scheduling.draft.controller.js";
const router=Router();router.use(authenticate);
router.get("/policies",requirePermission("scheduling","policies","READ"),c.listPolicies);
router.post("/policies",requirePermission("scheduling","policies","CREATE"),c.createPolicy);
router.get("/policies/:id",requirePermission("scheduling","policies","READ"),c.getPolicy);
router.patch("/policies/:id",requirePermission("scheduling","policies","UPDATE"),c.updatePolicy);
router.get("/timetable",requirePermission("scheduling","generations","READ"),c.departmentTimetable);
// Employees can only query their own published assignments; the service derives
// the employee link from the authenticated token and revalidates it in the DB.
router.get("/me",c.myPublishedSchedule);
router.get("/generations",requirePermission("scheduling","generations","READ"),c.listGenerations);
router.post("/generations",requirePermission("scheduling","generations","CREATE"),c.generate);
router.get("/generations/:id",requirePermission("scheduling","generations","READ"),c.getGeneration);
router.patch("/generations/:id/assignments", requirePermission("scheduling", "generations", "CREATE"), draftController.updateTenantAssignments);
router.post("/generations/:id/approve",requirePermission("scheduling","generations","APPROVE"),c.approve);
router.post("/generations/:id/publish",requirePermission("scheduling","generations","MANAGE"),c.publish);
export default router;

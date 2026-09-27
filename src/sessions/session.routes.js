import { Router } from "express";
import { createSessionController } from "./session.controller.js";
import prisma from "../config/database.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();
const controller = createSessionController(prisma);

router.use(authMiddleware);
router.get("/", controller.list);
router.delete("/:id", controller.revoke);
router.delete("/", controller.revokeAll);

export default router;

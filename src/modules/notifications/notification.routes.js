import { Router } from "express";
import authenticate from "../../middleware/auth.middleware.js";
import * as controller from "./notification.controller.js";

const router = Router();
router.use(authenticate);
router.get("/", controller.list);
router.patch("/:id/read", controller.read);
router.patch("/read-all", controller.readAll);
router.delete("/:id", controller.remove);
export default router;

import { Router } from "express";
import {
  authHealth,
    getCurrentUser
    } from "./auth.controller.js";

    const router = Router();

    router.get("/health", authHealth);

    router.get("/me", getCurrentUser);

    export default router;
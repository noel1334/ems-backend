import { Router } from "express";
import companyRoutes from "../modules/companies/company.routes.js";

const router = Router();

// ============================================================
// HEALTH
// ============================================================

router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "EMS API is running",
    data: {
      service: "ems-backend",
      environment: process.env.NODE_ENV || "development",
    },
    requestId: req.requestId,
  });
});

// ============================================================
// COMPANY
// ============================================================

router.use("/companies", companyRoutes);

export default router;

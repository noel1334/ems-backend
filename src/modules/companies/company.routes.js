import { Router } from "express";
import {
  createCompany,
  getCompany,
  updateCompany,
} from "./company.controller.js";

const router = Router();

/*
 * Public company creation endpoint.
 *
 * The full onboarding flow will later be made atomic:
 *
 * Company
 *   +
 * Initial Company Admin
 *   +
 * Role assignment
 *   +
 * Session/authentication
 *
 * That will be handled during the authentication/bootstrap stage.
 */

router.post("/", createCompany);

router.get("/me", getCompany);

router.patch("/me", updateCompany);

export default router;

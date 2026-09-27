import { Router } from "express";
import { getWallet, getTransactions, credit, debit, walletConsistency, walletSummary } from "./wallet.controller.js";
import { creditWalletSchema, debitWalletSchema, validateWalletBody, validateWalletQuery, walletTransactionQuerySchema } from "./wallet.validation.js";
import authenticate from "../../middleware/auth.middleware.js";
import requirePermission from "../../middleware/permission.middleware.js";
import fundingRoutes from "./funding/funding.routes.js";

const router = Router();
router.use(authenticate);
router.use("/funding", fundingRoutes);
router.get("/", requirePermission("wallet", "wallet", "READ"), getWallet);
router.get("/transactions", requirePermission("wallet", "wallet", "READ"), validateWalletQuery(walletTransactionQuerySchema), getTransactions);
router.post("/credit", requirePermission("wallet", "wallet", "MANAGE"), validateWalletBody(creditWalletSchema), credit);
router.post("/debit", requirePermission("wallet", "wallet", "MANAGE"), validateWalletBody(debitWalletSchema), debit);
router.get("/consistency", requirePermission("wallet", "wallet", "MANAGE"), walletConsistency);
router.get("/summary", requirePermission("wallet", "wallet", "READ"), walletSummary);
export default router;

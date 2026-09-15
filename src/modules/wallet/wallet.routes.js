import { Router } from "express";

import {
  credit,
  debit,
  getTransactions,
  getWallet,
  walletConsistency,
  walletSummary,
} from "./wallet.controller.js";

import {
  creditWalletSchema,
  debitWalletSchema,
  validateWalletBody,
  validateWalletQuery,
  walletTransactionQuerySchema,
} from "./wallet.validators.js";

import { authenticate } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";

const router = Router();

router.use(authenticate);

/*
 * Wallet balance
 */
router.get("/", requirePermission("wallet:read"), getWallet);

/*
 * Wallet transaction history
 */
router.get(
  "/transactions",
  requirePermission("wallet:read"),
  validateWalletQuery(walletTransactionQuerySchema),
  getTransactions
);

/*
 * Credit wallet.
 *
 * This endpoint is intended for authorized
 * administrative/manual wallet operations.
 *
 * Provider payment credits will later go
 * through Stage 14 Payments.
 */
router.post(
  "/credit",
  requirePermission("wallet:manage"),
  validateWalletBody(creditWalletSchema),
  credit
);

/*
 * Debit wallet.
 */
router.post(
  "/debit",
  requirePermission("wallet:manage"),
  validateWalletBody(debitWalletSchema),
  debit
);

/*
 * Internal/admin consistency check.
 */
router.get(
  "/consistency",
  requirePermission("wallet:manage"),
  walletConsistency
);

/*
 * Administrative wallet summary.
 */
router.get("/summary", requirePermission("wallet:read"), walletSummary);

export default router;

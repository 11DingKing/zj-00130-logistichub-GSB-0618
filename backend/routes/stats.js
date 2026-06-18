const express = require("express");
const router = express.Router();
const statsController = require("../controllers/statsController");
const { authenticateToken, requireRole } = require("../middleware/auth");

router.get("/overview", authenticateToken, statsController.getOverviewStats);
router.get(
  "/warehouse-utilization",
  authenticateToken,
  statsController.getWarehouseUtilization,
);
router.get(
  "/turnover",
  authenticateToken,
  statsController.getInventoryTurnover,
);
router.get(
  "/timeliness",
  authenticateToken,
  statsController.getTimelinessStats,
);
router.get(
  "/slow-moving-ratio",
  authenticateToken,
  statsController.getSlowMovingRatio,
);
router.get(
  "/transactions",
  authenticateToken,
  statsController.getTransactionStats,
);
router.get(
  "/warehouse-turnover",
  authenticateToken,
  statsController.getWarehouseTurnover,
);
router.get(
  "/warehouse-income",
  authenticateToken,
  statsController.getWarehouseIncome,
);
router.get("/income-trend", authenticateToken, statsController.getIncomeTrend);
router.get(
  "/merchant/overview",
  authenticateToken,
  requireRole("merchant"),
  statsController.getMerchantOverview,
);
router.get(
  "/merchant/billing",
  authenticateToken,
  requireRole("merchant"),
  statsController.getMerchantBillingStats,
);

module.exports = router;

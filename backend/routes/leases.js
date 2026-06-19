const express = require("express");
const router = express.Router();
const leaseController = require("../controllers/leaseController");
const { authenticateToken, requireRole } = require("../middleware/auth");

router.get("/", authenticateToken, leaseController.getAllLeases);
router.get(
  "/merchant/my",
  authenticateToken,
  requireRole("merchant"),
  leaseController.getMyLeases,
);
router.get("/:id", authenticateToken, leaseController.getLeaseById);
router.post(
  "/",
  authenticateToken,
  requireRole("merchant"),
  leaseController.createLease,
);
router.put(
  "/:id",
  authenticateToken,
  requireRole("admin"),
  leaseController.updateLease,
);
router.put(
  "/:id/approve",
  authenticateToken,
  requireRole("admin"),
  leaseController.approveLease,
);
router.put("/:id/terminate", authenticateToken, leaseController.terminateLease);

module.exports = router;

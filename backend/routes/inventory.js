const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.get('/', authenticateToken, inventoryController.getAllInventory);
router.get('/merchant/my', authenticateToken, requireRole('merchant'), inventoryController.getMyInventory);
router.get('/batch/:batchId', authenticateToken, inventoryController.getBatchDetail);
router.get('/location/:locationId', authenticateToken, inventoryController.getInventoryByLocation);
router.get('/slow-moving', authenticateToken, inventoryController.getSlowMovingInventory);
router.get('/near-expiry', authenticateToken, inventoryController.getNearExpiryInventory);
router.get('/expired', authenticateToken, inventoryController.getExpiredInventory);
router.post('/check-slow-moving', authenticateToken, requireRole('admin'), inventoryController.checkSlowMoving);

module.exports = router;

const express = require('express');
const router = express.Router();
const warehouseController = require('../controllers/warehouseController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.get('/', authenticateToken, warehouseController.getAllWarehouses);
router.get('/:id', authenticateToken, warehouseController.getWarehouseById);
router.post('/', authenticateToken, requireRole('admin'), warehouseController.createWarehouse);
router.put('/:id', authenticateToken, requireRole('admin'), warehouseController.updateWarehouse);
router.delete('/:id', authenticateToken, requireRole('admin'), warehouseController.deleteWarehouse);
router.get('/:id/utilization', authenticateToken, warehouseController.getWarehouseUtilization);

module.exports = router;

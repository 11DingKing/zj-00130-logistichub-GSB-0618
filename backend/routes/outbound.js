const express = require('express');
const router = express.Router();
const outboundController = require('../controllers/outboundController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.get('/', authenticateToken, outboundController.getAllOutboundOrders);
router.get('/:id', authenticateToken, outboundController.getOutboundOrderById);
router.get('/merchant/my', authenticateToken, requireRole('merchant'), outboundController.getMyOutboundOrders);
router.post('/', authenticateToken, requireRole('merchant'), outboundController.createOutboundOrder);
router.post('/:id/allocate', authenticateToken, requireRole('admin'), outboundController.allocateStock);
router.put('/:id/pick', authenticateToken, requireRole('admin'), outboundController.confirmPick);
router.put('/:id/complete', authenticateToken, requireRole('admin'), outboundController.completeOutboundOrder);

module.exports = router;

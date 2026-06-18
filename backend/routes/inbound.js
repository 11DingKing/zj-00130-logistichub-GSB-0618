const express = require('express');
const router = express.Router();
const inboundController = require('../controllers/inboundController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.get('/', authenticateToken, inboundController.getAllInboundOrders);
router.get('/:id', authenticateToken, inboundController.getInboundOrderById);
router.get('/merchant/my', authenticateToken, requireRole('merchant'), inboundController.getMyInboundOrders);
router.post('/', authenticateToken, requireRole('merchant'), inboundController.createInboundOrder);
router.put('/:id/check', authenticateToken, requireRole('admin'), inboundController.checkInboundOrder);
router.put('/:id/putaway', authenticateToken, requireRole('admin'), inboundController.putawayItems);
router.put('/:id/complete', authenticateToken, requireRole('admin'), inboundController.completeInboundOrder);
router.post('/:id/items', authenticateToken, requireRole('merchant'), inboundController.addInboundItem);

module.exports = router;

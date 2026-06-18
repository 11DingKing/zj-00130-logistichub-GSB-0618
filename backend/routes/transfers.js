const express = require('express');
const router = express.Router();
const transferController = require('../controllers/transferController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.get('/', authenticateToken, transferController.getAllTransfers);
router.get('/merchant/my', authenticateToken, requireRole('merchant'), transferController.getMyTransfers);
router.get('/available-locations', authenticateToken, transferController.getAvailableLocationsForTransfer);
router.get('/:id', authenticateToken, transferController.getTransferById);
router.post('/', authenticateToken, transferController.createTransfer);
router.put('/:id/process', authenticateToken, requireRole('admin'), transferController.processTransfer);
router.put('/:id/complete', authenticateToken, requireRole('admin'), transferController.completeTransfer);
router.put('/:id/cancel', authenticateToken, transferController.cancelTransfer);

module.exports = router;

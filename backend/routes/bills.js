const express = require('express');
const router = express.Router();
const billController = require('../controllers/billController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.get('/', authenticateToken, billController.getAllBills);
router.get('/merchant/my', authenticateToken, requireRole('merchant'), billController.getMyBills);
router.get('/summary', authenticateToken, requireRole('admin'), billController.getBillingSummary);
router.get('/:id', authenticateToken, billController.getBillById);
router.post('/generate-monthly', authenticateToken, requireRole('admin'), billController.generateMonthlyBills);
router.put('/:id/paid', authenticateToken, requireRole('admin'), billController.markBillPaid);
router.put('/:id/overdue', authenticateToken, requireRole('admin'), billController.markBillOverdue);
router.put('/:id/cancel', authenticateToken, requireRole('admin'), billController.cancelBill);

module.exports = router;

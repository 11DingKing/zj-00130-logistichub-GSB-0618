const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.get('/', authenticateToken, requireRole('admin'), userController.getAllUsers);
router.get('/merchants', authenticateToken, userController.getMerchants);
router.get('/:id', authenticateToken, userController.getUserById);
router.post('/', authenticateToken, requireRole('admin'), userController.createUser);
router.put('/:id', authenticateToken, userController.updateUser);
router.delete('/:id', authenticateToken, requireRole('admin'), userController.deleteUser);

module.exports = router;

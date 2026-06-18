const express = require('express');
const router = express.Router();
const locationController = require('../controllers/locationController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.get('/', authenticateToken, locationController.getAllLocations);
router.get('/:id', authenticateToken, locationController.getLocationById);
router.get('/warehouse/:warehouseId', authenticateToken, locationController.getLocationsByWarehouse);
router.post('/', authenticateToken, requireRole('admin'), locationController.createLocation);
router.put('/:id', authenticateToken, requireRole('admin'), locationController.updateLocation);
router.delete('/:id', authenticateToken, requireRole('admin'), locationController.deleteLocation);
router.get('/available/for-lease', authenticateToken, locationController.getAvailableLocationsForLease);

module.exports = router;

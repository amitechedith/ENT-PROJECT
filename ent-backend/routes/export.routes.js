const express = require('express');
const router = express.Router();
const exportController = require('../controllers/export.controller');

router.post('/patient-history', exportController.exportPatientHistoryBackup);
router.get('/patient-history/download', exportController.downloadPatientHistoryBackup);

module.exports = router;

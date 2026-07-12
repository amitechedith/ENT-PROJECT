const express = require('express');
const router = express.Router();
const exportController = require('../controllers/export.controller');

router.post('/patient-history', exportController.exportPatientHistoryBackup);
router.get('/patient-history/download', exportController.downloadPatientHistoryBackup);
router.post('/government-report', exportController.exportGovernmentReport);
router.post('/sql', exportController.exportFullDatabaseSqlBackup);
router.get('/sql/download', exportController.downloadFullDatabaseSqlBackup);
router.post('/sql/import', exportController.importFullDatabaseSqlBackup);
router.post('/sql/tables', exportController.exportSqlTableBackups);
router.get('/sql/tables/:table/download', exportController.downloadSqlTableBackup);
router.post('/sql/tables/import', exportController.importSqlTableBackups);

module.exports = router;

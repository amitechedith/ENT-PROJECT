const express = require('express');
const router = express.Router();
const masterController = require('../controllers/master.controller');

router.get('/medicines', masterController.getMedicines);
router.post('/medicines', masterController.addMedicine);

router.get('/diagnoses', masterController.getDiagnoses);
router.post('/diagnoses', masterController.addDiagnosis);

router.get('/dosages', masterController.getDosages);
router.post('/dosages', masterController.addDosage);

module.exports = router;

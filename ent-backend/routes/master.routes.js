const express = require('express');
const router = express.Router();
const masterController = require('../controllers/master.controller');

router.get('/medicines', masterController.getMedicines);
router.post('/medicines', masterController.addMedicine);
router.delete('/medicines', masterController.deleteMedicine);

router.get('/diagnoses', masterController.getDiagnoses);
router.post('/diagnoses', masterController.addDiagnosis);
router.delete('/diagnoses', masterController.deleteDiagnosis);

router.get('/dosages', masterController.getDosages);
router.post('/dosages', masterController.addDosage);
router.delete('/dosages', masterController.deleteDosage);

module.exports = router;

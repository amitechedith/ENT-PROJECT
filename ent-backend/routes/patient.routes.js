const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patient.controller');
const prescriptionController = require('../controllers/prescription.controller');

// Patient Routes
// Patient Routes
router.get('/', patientController.getPatients);
router.get('/next-token', patientController.getNextToken);
router.get('/date-summaries', patientController.getPatientDateSummaries);
router.get('/:id', patientController.getPatientById);
router.post('/', patientController.createPatient);
router.patch('/:id/status', patientController.updatePatientStatus);
router.put('/:id', patientController.updatePatient);
router.delete('/:id', patientController.deletePatient);
router.put('/:id/diagnosis', patientController.updateDiagnosis);

// Prescription Routes (Nested or separate)
// Separate: /api/prescriptions
// or /api/patients/:id/prescriptions
// Let's do separate for POST, nested for GET
router.post('/:id/prescriptions', async (req, res, next) => {
    req.body.patientId = req.params.id; // ensure ID linkage
    prescriptionController.savePrescription(req, res);
});
router.get('/:patientId/prescriptions', prescriptionController.getPatientPrescriptions);


module.exports = router;

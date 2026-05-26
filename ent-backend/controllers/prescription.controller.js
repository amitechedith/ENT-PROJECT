const db = require('../config/db.config');

exports.savePrescription = async (req, res) => {
    try {
        const { patientId, date, notes, nextVisitDate, medicines } = req.body;

        const [resPres] = await db.query(
            'INSERT INTO prescriptions (patientId, date, notes, nextVisitDate) VALUES (?, ?, ?, ?)',
            [patientId, date, notes, nextVisitDate]
        );
        const prescriptionId = resPres.insertId;

        // Save medicines
        for (const med of medicines) {
            // Ensure medicine master exists
            let medId = med.medicineId;
            if (!medId) {
                // Try find by name or create
                const [existing] = await db.query('SELECT id FROM medicines WHERE name = ?', [med.medicineName]);
                if (existing.length > 0) {
                    medId = existing[0].id;
                } else {
                    const [newMed] = await db.query('INSERT INTO medicines (name) VALUES (?)', [med.medicineName]);
                    medId = newMed.insertId;
                }
            }

            await db.query(
                `INSERT INTO prescription_medicines 
                (prescriptionId, medicineId, medicineName, dosage, duration, instructions) 
                VALUES (?, ?, ?, ?, ?, ?)`,
                [prescriptionId, medId, med.medicineName, med.dosage, med.duration, med.instructions]
            );
        }

        // Update patient status to Payment Done? Or keep In Consultation? 
        // User flow: Doctor saves -> "Payment Pending" maybe? Leaving status as is for now or doctor updates manually.

        res.json({ message: 'Prescription saved', id: prescriptionId });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error saving prescription' });
    }
};

exports.getPatientPrescriptions = async (req, res) => {
    try {
        const patientId = req.params.patientId;
        const [prescriptions] = await db.query('SELECT * FROM prescriptions WHERE patientId = ? ORDER BY date DESC', [patientId]);

        for (let p of prescriptions) {
            const [meds] = await db.query('SELECT * FROM prescription_medicines WHERE prescriptionId = ?', [p.id]);
            p.medicines = meds; // Attach detail
        }
        res.json(prescriptions);

    } catch (error) {
        res.status(500).json({ message: 'Error fetching history' });
    }
};

const db = require('../config/db.config');

function normalizeDateValue(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.trim().split('T')[0];
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

exports.savePrescription = async (req, res) => {
    try {
        const { patientId, date, notes, nextVisitDate, medicines } = req.body;

        const prescriptionDate = normalizeDateValue(date);
        if (!prescriptionDate) {
            return res.status(400).json({ message: 'Invalid prescription date' });
        }

        const normalizedNextVisitDate = normalizeDateValue(nextVisitDate) || null;
        const medicineList = Array.isArray(medicines) ? medicines : [];

        const [sameDayRows] = await db.query(
            'SELECT id FROM prescriptions WHERE patientId = ? AND date = ? ORDER BY id DESC',
            [patientId, prescriptionDate]
        );

        let prescriptionId;
        if (sameDayRows.length > 0) {
            prescriptionId = sameDayRows[0].id;
            const duplicateIds = sameDayRows.slice(1).map(row => row.id);

            if (duplicateIds.length > 0) {
                await db.query('DELETE FROM prescription_medicines WHERE prescriptionId IN (?)', [duplicateIds]);
                await db.query('DELETE FROM prescriptions WHERE id IN (?)', [duplicateIds]);
            }

            await db.query(
                'UPDATE prescriptions SET notes = ?, nextVisitDate = ? WHERE id = ?',
                [notes || '', normalizedNextVisitDate, prescriptionId]
            );

            await db.query('DELETE FROM prescription_medicines WHERE prescriptionId = ?', [prescriptionId]);
        } else {
            const [resPres] = await db.query(
                'INSERT INTO prescriptions (patientId, date, notes, nextVisitDate) VALUES (?, ?, ?, ?)',
                [patientId, prescriptionDate, notes || '', normalizedNextVisitDate]
            );
            prescriptionId = resPres.insertId;
        }

        console.log('Medicines to save:', medicineList);

        // Save medicines
        for (const med of medicineList) {
            // Ensure medicine master exists
            let medId = med.medicineId;
            console.log('Processing medicine:', med);
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

        res.json({
            message: sameDayRows.length > 0 ? 'Prescription updated' : 'Prescription saved',
            id: prescriptionId,
            date: prescriptionDate
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error saving prescription' });
    }
};

exports.getPatientPrescriptions = async (req, res) => {
    try {
        const patientId = req.params.patientId;
        const [prescriptions] = await db.query(
            `
            SELECT p.id,
                   p.patientId,
                   DATE_FORMAT(p.date, '%Y-%m-%d') AS date,
                   p.notes,
                   CASE
                       WHEN p.nextVisitDate IS NULL THEN NULL
                       ELSE DATE_FORMAT(p.nextVisitDate, '%Y-%m-%d')
                   END AS nextVisitDate
            FROM prescriptions p
            INNER JOIN (
                SELECT MAX(id) AS id
                FROM prescriptions
                WHERE patientId = ?
                GROUP BY date
            ) latest ON latest.id = p.id
            WHERE p.patientId = ?
            ORDER BY p.date DESC, p.id DESC
            `,
            [patientId, patientId]
        );

        for (let p of prescriptions) {
            const [meds] = await db.query(
                'SELECT * FROM prescription_medicines WHERE prescriptionId = ? ORDER BY id ASC',
                [p.id]
            );
            p.medicines = meds; // Attach detail
        }
        res.json(prescriptions);

    } catch (error) {
        res.status(500).json({ message: 'Error fetching history' });
    }
};

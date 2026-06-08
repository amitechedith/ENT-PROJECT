const db = require('../config/db.config');
const LOCAL_TIME_ZONE = process.env.APP_TIME_ZONE || 'Asia/Kolkata';

function normalizeDateValue(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.trim().split('T')[0];
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function getLocalDateKey(dateValue = new Date()) {
    if (dateValue instanceof Date) {
        return new Intl.DateTimeFormat('en-CA', { timeZone: LOCAL_TIME_ZONE }).format(dateValue);
    }

    const normalized = String(dateValue).trim().split('T')[0];
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
}

function normalizePatientDates(patient) {
    return {
        ...patient,
        latestVisitDate: patient.latestVisitDate ? getLocalDateKey(patient.latestVisitDate) : null
    };
}

// Get all patients or filtered by date (for today's list)
exports.getPatients = async (req, res) => {
    try {
        const requestedDate = normalizeDateValue(req.query.date);
        const query = requestedDate
            ? 'SELECT * FROM patients WHERE latestVisitDate = ? ORDER BY FIELD(status, "In Consultation", "Waiting", "Payment Done")'
            : 'SELECT * FROM patients ORDER BY FIELD(status, "In Consultation", "Waiting", "Payment Done")';

        const [patients] = requestedDate
            ? await db.query(query, [requestedDate])
            : await db.query(query);

        // For each patient, attach diagnoses
        for (let p of patients) {
            const [diags] = await db.query('SELECT diagnosisName FROM patient_diagnoses WHERE patientId = ?', [p.id]);
            p.currentDiagnosis = diags.map(d => d.diagnosisName);
            p.paymentMode = p.paymentMode || 'QR';
            // also fake prescriptions empty array for existing frontend compatibility if needed
            // p.prescriptions = []; 
        }

        res.json(patients.map(normalizePatientDates));
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching patients' });
    }
};

exports.getPatientDateSummaries = async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT DATE_FORMAT(latestVisitDate, '%Y-%m-%d') AS date,
                   COUNT(*) AS count
            FROM patients
            WHERE latestVisitDate IS NOT NULL
            GROUP BY latestVisitDate
            ORDER BY latestVisitDate DESC
        `);

        res.json(rows.map(row => ({
            date: row.date,
            count: Number(row.count) || 0
        })));
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching patient date summaries' });
    }
};

exports.getPatientById = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM patients WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Patient not found' });

        const patient = normalizePatientDates(rows[0]);
        const [diags] = await db.query('SELECT diagnosisName FROM patient_diagnoses WHERE patientId = ?', [patient.id]);
        patient.currentDiagnosis = diags.map(d => d.diagnosisName);
        patient.paymentMode = patient.paymentMode || 'QR';

        res.json(patient);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching patient' });
    }
}

exports.getNextToken = async (req, res) => {
    try {
        const todayKey = getLocalDateKey();
        const [rows] = await db.query('SELECT MAX(tokenNumber) as maxToken FROM patients WHERE latestVisitDate = ?', [todayKey]);
        const nextToken = (rows[0].maxToken || 0) + 1;
        console.log("Next Token Calculated:", nextToken);
        res.json({ nextToken });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching next token' });
    }
};

exports.createPatient = async (req, res) => {
    try {
        const { name, age, gender, mobile, visitReason, consultationFee, tokenNumber, paymentMode } = req.body;
        console.log("Create Patient Body:", req.body);

        const finalMobile = typeof mobile === 'string' ? mobile.trim() || null : mobile ?? null;
        const parsedFee = Number(consultationFee);
        const finalConsultationFee = consultationFee === undefined || consultationFee === null || consultationFee === ''
            ? 500
            : (Number.isFinite(parsedFee) ? parsedFee : 500);
        const finalPaymentMode = paymentMode === 'Cash' ? 'Cash' : 'QR';

        let finalToken = tokenNumber;
        const todayKey = getLocalDateKey();
        if (!finalToken) {
            // Calculate Token Number for today
            const [rows] = await db.query('SELECT MAX(tokenNumber) as maxToken FROM patients WHERE latestVisitDate = ?', [todayKey]);
            finalToken = (rows[0].maxToken || 0) + 1;
        }

        const [result] = await db.query(
            'INSERT INTO patients (name, age, gender, mobile, visitReason, status, paymentMode, latestVisitDate, tokenNumber, consultationFee) VALUES (?, ?, ?, ?, ?, "Waiting", ?, ?, ?, ?)',
            [name, age, gender, finalMobile, visitReason, finalPaymentMode, todayKey, finalToken, finalConsultationFee]
        );
        res.json({ id: result.insertId, tokenNumber: finalToken, message: 'Patient registered' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error creating patient' });
    }
};

exports.updatePatientStatus = async (req, res) => {
    try {
        const { status } = req.body;
        await db.query('UPDATE patients SET status = ? WHERE id = ?', [status, req.params.id]);
        res.json({ message: 'Status updated' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating status' });
    }
};

exports.updatePatient = async (req, res) => {
    try {
        console.log("Update Patient Body:", req.body);
        const { name, age, gender, mobile, visitReason, status, consultationFee, tokenNumber, paymentMode } = req.body;
        const finalPaymentMode = paymentMode === 'Cash' ? 'Cash' : 'QR';
        await db.query(`
            UPDATE patients 
            SET name=?, age=?, gender=?, mobile=?, visitReason=?, status=?, paymentMode=?, consultationFee=?, tokenNumber=?
            WHERE id=?
        `, [name, age, gender, mobile, visitReason, status, finalPaymentMode, consultationFee, tokenNumber, req.params.id]);

        res.json({ message: 'Patient updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error updating patient' });
    }
};

exports.deletePatient = async (req, res) => {
    try {
        await db.query('DELETE FROM patients WHERE id = ?', [req.params.id]);
        res.json({ message: 'Patient deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting patient' });
    }
};

exports.updateDiagnosis = async (req, res) => {
    try {
        const { diagnoses } = req.body; // Array of strings
        const patientId = req.params.id;

        // Clear and rewrite (simple approach)
        await db.query('DELETE FROM patient_diagnoses WHERE patientId = ?', [patientId]);

        if (diagnoses && diagnoses.length > 0) {
            for (const d of diagnoses) {
                // Ensure diagnosis exists in master
                await db.query('INSERT IGNORE INTO diagnoses (name) VALUES (?)', [d]);
                // Link
                await db.query('INSERT INTO patient_diagnoses (patientId, diagnosisName) VALUES (?, ?)', [patientId, d]);
            }
        }
        res.json({ message: 'Diagnosis updated' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error updating diagnosis' });
    }
};

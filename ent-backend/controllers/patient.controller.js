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

exports.getPatientVisitTimeline = async (req, res) => {
    try {
        const searchTerm = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
        const fromDate = normalizeDateValue(req.query.from);
        const toDate = normalizeDateValue(req.query.to);

        const conditions = [];
        const params = [];

        if (searchTerm) {
            const likeTerm = `%${searchTerm}%`;
            conditions.push(`
                (
                    CAST(p.id AS CHAR) LIKE ?
                    OR CAST(p.tokenNumber AS CHAR) LIKE ?
                    OR p.name LIKE ?
                    OR COALESCE(p.mobile, '') LIKE ?
                    OR COALESCE(p.visitReason, '') LIKE ?
                    OR COALESCE(p.status, '') LIKE ?
                    OR EXISTS (
                        SELECT 1
                        FROM patient_diagnoses pd
                        WHERE pd.patientId = p.id
                          AND pd.diagnosisName LIKE ?
                    )
                    OR EXISTS (
                        SELECT 1
                        FROM prescriptions pr
                        LEFT JOIN prescription_medicines pm ON pm.prescriptionId = pr.id
                        WHERE pr.patientId = p.id
                          AND (
                              COALESCE(pr.notes, '') LIKE ?
                              OR COALESCE(pm.medicineName, '') LIKE ?
                              OR COALESCE(pm.dosage, '') LIKE ?
                              OR COALESCE(pm.duration, '') LIKE ?
                          )
                    )
                )
            `);
            params.push(likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm);
        }

        if (fromDate) {
            conditions.push(`
                (
                    p.latestVisitDate >= ?
                    OR EXISTS (
                        SELECT 1
                        FROM prescriptions pr
                        WHERE pr.patientId = p.id
                          AND pr.date >= ?
                    )
                )
            `);
            params.push(fromDate, fromDate);
        }

        if (toDate) {
            conditions.push(`
                (
                    p.latestVisitDate <= ?
                    OR EXISTS (
                        SELECT 1
                        FROM prescriptions pr
                        WHERE pr.patientId = p.id
                          AND pr.date <= ?
                    )
                )
            `);
            params.push(toDate, toDate);
        }

        const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const [patients] = await db.query(
            `
            SELECT p.*
            FROM patients p
            ${whereClause}
            ORDER BY COALESCE(p.latestVisitDate, DATE(p.createdAt)) DESC, p.id DESC
            LIMIT 80
            `,
            params
        );

        const timelinePatients = [];

        for (const row of patients) {
            const patient = normalizePatientDates(row);
            patient.paymentMode = patient.paymentMode || 'QR';

            const [diagnosisRows] = await db.query(
                'SELECT diagnosisName FROM patient_diagnoses WHERE patientId = ? ORDER BY diagnosisName',
                [patient.id]
            );
            const diagnoses = diagnosisRows.map(d => d.diagnosisName);

            const prescriptionParams = [patient.id];
            const prescriptionConditions = ['patientId = ?'];

            if (fromDate) {
                prescriptionConditions.push('date >= ?');
                prescriptionParams.push(fromDate);
            }

            if (toDate) {
                prescriptionConditions.push('date <= ?');
                prescriptionParams.push(toDate);
            }

            const [prescriptions] = await db.query(
                `
                SELECT id,
                       patientId,
                       DATE_FORMAT(date, '%Y-%m-%d') AS date,
                       notes,
                       CASE
                           WHEN nextVisitDate IS NULL THEN NULL
                           ELSE DATE_FORMAT(nextVisitDate, '%Y-%m-%d')
                       END AS nextVisitDate
                FROM prescriptions
                WHERE ${prescriptionConditions.join(' AND ')}
                ORDER BY date DESC, id DESC
                `,
                prescriptionParams
            );

            const visitsByDate = new Map();

            const addVisit = (date, visitData) => {
                if (!date) {
                    return;
                }

                const existing = visitsByDate.get(date) || {
                    date,
                    visitReason: patient.visitReason || '',
                    status: patient.status || 'Waiting',
                    paymentMode: patient.paymentMode || 'QR',
                    consultationFee: Number(patient.consultationFee) || 0,
                    tokenNumber: patient.tokenNumber || null,
                    diagnoses,
                    notes: '',
                    nextVisitDate: null,
                    prescriptionId: null,
                    medicines: []
                };

                visitsByDate.set(date, {
                    ...existing,
                    ...visitData,
                    diagnoses,
                    medicines: visitData.medicines || existing.medicines || []
                });
            };

            const latestVisitDate = patient.latestVisitDate ? getLocalDateKey(patient.latestVisitDate) : null;
            if (latestVisitDate && (!fromDate || latestVisitDate >= fromDate) && (!toDate || latestVisitDate <= toDate)) {
                addVisit(latestVisitDate, {});
            }

            for (const prescription of prescriptions) {
                const [medicineRows] = await db.query(
                    `
                    SELECT id,
                           medicineId,
                           medicineName,
                           dosage,
                           duration,
                           instructions
                    FROM prescription_medicines
                    WHERE prescriptionId = ?
                    ORDER BY id ASC
                    `,
                    [prescription.id]
                );

                addVisit(prescription.date, {
                    notes: prescription.notes || '',
                    nextVisitDate: prescription.nextVisitDate,
                    prescriptionId: prescription.id,
                    medicines: medicineRows
                });
            }

            const visits = Array.from(visitsByDate.values())
                .sort((left, right) => String(right.date).localeCompare(String(left.date)));

            timelinePatients.push({
                id: patient.id,
                name: patient.name,
                age: patient.age,
                gender: patient.gender,
                mobile: patient.mobile,
                medicalBackground: patient.medicalBackground,
                latestVisitDate: patient.latestVisitDate,
                currentDiagnosis: diagnoses,
                visits
            });
        }

        res.json(timelinePatients);
    } catch (error) {
        console.error('Error fetching patient visit timeline:', error);
        res.status(500).json({ message: 'Error fetching patient visit timeline' });
    }
};

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

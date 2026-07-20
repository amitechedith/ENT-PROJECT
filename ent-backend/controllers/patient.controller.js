const db = require('../config/db.config');
const { publishRealtimeEvent } = require('../realtime');
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

function normalizePatientCode(value) {
    return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function getRequesterRole(req) {
    return String(req.headers['x-user-role'] || req.body?.role || req.query?.role || '').toLowerCase();
}

function normalizePatientStatus(status, fallback = 'Waiting') {
    return ['Waiting', 'In Consultation', 'Payment Done', 'Exited'].includes(status) ? status : fallback;
}

function normalizePaymentModeForStatus(status, paymentMode) {
    if (status === 'Exited') {
        return null;
    }

    return paymentMode === 'Cash' ? 'Cash' : 'QR';
}

async function generatePatientCode(visitDateKey = getLocalDateKey()) {
    const datePart = visitDateKey.slice(0, 7).replace('-', '');

    for (let attempt = 0; attempt < 8; attempt += 1) {
        const [sequenceRows] = await db.query(
            `
            SELECT MAX(CAST(RIGHT(patientCode, 4) AS UNSIGNED)) AS maxSequence
            FROM patients
            WHERE patientCode LIKE ?
            `,
            [`PT${datePart}%`]
        );
        const nextSequence = (Number(sequenceRows[0]?.maxSequence) || 0) + 1 + attempt;
        const patientCode = `PT${datePart}${String(nextSequence).padStart(4, '0')}`;
        const [rows] = await db.query('SELECT id FROM patients WHERE patientCode = ? LIMIT 1', [patientCode]);
        if (rows.length === 0) {
            return patientCode;
        }
    }

    const fallbackSequence = Number(String(Date.now()).slice(-4));
    return `PT${datePart}${String(fallbackSequence).padStart(4, '0')}`;
}

async function getNextTokenForDate(dateKey) {
    const [rows] = await db.query('SELECT MAX(tokenNumber) as maxToken FROM patients WHERE latestVisitDate = ?', [dateKey]);
    return (rows[0].maxToken || 0) + 1;
}

async function getLatestMedicalBackground(patientCode, excludePatientId = null) {
    const normalizedCode = normalizePatientCode(patientCode);
    if (!normalizedCode) {
        return null;
    }

    const params = [normalizedCode];
    let excludeClause = '';
    if (excludePatientId) {
        excludeClause = 'AND id <> ?';
        params.push(excludePatientId);
    }

    const [rows] = await db.query(
        `
        SELECT medicalBackground
        FROM patients
        WHERE patientCode = ?
          AND medicalBackground IS NOT NULL
          AND TRIM(medicalBackground) <> ''
          ${excludeClause}
        ORDER BY COALESCE(latestVisitDate, DATE(createdAt)) DESC, id DESC
        LIMIT 1
        `,
        params
    );

    return rows[0]?.medicalBackground || null;
}

async function hydrateMedicalBackground(patient) {
    if (patient?.patientCode && (!patient.medicalBackground || !String(patient.medicalBackground).trim())) {
        patient.medicalBackground = await getLatestMedicalBackground(patient.patientCode, patient.id);
    }

    return patient;
}

async function syncPatientProfileDetails(patientCode, details, excludePatientId = null) {
    const normalizedCode = normalizePatientCode(patientCode);
    if (!normalizedCode) {
        return;
    }

    const setClauses = ['name = ?', 'gender = ?', 'mobile = ?'];
    const params = [details.name, details.gender, details.mobile];

    if (Object.prototype.hasOwnProperty.call(details, 'medicalBackground')) {
        setClauses.push('medicalBackground = ?');
        params.push(details.medicalBackground || null);
    }

    let whereClause = 'patientCode = ?';
    params.push(normalizedCode);

    if (excludePatientId) {
        whereClause += ' AND id <> ?';
        params.push(excludePatientId);
    }

    await db.query(
        `
        UPDATE patients
        SET ${setClauses.join(', ')}
        WHERE ${whereClause}
        `,
        params
    );
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
            await hydrateMedicalBackground(p);
            const [diags] = await db.query('SELECT diagnosisName FROM patient_diagnoses WHERE patientId = ?', [p.id]);
            p.currentDiagnosis = diags.map(d => d.diagnosisName);
            p.paymentMode = p.status === 'Exited' ? null : (p.paymentMode || 'QR');
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

        const patient = await hydrateMedicalBackground(normalizePatientDates(rows[0]));
        const [diags] = await db.query('SELECT diagnosisName FROM patient_diagnoses WHERE patientId = ?', [patient.id]);
        patient.currentDiagnosis = diags.map(d => d.diagnosisName);
        patient.paymentMode = patient.status === 'Exited' ? null : (patient.paymentMode || 'QR');

        res.json(patient);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching patient' });
    }
}

exports.getPatientByCode = async (req, res) => {
    try {
        const patientCode = normalizePatientCode(req.params.patientCode);
        if (!patientCode) {
            return res.status(400).json({ message: 'Patient ID is required' });
        }

        const [rows] = await db.query(
            `
            SELECT *
            FROM patients
            WHERE patientCode = ?
            ORDER BY COALESCE(latestVisitDate, DATE(createdAt)) DESC, id DESC
            LIMIT 1
            `,
            [patientCode]
        );
        if (rows.length === 0) return res.status(404).json({ message: 'Patient not found' });

        const patient = await hydrateMedicalBackground(normalizePatientDates(rows[0]));
        const [diags] = await db.query('SELECT diagnosisName FROM patient_diagnoses WHERE patientId = ?', [patient.id]);
        patient.currentDiagnosis = diags.map(d => d.diagnosisName);
        patient.paymentMode = patient.status === 'Exited' ? null : (patient.paymentMode || 'QR');

        res.json(patient);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching patient' });
    }
};

exports.getPatientsByMobile = async (req, res) => {
    try {
        const mobile = String(req.params.mobile || '').trim();
        if (!/^[0-9]{10}$/.test(mobile)) {
            return res.status(400).json({ message: 'Valid 10-digit mobile number is required' });
        }

        const [rows] = await db.query(
            `
            SELECT *
            FROM patients
            WHERE mobile = ?
            ORDER BY COALESCE(latestVisitDate, DATE(createdAt)) DESC, id DESC
            `,
            [mobile]
        );

        const patientMap = new Map();
        for (const row of rows) {
            const patient = normalizePatientDates(row);
            const key = patient.patientCode || `id-${patient.id}`;
            if (!patientMap.has(key)) {
                await hydrateMedicalBackground(patient);
                const [diags] = await db.query('SELECT diagnosisName FROM patient_diagnoses WHERE patientId = ?', [patient.id]);
                patient.currentDiagnosis = diags.map(d => d.diagnosisName);
                patient.paymentMode = patient.status === 'Exited' ? null : (patient.paymentMode || 'QR');
                patientMap.set(key, patient);
            }
        }

        res.json(Array.from(patientMap.values()));
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching patients by mobile' });
    }
};

exports.getPatientVisitHistory = async (req, res) => {
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
                    OR COALESCE(p.patientCode, '') LIKE ?
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
            params.push(likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm);
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

        const historyPatients = [];

        for (const row of patients) {
            const patient = normalizePatientDates(row);
            patient.paymentMode = patient.status === 'Exited' ? null : (patient.paymentMode || 'QR');

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
                    paymentMode: patient.status === 'Exited' ? null : (patient.paymentMode || 'QR'),
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

            historyPatients.push({
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

        res.json(historyPatients);
    } catch (error) {
        console.error('Error fetching patient visit history:', error);
        res.status(500).json({ message: 'Error fetching patient visit history' });
    }
};

exports.getNextToken = async (req, res) => {
    try {
        const visitDateKey = normalizeDateValue(req.query.date) || getLocalDateKey();
        const nextToken = await getNextTokenForDate(visitDateKey);
        console.log("Next Token Calculated:", nextToken);
        res.json({ nextToken });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching next token' });
    }
};

exports.createPatient = async (req, res) => {
    try {
        const { name, age, gender, mobile, visitReason, consultationFee, tokenNumber, paymentMode, latestVisitDate, status, medicalBackground, findings } = req.body;
        console.log("Create Patient Body:", req.body);

        const finalMobile = typeof mobile === 'string' ? mobile.trim() || null : mobile ?? null;
        const parsedFee = Number(consultationFee);
        const finalConsultationFee = consultationFee === undefined || consultationFee === null || consultationFee === ''
            ? 500
            : (Number.isFinite(parsedFee) ? parsedFee : 500);
        const finalStatus = normalizePatientStatus(status);
        const finalPaymentMode = normalizePaymentModeForStatus(finalStatus, paymentMode);
        let finalMedicalBackground = typeof medicalBackground === 'string'
            ? medicalBackground.trim() || null
            : medicalBackground ?? null;
        const finalFindings = typeof findings === 'string'
            ? findings.trim() || null
            : findings ?? null;

        let finalToken = tokenNumber;
        const visitDateKey = normalizeDateValue(latestVisitDate) || getLocalDateKey();
        if (!finalToken) {
            finalToken = await getNextTokenForDate(visitDateKey);
        }
        const patientCode = await generatePatientCode(visitDateKey);

        const [result] = await db.query(
            'INSERT INTO patients (patientCode, name, age, gender, mobile, visitReason, status, paymentMode, latestVisitDate, tokenNumber, consultationFee, medicalBackground, findings) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [patientCode, name, age, gender, finalMobile, visitReason, finalStatus, finalPaymentMode, visitDateKey, finalToken, finalConsultationFee, finalMedicalBackground, finalFindings]
        );
        publishRealtimeEvent({ type: 'patient-changed', action: 'created', patientId: result.insertId, patientCode, date: visitDateKey });
        res.json({ id: result.insertId, patientCode, tokenNumber: finalToken, message: 'Patient registered' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error creating patient' });
    }
};

exports.registerPatientVisit = async (req, res) => {
    try {
        console.log("Register Visit Body:", req.body);
        const { name, age, gender, mobile, visitReason, consultationFee, tokenNumber, paymentMode, medicalBackground, findings, latestVisitDate, status } = req.body;

        const [existingRows] = await db.query('SELECT * FROM patients WHERE id = ?', [req.params.id]);
        if (existingRows.length === 0) {
            return res.status(404).json({ message: 'Patient not found' });
        }

        const finalMobile = typeof mobile === 'string' ? mobile.trim() || null : mobile ?? null;
        const parsedFee = Number(consultationFee);
        const finalConsultationFee = consultationFee === undefined || consultationFee === null || consultationFee === ''
            ? 500
            : (Number.isFinite(parsedFee) ? parsedFee : 500);
        const finalStatus = normalizePatientStatus(status);
        const finalPaymentMode = normalizePaymentModeForStatus(finalStatus, paymentMode);
        const finalMedicalBackground = typeof medicalBackground === 'string'
            ? medicalBackground.trim() || null
            : medicalBackground ?? null;
        const finalFindings = typeof findings === 'string'
            ? findings.trim() || null
            : findings ?? null;
        const visitDateKey = normalizeDateValue(latestVisitDate) || getLocalDateKey();
        const finalToken = tokenNumber || await getNextTokenForDate(visitDateKey);

        const patientCode = normalizePatientCode(existingRows[0].patientCode);
        if (!patientCode) {
            return res.status(400).json({ message: 'Patient ID is missing for this patient' });
        }

        if (!finalMedicalBackground) {
            finalMedicalBackground = await getLatestMedicalBackground(patientCode, req.params.id);
        }

        const [visitRows] = await db.query(
            'SELECT id FROM patients WHERE patientCode = ? AND latestVisitDate = ? ORDER BY id DESC LIMIT 1',
            [patientCode, visitDateKey]
        );

        let visitPatientId;
        if (visitRows.length > 0) {
            visitPatientId = visitRows[0].id;
            await db.query(`
                UPDATE patients
                SET name=?, age=?, gender=?, mobile=?, visitReason=?, status=?,
                    paymentMode=?, tokenNumber=?, consultationFee=?, medicalBackground=?, findings=?
                WHERE id=?
            `, [name, age, gender, finalMobile, visitReason, finalStatus, finalPaymentMode, finalToken, finalConsultationFee, finalMedicalBackground, finalFindings, visitPatientId]);
        } else {
            const [result] = await db.query(
                `
                INSERT INTO patients
                    (patientCode, name, age, gender, mobile, visitReason, status, paymentMode, latestVisitDate, tokenNumber, consultationFee, medicalBackground, findings)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [patientCode, name, age, gender, finalMobile, visitReason, finalStatus, finalPaymentMode, visitDateKey, finalToken, finalConsultationFee, finalMedicalBackground, finalFindings]
            );
            visitPatientId = result.insertId;
        }

        await syncPatientProfileDetails(patientCode, {
            name,
            gender,
            mobile: finalMobile,
            medicalBackground: finalMedicalBackground
        }, visitPatientId);
        publishRealtimeEvent({ type: 'patient-changed', action: 'visit-registered', patientId: visitPatientId, patientCode, date: visitDateKey });

        res.json({
            id: visitPatientId,
            patientCode,
            tokenNumber: finalToken,
            latestVisitDate: visitDateKey,
            message: 'Patient visit registered'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error registering patient visit' });
    }
};

exports.updatePatientStatus = async (req, res) => {
    try {
        const { status, paymentMode } = req.body;
        const finalStatus = normalizePatientStatus(status);
        const finalPaymentMode = normalizePaymentModeForStatus(finalStatus, paymentMode);
        await db.query(
            'UPDATE patients SET status = ?, paymentMode = ? WHERE id = ?',
            [finalStatus, finalPaymentMode, req.params.id]
        );
        publishRealtimeEvent({ type: 'patient-changed', action: 'status-updated', patientId: Number(req.params.id), status: finalStatus });
        res.json({ message: 'Status updated' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating status' });
    }
};

exports.updatePatient = async (req, res) => {
    try {
        console.log("Update Patient Body:", req.body);
        const { name, age, gender, mobile, visitReason, status, consultationFee, tokenNumber, paymentMode, medicalBackground, findings, patientCode } = req.body;
        const finalStatus = normalizePatientStatus(status);
        const finalPaymentMode = normalizePaymentModeForStatus(finalStatus, paymentMode);
        const finalMobile = typeof mobile === 'string' ? mobile.trim() || null : mobile ?? null;
        const finalMedicalBackground = typeof medicalBackground === 'string'
            ? medicalBackground.trim() || null
            : medicalBackground ?? null;
        const finalFindings = typeof findings === 'string'
            ? findings.trim() || null
            : findings ?? null;
        await db.query(`
            UPDATE patients 
            SET name=?, age=?, gender=?, mobile=?, visitReason=?, status=?, paymentMode=?, consultationFee=?, tokenNumber=?, medicalBackground=?, findings=?
            WHERE id=?
        `, [name, age, gender, finalMobile, visitReason, finalStatus, finalPaymentMode, consultationFee, tokenNumber, finalMedicalBackground, finalFindings, req.params.id]);

        if (patientCode) {
            await syncPatientProfileDetails(patientCode, {
                name,
                gender,
                mobile: finalMobile,
                medicalBackground: finalMedicalBackground
            }, req.params.id);
        }

        publishRealtimeEvent({ type: 'patient-changed', action: 'updated', patientId: Number(req.params.id), patientCode, date: req.body.latestVisitDate || null });
        res.json({ message: 'Patient updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error updating patient' });
    }
};

exports.deletePatient = async (req, res) => {
    try {
        const requesterRole = getRequesterRole(req);
        if (!['admin', 'doctor'].includes(requesterRole)) {
            return res.status(403).json({ message: 'Only doctor or admin can delete patient records' });
        }

        const visitDate = normalizeDateValue(req.query.date);
        const [result] = visitDate
            ? await db.query('DELETE FROM patients WHERE id = ? AND latestVisitDate = ?', [req.params.id, visitDate])
            : await db.query('DELETE FROM patients WHERE id = ?', [req.params.id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Patient visit not found for selected date' });
        }

        publishRealtimeEvent({ type: 'patient-changed', action: 'deleted', patientId: Number(req.params.id), date: visitDate || null });
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
        publishRealtimeEvent({ type: 'patient-changed', action: 'diagnosis-updated', patientId: Number(patientId) });
        res.json({ message: 'Diagnosis updated' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error updating diagnosis' });
    }
};

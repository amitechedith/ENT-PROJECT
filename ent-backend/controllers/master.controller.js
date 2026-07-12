const db = require('../config/db.config');

const normalizeMasterName = (value) => {
    if (typeof value !== 'string') {
        return '';
    }

    return value.trim();
};

const insertOrFetchMasterItem = async (tableName, name) => {
    const normalizedName = normalizeMasterName(name);

    if (!normalizedName) {
        const error = new Error(`Invalid ${tableName.slice(0, -1)} name`);
        error.statusCode = 400;
        throw error;
    }

    await db.query(`INSERT IGNORE INTO \`${tableName}\` (name) VALUES (?)`, [normalizedName]);
    const [rows] = await db.query(`SELECT id, name FROM \`${tableName}\` WHERE name = ? LIMIT 1`, [normalizedName]);

    return rows[0];
};

const deleteMasterItemByName = async (tableName, name) => {
    const normalizedName = normalizeMasterName(name);

    if (!normalizedName) {
        const error = new Error(`Invalid ${tableName.slice(0, -1)} name`);
        error.statusCode = 400;
        throw error;
    }

    const [result] = await db.query(`DELETE FROM \`${tableName}\` WHERE name = ?`, [normalizedName]);

    if (result.affectedRows === 0) {
        const error = new Error(`${tableName.slice(0, -1)} not found`);
        error.statusCode = 404;
        throw error;
    }

    return { name: normalizedName };
};

const assertMasterItemNotInUse = async (type, name) => {
    const normalizedName = normalizeMasterName(name);
    let count = 0;

    if (type === 'medicine') {
        const [rows] = await db.query(
            `
            SELECT COUNT(*) AS count
            FROM prescription_medicines pm
            LEFT JOIN medicines m ON m.id = pm.medicineId
            WHERE pm.medicineName = ? OR m.name = ?
            `,
            [normalizedName, normalizedName]
        );
        count = Number(rows[0]?.count || 0);
    }

    if (type === 'diagnosis') {
        const [rows] = await db.query(
            'SELECT COUNT(*) AS count FROM patient_diagnoses WHERE diagnosisName = ?',
            [normalizedName]
        );
        count = Number(rows[0]?.count || 0);
    }

    if (type === 'dosage') {
        const [rows] = await db.query(
            'SELECT COUNT(*) AS count FROM prescription_medicines WHERE dosage = ?',
            [normalizedName]
        );
        count = Number(rows[0]?.count || 0);
    }

    if (count > 0) {
        const error = new Error(`This ${type} is already used and cannot be deleted`);
        error.statusCode = 409;
        throw error;
    }
};

exports.getMedicines = async (req, res) => {
    try {
        const [meds] = await db.query('SELECT * FROM medicines ORDER BY name');
        res.json(meds);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching medicines' });
    }
};

exports.addMedicine = async (req, res) => {
    try {
        const medicine = await insertOrFetchMasterItem('medicines', req.body.name);
        res.json(medicine);
    } catch (error) {
        console.error('Error adding medicine:', error);
        res.status(error.statusCode || 500).json({ message: 'Error adding medicine', error: error.message });
    }
};

exports.deleteMedicine = async (req, res) => {
    try {
        await assertMasterItemNotInUse('medicine', req.query.name);
        const medicine = await deleteMasterItemByName('medicines', req.query.name);
        res.json({ message: 'Medicine deleted', ...medicine });
    } catch (error) {
        console.error('Error deleting medicine:', error);
        res.status(error.statusCode || 500).json({ message: 'Error deleting medicine', error: error.message });
    }
};

exports.getDiagnoses = async (req, res) => {
    try {
        const [diags] = await db.query('SELECT * FROM diagnoses ORDER BY name');
        res.json(diags);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching diagnoses' });
    }
};

exports.addDiagnosis = async (req, res) => {
    try {
        console.log('Request body:', req.body);
        const diagnosis = await insertOrFetchMasterItem('diagnoses', req.body.name);
        console.log('Adding diagnosis:', diagnosis.name, 'Type:', typeof diagnosis.name);
        res.json(diagnosis);
    } catch (error) {
        console.error('Error adding diagnosis:', error);
        console.error('Error stack:', error.stack);
        res.status(error.statusCode || 500).json({ message: 'Error adding diagnosis', error: error.message });
    }
};

exports.deleteDiagnosis = async (req, res) => {
    try {
        await assertMasterItemNotInUse('diagnosis', req.query.name);
        const diagnosis = await deleteMasterItemByName('diagnoses', req.query.name);
        res.json({ message: 'Diagnosis deleted', ...diagnosis });
    } catch (error) {
        console.error('Error deleting diagnosis:', error);
        res.status(error.statusCode || 500).json({ message: 'Error deleting diagnosis', error: error.message });
    }
};

exports.getDosages = async (req, res) => {
    try {
        const [dosages] = await db.query('SELECT * FROM dosages ORDER BY name');
        res.json(dosages);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching dosages' });
    }
};

exports.addDosage = async (req, res) => {
    try {
        const dosage = await insertOrFetchMasterItem('dosages', req.body.name);
        res.json(dosage);
    } catch (error) {
        console.error('Error adding dosage:', error);
        res.status(error.statusCode || 500).json({ message: 'Error adding dosage', error: error.message });
    }
};

exports.deleteDosage = async (req, res) => {
    try {
        await assertMasterItemNotInUse('dosage', req.query.name);
        const dosage = await deleteMasterItemByName('dosages', req.query.name);
        res.json({ message: 'Dosage deleted', ...dosage });
    } catch (error) {
        console.error('Error deleting dosage:', error);
        res.status(error.statusCode || 500).json({ message: 'Error deleting dosage', error: error.message });
    }
};

const db = require('../config/db.config');

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
        const { name } = req.body;
        // Ignore duplicate insert
        const [result] = await db.query('INSERT IGNORE INTO medicines (name) VALUES (?)', [name]);
        res.json({ id: result.insertId, name });
    } catch (error) {
        console.error('Error adding medicine:', error);
        res.status(500).json({ message: 'Error adding medicine', error: error.message });
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
        const { name } = req.body;
        console.log('Adding diagnosis:', name, 'Type:', typeof name);

        if (!name || typeof name !== 'string') {
            return res.status(400).json({ message: 'Invalid diagnosis name', received: name });
        }

        const [result] = await db.query('INSERT IGNORE INTO diagnoses (name) VALUES (?)', [name]);
        res.json({ id: result.insertId, name });
    } catch (error) {
        console.error('Error adding diagnosis:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ message: 'Error adding diagnosis', error: error.message });
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
        const { name } = req.body;
        const [result] = await db.query('INSERT IGNORE INTO dosages (name) VALUES (?)', [name]);
        res.json({ id: result.insertId, name });
    } catch (error) {
        console.error('Error adding dosage:', error);
        res.status(500).json({ message: 'Error adding dosage', error: error.message });
    }
};

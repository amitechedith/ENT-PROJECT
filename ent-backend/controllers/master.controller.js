const db = require('../config/db.config');
const ExcelJS = require('exceljs');

const assertDataEntryAccess = (req) => {
    const role = String(req.headers['x-user-role'] || req.body?.role || req.query?.role || '').toLowerCase();

    if (!['admin', 'doctor'].includes(role)) {
        const error = new Error('Only admin and doctor users can manage medicine data');
        error.statusCode = 403;
        throw error;
    }
};

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

const findMedicineWorksheet = (workbook) => {
    return workbook.worksheets.find(sheet => sheet.name.toLowerCase().includes('medicine')) || workbook.worksheets[0];
};

const getMedicineNameColumnIndex = (worksheet) => {
    const allowedHeaders = new Set(['name', 'medicine', 'medicine name', 'medicines', 'medicine master']);
    const headerValues = Array.isArray(worksheet.getRow(1).values) ? worksheet.getRow(1).values : [];
    const index = headerValues.findIndex(value => allowedHeaders.has(String(value || '').trim().toLowerCase()));

    return index > -1 ? index : 1;
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
        const displayType = type.charAt(0).toUpperCase() + type.slice(1);
        const error = new Error(`${displayType} is in use and cannot be deleted`);
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

exports.exportMedicinesExcel = async (req, res) => {
    try {
        assertDataEntryAccess(req);

        const [medicines] = await db.query('SELECT id, name, updatedAt FROM medicines ORDER BY name');
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'ENT Clinic Management';
        workbook.created = new Date();
        workbook.modified = new Date();

        const worksheet = workbook.addWorksheet('Medicines');
        worksheet.columns = [
            { header: 'ID', key: 'id', width: 12 },
            { header: 'Name', key: 'name', width: 40 },
            { header: 'Updated At', key: 'updatedAt', width: 24 }
        ];
        worksheet.getRow(1).font = { bold: true };
        worksheet.addRows(medicines);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="ent-clinic-medicines.xlsx"');
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error exporting medicines:', error);
        res.status(error.statusCode || 500).json({ message: 'Error exporting medicines', error: error.message });
    }
};

exports.importMedicinesExcel = async (req, res) => {
    try {
        assertDataEntryAccess(req);

        const fileBase64 = req.body?.fileBase64;
        if (!fileBase64 || typeof fileBase64 !== 'string') {
            return res.status(400).json({ message: 'Excel file is required' });
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(Buffer.from(fileBase64, 'base64'));
        const worksheet = findMedicineWorksheet(workbook);

        if (!worksheet) {
            return res.status(400).json({ message: 'No worksheet found in Excel file' });
        }

        const nameColumnIndex = getMedicineNameColumnIndex(worksheet);
        const hasHeaderRow = nameColumnIndex > 1 || ['name', 'medicine', 'medicine name', 'medicines', 'medicine master']
            .includes(String(worksheet.getRow(1).getCell(nameColumnIndex).text || '').trim().toLowerCase());
        const medicineNames = [];

        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1 && hasHeaderRow) {
                return;
            }

            const cellValue = row.getCell(nameColumnIndex).text || row.getCell(nameColumnIndex).value;
            const name = normalizeMasterName(String(cellValue || ''));

            if (name) {
                medicineNames.push(name);
            }
        });

        const seen = new Set();
        const uniqueNames = medicineNames.filter(name => {
            const key = name.toLowerCase();
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });

        let addedCount = 0;
        let skippedCount = medicineNames.length - uniqueNames.length;

        for (const name of uniqueNames) {
            const [existingRows] = await db.query('SELECT id FROM medicines WHERE LOWER(name) = LOWER(?) LIMIT 1', [name]);
            if (existingRows.length) {
                skippedCount += 1;
                continue;
            }

            await insertOrFetchMasterItem('medicines', name);
            addedCount += 1;
        }

        res.json({
            message: 'Medicines imported successfully',
            addedCount,
            skippedCount,
            totalRows: medicineNames.length
        });
    } catch (error) {
        console.error('Error importing medicines:', error);
        res.status(error.statusCode || 500).json({ message: 'Error importing medicines', error: error.message });
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
        res.status(error.statusCode || 500).json({
            message: error.statusCode === 409 ? error.message : 'Error deleting medicine',
            error: error.message
        });
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

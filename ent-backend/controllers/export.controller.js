const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const db = require('../config/db.config');

const EXPORT_TYPE = 'patient-history';
const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const BACKUP_FILE_NAME = 'ent-clinic-patient-history-backup.xlsx';
const BACKUP_FILE_PATH = path.join(BACKUP_DIR, BACKUP_FILE_NAME);

const VISIT_COLUMNS = [
    { header: 'Patient ID', key: 'patientId', width: 12 },
    { header: 'Token', key: 'tokenNumber', width: 10 },
    { header: 'Patient Name', key: 'patientName', width: 24 },
    { header: 'Mobile', key: 'mobile', width: 16 },
    { header: 'Age', key: 'age', width: 8 },
    { header: 'Gender', key: 'gender', width: 10 },
    { header: 'Visit Date', key: 'visitDate', width: 14 },
    { header: 'Visit Reason', key: 'visitReason', width: 28 },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Payment Mode', key: 'paymentMode', width: 14 },
    { header: 'Consultation Fee', key: 'consultationFee', width: 16 },
    { header: 'Diagnoses', key: 'diagnoses', width: 34 },
    { header: 'Medical Background', key: 'medicalBackground', width: 34 },
    { header: 'Prescription ID', key: 'prescriptionId', width: 15 },
    { header: 'Prescription Notes', key: 'notes', width: 34 },
    { header: 'Next Visit Date', key: 'nextVisitDate', width: 16 },
    { header: 'Medicine ID', key: 'medicineId', width: 12 },
    { header: 'Medicine Name', key: 'medicineName', width: 26 },
    { header: 'Dosage', key: 'dosage', width: 16 },
    { header: 'Duration', key: 'duration', width: 16 },
    { header: 'Instructions', key: 'instructions', width: 28 }
];

const MASTER_COLUMNS = {
    users: [
        { header: 'ID', key: 'id', width: 18 },
        { header: 'Username', key: 'username', width: 20 },
        { header: 'Full Name', key: 'fullName', width: 24 },
        { header: 'Mobile', key: 'mobile', width: 16 },
        { header: 'Role', key: 'role', width: 14 },
        { header: 'Doctor Title', key: 'doctorTitle', width: 24 },
        { header: 'Registration Number', key: 'doctorRegistrationNumber', width: 24 },
        { header: 'Clinic Address', key: 'doctorClinicAddress', width: 36 },
        { header: 'Clinic Phone', key: 'doctorClinicPhone', width: 18 },
        { header: 'Email', key: 'doctorEmail', width: 28 },
        { header: 'Timings', key: 'doctorTimings', width: 22 },
        { header: 'Updated At', key: 'updatedAt', width: 22 }
    ],
    simpleMaster: [
        { header: 'ID', key: 'id', width: 12 },
        { header: 'Name', key: 'name', width: 36 },
        { header: 'Updated At', key: 'updatedAt', width: 22 }
    ]
};

const ensureBackupDir = () => {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
};

const getRequesterRole = (req) => {
    return String(req.headers['x-user-role'] || req.body?.role || req.query?.role || '').toLowerCase();
};

const assertCanExport = (req, res) => {
    const role = getRequesterRole(req);
    if (!['admin', 'doctor'].includes(role)) {
        res.status(403).json({ message: 'Only admin and doctor users can export patient history backups' });
        return false;
    }

    return true;
};

const formatDateTime = (value) => {
    if (!value) {
        return '';
    }

    return value instanceof Date ? value.toISOString().replace('T', ' ').slice(0, 19) : String(value);
};

const applySheetStyle = (worksheet, columnCount) => {
    const thinBorder = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
    };

    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2563EB' }
    };
    worksheet.getRow(1).alignment = { vertical: 'middle', wrapText: true };

    for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
        const row = worksheet.getRow(rowNumber);
        row.alignment = { vertical: 'top', wrapText: true };

        for (let columnNumber = 1; columnNumber <= columnCount; columnNumber += 1) {
            const cell = row.getCell(columnNumber);
            cell.border = thinBorder;

            if (rowNumber === 1) {
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FF2563EB' }
                };
            }

            if (rowNumber > 1 && rowNumber % 2 === 0) {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFF8FAFC' }
                };
            }
        }

        row.commit();
    }
};

const replaceWorksheet = (workbook, sheetName, columns, rows) => {
    const existing = workbook.getWorksheet(sheetName);
    if (existing) {
        workbook.removeWorksheet(existing.id);
    }

    const worksheet = workbook.addWorksheet(sheetName);
    worksheet.columns = columns;
    worksheet.addRows(rows);
    worksheet.autoFilter = {
        from: 'A1',
        to: `${worksheet.getColumn(columns.length).letter}1`
    };
    applySheetStyle(worksheet, columns.length);
};

const getLastSuccessfulExport = async () => {
    const [rows] = await db.query(
        `
        SELECT completedAt
        FROM export_runs
        WHERE exportType = ? AND status = 'success'
        ORDER BY completedAt DESC
        LIMIT 1
        `,
        [EXPORT_TYPE]
    );

    return rows[0]?.completedAt || null;
};

const getAllVisitDates = async () => {
    const [rows] = await db.query(`
        SELECT date FROM (
            SELECT DATE_FORMAT(latestVisitDate, '%Y-%m-%d') AS date
            FROM patients
            WHERE latestVisitDate IS NOT NULL
            UNION
            SELECT DATE_FORMAT(date, '%Y-%m-%d') AS date
            FROM prescriptions
            WHERE date IS NOT NULL
        ) visit_dates
        ORDER BY date
    `);

    return rows.map(row => row.date).filter(Boolean);
};

const getChangedVisitDates = async (since) => {
    if (!since) {
        return getAllVisitDates();
    }

    const [rows] = await db.query(
        `
        SELECT date FROM (
            SELECT DATE_FORMAT(latestVisitDate, '%Y-%m-%d') AS date
            FROM patients
            WHERE updatedAt > ? AND latestVisitDate IS NOT NULL
            UNION
            SELECT DATE_FORMAT(date, '%Y-%m-%d') AS date
            FROM prescriptions
            WHERE updatedAt > ?
            UNION
            SELECT DATE_FORMAT(pr.date, '%Y-%m-%d') AS date
            FROM prescription_medicines pm
            INNER JOIN prescriptions pr ON pr.id = pm.prescriptionId
            WHERE pm.updatedAt > ?
            UNION
            SELECT DATE_FORMAT(p.latestVisitDate, '%Y-%m-%d') AS date
            FROM patient_diagnoses pd
            INNER JOIN patients p ON p.id = pd.patientId
            WHERE pd.updatedAt > ? AND p.latestVisitDate IS NOT NULL
        ) changed_dates
        WHERE date IS NOT NULL
        ORDER BY date
        `,
        [since, since, since, since]
    );

    return rows.map(row => row.date).filter(Boolean);
};

const hasMasterChanges = async (since) => {
    if (!since) {
        return true;
    }

    const [rows] = await db.query(
        `
        SELECT
            (SELECT COUNT(*) FROM users WHERE updatedAt > ?) +
            (SELECT COUNT(*) FROM medicines WHERE updatedAt > ?) +
            (SELECT COUNT(*) FROM diagnoses WHERE updatedAt > ?) +
            (SELECT COUNT(*) FROM dosages WHERE updatedAt > ?) AS count
        `,
        [since, since, since, since]
    );

    return Number(rows[0]?.count || 0) > 0;
};

const getVisitRowsForDate = async (date) => {
    const [rows] = await db.query(
        `
        SELECT
            p.id AS patientId,
            p.tokenNumber,
            p.name AS patientName,
            p.mobile,
            p.age,
            p.gender,
            ? AS visitDate,
            p.visitReason,
            p.status,
            p.paymentMode,
            p.consultationFee,
            COALESCE(d.diagnoses, '') AS diagnoses,
            p.medicalBackground,
            pr.id AS prescriptionId,
            pr.notes,
            CASE
                WHEN pr.nextVisitDate IS NULL THEN NULL
                ELSE DATE_FORMAT(pr.nextVisitDate, '%Y-%m-%d')
            END AS nextVisitDate,
            pm.medicineId,
            pm.medicineName,
            pm.dosage,
            pm.duration,
            pm.instructions
        FROM patients p
        LEFT JOIN prescriptions pr ON pr.patientId = p.id AND pr.date = ?
        LEFT JOIN prescription_medicines pm ON pm.prescriptionId = pr.id
        LEFT JOIN (
            SELECT patientId, GROUP_CONCAT(diagnosisName ORDER BY diagnosisName SEPARATOR ', ') AS diagnoses
            FROM patient_diagnoses
            GROUP BY patientId
        ) d ON d.patientId = p.id
        WHERE p.latestVisitDate = ? OR pr.date = ?
        ORDER BY COALESCE(p.tokenNumber, 999999), p.name, pr.id, pm.id
        `,
        [date, date, date, date]
    );

    return rows.map(row => ({
        ...row,
        consultationFee: Number(row.consultationFee || 0)
    }));
};

const getUsers = async () => {
    const [rows] = await db.query(`
        SELECT id, username, fullName, mobile, role,
               doctorTitle, doctorRegistrationNumber, doctorClinicAddress,
               doctorClinicPhone, doctorEmail, doctorTimings, updatedAt
        FROM users
        ORDER BY role, fullName
    `);

    return rows.map(row => ({ ...row, updatedAt: formatDateTime(row.updatedAt) }));
};

const getSimpleMasterRows = async (tableName) => {
    const [rows] = await db.query(`SELECT id, name, updatedAt FROM \`${tableName}\` ORDER BY name`);
    return rows.map(row => ({ ...row, updatedAt: formatDateTime(row.updatedAt) }));
};

const refreshMasterSheets = async (workbook) => {
    replaceWorksheet(workbook, 'Users', MASTER_COLUMNS.users, await getUsers());
    replaceWorksheet(workbook, 'Medicines Master', MASTER_COLUMNS.simpleMaster, await getSimpleMasterRows('medicines'));
    replaceWorksheet(workbook, 'Diagnoses Master', MASTER_COLUMNS.simpleMaster, await getSimpleMasterRows('diagnoses'));
    replaceWorksheet(workbook, 'Dosages Master', MASTER_COLUMNS.simpleMaster, await getSimpleMasterRows('dosages'));
};

const refreshExportInfoSheet = (workbook, exportInfo) => {
    replaceWorksheet(
        workbook,
        'Export Info',
        [
            { header: 'Field', key: 'field', width: 24 },
            { header: 'Value', key: 'value', width: 80 }
        ],
        [
            { field: 'Export Type', value: EXPORT_TYPE },
            { field: 'Generated At', value: exportInfo.generatedAt },
            { field: 'Affected Dates', value: exportInfo.affectedDates.join(', ') || 'None' },
            { field: 'Refreshed Sheets', value: exportInfo.refreshedSheets.join(', ') || 'None' },
            { field: 'Note', value: 'Date sheets are refreshed only when their source data changes. Master sheets refresh when master/user data changes.' }
        ]
    );
};

const insertExportRun = async (status, filePath, affectedDates, refreshedSheets, message, startedAt, completedAt = new Date()) => {
    await db.query(
        `
        INSERT INTO export_runs
        (exportType, status, filePath, affectedDates, refreshedSheets, message, startedAt, completedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
            EXPORT_TYPE,
            status,
            filePath,
            JSON.stringify(affectedDates || []),
            JSON.stringify(refreshedSheets || []),
            message || '',
            startedAt,
            completedAt
        ]
    );
};

exports.exportPatientHistoryBackup = async (req, res) => {
    if (!assertCanExport(req, res)) {
        return;
    }

    const startedAt = new Date();
    const refreshedSheets = [];
    let affectedDates = [];

    try {
        ensureBackupDir();

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'ENT Clinic Management';
        workbook.created = new Date();
        workbook.modified = new Date();

        const fileExists = fs.existsSync(BACKUP_FILE_PATH);
        if (fileExists) {
            await workbook.xlsx.readFile(BACKUP_FILE_PATH);
        }

        const lastExportAt = fileExists ? await getLastSuccessfulExport() : null;
        affectedDates = await getChangedVisitDates(lastExportAt);

        for (const date of affectedDates) {
            const rows = await getVisitRowsForDate(date);
            replaceWorksheet(workbook, date, VISIT_COLUMNS, rows);
            refreshedSheets.push(date);
        }

        if (!fileExists || await hasMasterChanges(lastExportAt)) {
            await refreshMasterSheets(workbook);
            refreshedSheets.push('Users', 'Medicines Master', 'Diagnoses Master', 'Dosages Master');
        }

        refreshExportInfoSheet(workbook, {
            generatedAt: formatDateTime(new Date()),
            affectedDates,
            refreshedSheets
        });
        refreshedSheets.push('Export Info');

        await workbook.xlsx.writeFile(BACKUP_FILE_PATH);
        await insertExportRun('success', BACKUP_FILE_PATH, affectedDates, refreshedSheets, 'Export completed', startedAt);

        res.json({
            message: 'Patient history backup exported successfully',
            fileName: BACKUP_FILE_NAME,
            affectedDates,
            refreshedSheets,
            downloadUrl: '/api/export/patient-history/download'
        });
    } catch (error) {
        console.error('Patient history export failed:', error);
        await insertExportRun('failed', BACKUP_FILE_PATH, affectedDates, refreshedSheets, error.message, startedAt);
        res.status(500).json({ message: 'Patient history backup export failed', error: error.message });
    }
};

exports.downloadPatientHistoryBackup = async (req, res) => {
    if (!assertCanExport(req, res)) {
        return;
    }

    if (!fs.existsSync(BACKUP_FILE_PATH)) {
        return res.status(404).json({ message: 'No patient history backup file found yet' });
    }

    res.download(BACKUP_FILE_PATH, BACKUP_FILE_NAME);
};

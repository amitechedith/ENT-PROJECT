const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const db = require('../config/db.config');

const EXPORT_TYPE = 'patient-history';
const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const BACKUP_FILE_NAME = 'ent-clinic-patient-history-backup.xlsx';
const BACKUP_FILE_PATH = path.join(BACKUP_DIR, BACKUP_FILE_NAME);
const SQL_BACKUP_FILE_NAME = 'ent-clinic-full-database-backup.sql';
const SQL_BACKUP_FILE_PATH = path.join(BACKUP_DIR, SQL_BACKUP_FILE_NAME);
const SQL_TABLE_BACKUP_DIR = path.join(BACKUP_DIR, 'sql-tables');

const SQL_TABLES = [
    { name: 'users', orderBy: ['id'] },
    { name: 'patients', orderBy: ['id'] },
    { name: 'medicines', orderBy: ['id'] },
    { name: 'diagnoses', orderBy: ['id'] },
    { name: 'dosages', orderBy: ['id'] },
    { name: 'prescriptions', orderBy: ['id'] },
    { name: 'prescription_medicines', orderBy: ['id'] },
    { name: 'patient_diagnoses', orderBy: ['patientId', 'diagnosisName'] },
    { name: 'export_runs', orderBy: ['id'] }
];

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

const PAYMENT_SUMMARY_COLUMNS = [
    { header: 'Visit Date', key: 'visitDate', width: 14 },
    { header: 'Payment Mode', key: 'paymentMode', width: 16 },
    { header: 'Paid Patient Count', key: 'patientCount', width: 18 },
    { header: 'Confirmed Fee Total', key: 'consultationFeeTotal', width: 22 }
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

const ensureSqlTableBackupDir = () => {
    ensureBackupDir();
    fs.mkdirSync(SQL_TABLE_BACKUP_DIR, { recursive: true });
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

const assertCanImport = (req, res) => {
    const role = getRequesterRole(req);
    if (role !== 'admin') {
        res.status(403).json({ message: 'Only admin users can import SQL database backups' });
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

const isSafeIdentifier = (value) => /^[A-Za-z0-9_]+$/.test(value);

const quoteIdentifier = (value) => {
    if (!isSafeIdentifier(value)) {
        throw new Error(`Unsafe SQL identifier: ${value}`);
    }

    return `\`${value}\``;
};

const formatSqlValue = (value) => {
    if (value === null || value === undefined) {
        return 'NULL';
    }

    if (value instanceof Date) {
        return db.escape(formatDateTime(value));
    }

    return db.escape(value);
};

const getTableColumns = async (tableName) => {
    const [columns] = await db.query(`SHOW COLUMNS FROM ${quoteIdentifier(tableName)}`);
    return columns.map(column => column.Field);
};

const getTableRows = async (tableConfig, columns) => {
    const columnSql = columns.map(quoteIdentifier).join(', ');
    const orderSql = tableConfig.orderBy
        .filter(column => columns.includes(column))
        .map(quoteIdentifier)
        .join(', ');
    const query = `SELECT ${columnSql} FROM ${quoteIdentifier(tableConfig.name)}${orderSql ? ` ORDER BY ${orderSql}` : ''}`;
    const [rows] = await db.query(query);
    return rows;
};

const buildInsertStatement = (tableName, columns, rows) => {
    if (rows.length === 0) {
        return `-- No rows for ${quoteIdentifier(tableName)}`;
    }

    const columnSql = columns.map(quoteIdentifier).join(', ');
    const valuesSql = rows
        .map(row => `(${columns.map(column => formatSqlValue(row[column])).join(', ')})`)
        .join(',\n');

    return `INSERT INTO ${quoteIdentifier(tableName)} (${columnSql}) VALUES\n${valuesSql}`;
};

const buildSqlBackup = async () => {
    const lines = [
        '-- ENT Clinic full database backup',
        `-- Generated at: ${formatDateTime(new Date())}`,
        '-- Importing this file replaces data in the listed application tables.',
        'SET FOREIGN_KEY_CHECKS=0',
        ''
    ];

    for (const tableConfig of [...SQL_TABLES].reverse()) {
        lines.push(`DELETE FROM ${quoteIdentifier(tableConfig.name)}`);
    }

    lines.push('');

    for (const tableConfig of SQL_TABLES) {
        const columns = await getTableColumns(tableConfig.name);
        const rows = await getTableRows(tableConfig, columns);
        lines.push(`-- Data for table ${quoteIdentifier(tableConfig.name)}`);
        lines.push(buildInsertStatement(tableConfig.name, columns, rows));
        lines.push('');
    }

    lines.push('SET FOREIGN_KEY_CHECKS=1');
    lines.push('');

    return `${lines.join(';\n')}\n`;
};

const getSqlTableConfig = (tableName) => {
    return SQL_TABLES.find(table => table.name === tableName);
};

const getSqlTableBackupFileName = (tableName) => {
    return `ent-clinic-${tableName}.sql`;
};

const getSqlTableBackupFilePath = (tableName) => {
    return path.join(SQL_TABLE_BACKUP_DIR, getSqlTableBackupFileName(tableName));
};

const buildSqlTableBackup = async (tableConfig) => {
    const columns = await getTableColumns(tableConfig.name);
    const rows = await getTableRows(tableConfig, columns);
    const lines = [
        `-- ENT Clinic table backup: ${tableConfig.name}`,
        `-- Generated at: ${formatDateTime(new Date())}`,
        '-- Importing this file replaces data for this table.',
        'SET FOREIGN_KEY_CHECKS=0',
        `DELETE FROM ${quoteIdentifier(tableConfig.name)}`,
        buildInsertStatement(tableConfig.name, columns, rows),
        'SET FOREIGN_KEY_CHECKS=1',
        ''
    ];

    return `${lines.join(';\n')}\n`;
};

const splitSqlStatements = (sql) => {
    const statements = [];
    let current = '';
    let quote = null;
    let isEscaped = false;

    for (const char of sql) {
        current += char;

        if (isEscaped) {
            isEscaped = false;
            continue;
        }

        if (char === '\\' && quote) {
            isEscaped = true;
            continue;
        }

        if ((char === '\'' || char === '"') && (!quote || quote === char)) {
            quote = quote === char ? null : char;
            continue;
        }

        if (char === ';' && !quote) {
            const statement = current.slice(0, -1).trim();
            if (statement) {
                statements.push(statement);
            }
            current = '';
        }
    }

    const tail = current.trim();
    if (tail) {
        statements.push(tail);
    }

    return statements;
};

const stripSqlComments = (sql) => {
    return sql
        .split('\n')
        .filter(line => !line.trim().startsWith('--'))
        .join('\n');
};

const isAllowedImportStatement = (statement) => {
    const normalized = statement.trim().replace(/\s+/g, ' ').toUpperCase();
    return normalized === 'SET FOREIGN_KEY_CHECKS=0'
        || normalized === 'SET FOREIGN_KEY_CHECKS=1'
        || SQL_TABLES.some(table => normalized.startsWith(`DELETE FROM \`${table.name.toUpperCase()}\``))
        || SQL_TABLES.some(table => normalized.startsWith(`INSERT INTO \`${table.name.toUpperCase()}\``));
};

const getStatementTableName = (statement) => {
    const match = statement
        .trim()
        .match(/^(?:DELETE\s+FROM|INSERT\s+INTO)\s+`?([A-Za-z0-9_]+)`?/i);

    return match?.[1] || null;
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

const getPaymentSummaryRows = async () => {
    const [rows] = await db.query(`
        SELECT
            DATE_FORMAT(latestVisitDate, '%Y-%m-%d') AS visitDate,
            CASE WHEN paymentMode = 'Cash' THEN 'Cash' ELSE 'QR' END AS paymentMode,
            COUNT(*) AS patientCount,
            COALESCE(SUM(consultationFee), 0) AS consultationFeeTotal
        FROM patients
        WHERE latestVisitDate IS NOT NULL
          AND status = 'Payment Done'
        GROUP BY latestVisitDate, CASE WHEN paymentMode = 'Cash' THEN 'Cash' ELSE 'QR' END
        ORDER BY latestVisitDate DESC, paymentMode DESC
    `);

    const rowsByDate = new Map();
    for (const row of rows) {
        const visitDate = row.visitDate;
        const dateRows = rowsByDate.get(visitDate) || [];
        dateRows.push({
            visitDate,
            paymentMode: row.paymentMode,
            patientCount: Number(row.patientCount || 0),
            consultationFeeTotal: Number(row.consultationFeeTotal || 0)
        });
        rowsByDate.set(visitDate, dateRows);
    }

    const summaryRows = [];
    for (const [visitDate, dateRows] of rowsByDate.entries()) {
        const qrRow = dateRows.find(row => row.paymentMode === 'QR') || {
            visitDate,
            paymentMode: 'QR',
            patientCount: 0,
            consultationFeeTotal: 0
        };
        const cashRow = dateRows.find(row => row.paymentMode === 'Cash') || {
            visitDate,
            paymentMode: 'Cash',
            patientCount: 0,
            consultationFeeTotal: 0
        };

        summaryRows.push(qrRow, cashRow, {
            visitDate,
            paymentMode: 'QR + Cash',
            patientCount: qrRow.patientCount + cashRow.patientCount,
            consultationFeeTotal: qrRow.consultationFeeTotal + cashRow.consultationFeeTotal
        });
    }

    return summaryRows;
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

        replaceWorksheet(workbook, 'Payment Summary', PAYMENT_SUMMARY_COLUMNS, await getPaymentSummaryRows());
        refreshedSheets.push('Payment Summary');

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

exports.exportFullDatabaseSqlBackup = async (req, res) => {
    if (!assertCanExport(req, res)) {
        return;
    }

    try {
        ensureBackupDir();
        const sql = await buildSqlBackup();
        fs.writeFileSync(SQL_BACKUP_FILE_PATH, sql, 'utf8');

        res.json({
            message: 'SQL database backup exported successfully',
            fileName: SQL_BACKUP_FILE_NAME,
            tableCount: SQL_TABLES.length,
            downloadUrl: '/api/export/sql/download'
        });
    } catch (error) {
        console.error('SQL export failed:', error);
        res.status(500).json({ message: 'SQL database backup export failed', error: error.message });
    }
};

exports.downloadFullDatabaseSqlBackup = async (req, res) => {
    if (!assertCanExport(req, res)) {
        return;
    }

    if (!fs.existsSync(SQL_BACKUP_FILE_PATH)) {
        return res.status(404).json({ message: 'No SQL database backup file found yet' });
    }

    res.download(SQL_BACKUP_FILE_PATH, SQL_BACKUP_FILE_NAME);
};

exports.exportSqlTableBackups = async (req, res) => {
    if (!assertCanExport(req, res)) {
        return;
    }

    try {
        ensureSqlTableBackupDir();

        const files = [];
        for (const tableConfig of SQL_TABLES) {
            const sql = await buildSqlTableBackup(tableConfig);
            const fileName = getSqlTableBackupFileName(tableConfig.name);
            fs.writeFileSync(getSqlTableBackupFilePath(tableConfig.name), sql, 'utf8');
            files.push({
                table: tableConfig.name,
                fileName,
                downloadUrl: `/api/export/sql/tables/${tableConfig.name}/download`
            });
        }

        res.json({
            message: 'SQL table backups exported successfully',
            tableCount: files.length,
            files
        });
    } catch (error) {
        console.error('SQL table export failed:', error);
        res.status(500).json({ message: 'SQL table backup export failed', error: error.message });
    }
};

exports.downloadSqlTableBackup = async (req, res) => {
    if (!assertCanExport(req, res)) {
        return;
    }

    const tableName = req.params.table;
    const tableConfig = getSqlTableConfig(tableName);
    if (!tableConfig) {
        return res.status(400).json({ message: 'Unsupported SQL backup table' });
    }

    const filePath = getSqlTableBackupFilePath(tableName);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: 'No SQL table backup file found yet' });
    }

    res.download(filePath, getSqlTableBackupFileName(tableName));
};

exports.importFullDatabaseSqlBackup = async (req, res) => {
    if (!assertCanImport(req, res)) {
        return;
    }

    const sql = typeof req.body?.sql === 'string' ? req.body.sql : '';
    if (!sql.trim()) {
        return res.status(400).json({ message: 'SQL backup content is required' });
    }

    const statements = splitSqlStatements(stripSqlComments(sql));
    if (statements.length === 0) {
        return res.status(400).json({ message: 'No SQL statements found in backup file' });
    }

    const unsupportedStatement = statements.find(statement => !isAllowedImportStatement(statement));
    if (unsupportedStatement) {
        return res.status(400).json({
            message: 'Unsupported SQL statement found. Import only accepts SQL files generated by this application.',
            statement: unsupportedStatement.slice(0, 120)
        });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        for (const statement of statements) {
            await connection.query(statement);
        }
        await connection.commit();

        res.json({
            message: 'SQL database backup imported successfully',
            statementCount: statements.length,
            tableCount: SQL_TABLES.length
        });
    } catch (error) {
        await connection.query('SET FOREIGN_KEY_CHECKS=1');
        await connection.rollback();
        console.error('SQL import failed:', error);
        res.status(500).json({ message: 'SQL database backup import failed', error: error.message });
    } finally {
        connection.release();
    }
};

exports.importSqlTableBackups = async (req, res) => {
    if (!assertCanImport(req, res)) {
        return;
    }

    const files = Array.isArray(req.body?.files) ? req.body.files : [];
    if (files.length === 0) {
        return res.status(400).json({ message: 'At least one SQL table backup file is required' });
    }

    const selectedTables = new Set();
    const insertsByTable = new Map();
    let statementCount = 0;

    for (const file of files) {
        const sql = typeof file?.sql === 'string' ? file.sql : '';
        if (!sql.trim()) {
            return res.status(400).json({ message: `SQL content is required for ${file?.fileName || 'selected file'}` });
        }

        const statements = splitSqlStatements(stripSqlComments(sql));
        if (statements.length === 0) {
            return res.status(400).json({ message: `No SQL statements found in ${file?.fileName || 'selected file'}` });
        }

        const unsupportedStatement = statements.find(statement => !isAllowedImportStatement(statement));
        if (unsupportedStatement) {
            return res.status(400).json({
                message: 'Unsupported SQL statement found. Import only accepts SQL files generated by this application.',
                statement: unsupportedStatement.slice(0, 120)
            });
        }

        for (const statement of statements) {
            const normalized = statement.trim().replace(/\s+/g, ' ').toUpperCase();
            if (normalized === 'SET FOREIGN_KEY_CHECKS=0' || normalized === 'SET FOREIGN_KEY_CHECKS=1') {
                continue;
            }

            const tableName = getStatementTableName(statement);
            if (!tableName || !getSqlTableConfig(tableName)) {
                return res.status(400).json({ message: 'Unsupported table found in SQL table backup' });
            }

            if (tableName === 'users') {
                return res.status(400).json({
                    message: 'Users table import is disabled from UI. Please import users.sql manually first.'
                });
            }

            selectedTables.add(tableName);
            if (normalized.startsWith('INSERT INTO')) {
                const existingStatements = insertsByTable.get(tableName) || [];
                existingStatements.push(statement);
                insertsByTable.set(tableName, existingStatements);
                statementCount += 1;
            }
        }
    }

    if (selectedTables.size === 0) {
        return res.status(400).json({ message: 'No importable non-user table data found in selected files' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        await connection.query('SET FOREIGN_KEY_CHECKS=0');

        for (const tableConfig of [...SQL_TABLES].reverse()) {
            if (selectedTables.has(tableConfig.name)) {
                await connection.query(`DELETE FROM ${quoteIdentifier(tableConfig.name)}`);
            }
        }

        for (const tableConfig of SQL_TABLES) {
            const insertStatements = insertsByTable.get(tableConfig.name) || [];
            for (const statement of insertStatements) {
                await connection.query(statement);
            }
        }

        await connection.query('SET FOREIGN_KEY_CHECKS=1');
        await connection.commit();

        res.json({
            message: 'SQL table backups imported successfully',
            statementCount,
            tableCount: selectedTables.size,
            importedTables: SQL_TABLES
                .filter(table => selectedTables.has(table.name))
                .map(table => table.name)
        });
    } catch (error) {
        await connection.query('SET FOREIGN_KEY_CHECKS=1');
        await connection.rollback();
        console.error('SQL table import failed:', error);
        res.status(500).json({ message: 'SQL table backup import failed', error: error.message });
    } finally {
        connection.release();
    }
};

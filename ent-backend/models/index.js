const db = require('../config/db.config');

const ensureColumn = async (connection, tableName, columnName, definition) => {
    const [rows] = await connection.query(
        `
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
        `,
        [tableName, columnName]
    );

    if (rows.length === 0) {
        await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
        console.log(`Added ${tableName}.${columnName}`);
    }
};

const ensureUpdatedAt = async (connection, tableName) => {
    await ensureColumn(connection, tableName, 'updatedAt', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
};

const INITIAL_ADMIN_USER = {
    id: '1',
    username: 'admin',
    fullName: 'System Admin',
    mobile: '9999999999',
    role: 'admin'
};

const ensureInitialAdminUser = async () => {
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
        throw new Error('ADMIN_PASSWORD is required in ent-backend/.env for the initial admin login');
    }

    const connection = await db.getConnection();
    try {
        await connection.query(
            `
            INSERT INTO users (id, username, password, fullName, mobile, role)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                username = VALUES(username),
                password = VALUES(password),
                fullName = VALUES(fullName),
                mobile = VALUES(mobile),
                role = VALUES(role)
            `,
            [
                INITIAL_ADMIN_USER.id,
                INITIAL_ADMIN_USER.username,
                adminPassword,
                INITIAL_ADMIN_USER.fullName,
                INITIAL_ADMIN_USER.mobile,
                INITIAL_ADMIN_USER.role
            ]
        );
        console.log('Initial admin user verified.');
    } finally {
        connection.release();
    }
};

const createTables = async () => {
    try {
        const connection = await db.getConnection();
        console.log('Connected to database for schema creation.');

        // 1. Users Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(255) PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                fullName VARCHAR(255) NOT NULL,
                mobile VARCHAR(20),
                role ENUM('admin', 'doctor', 'receptionist', 'billing') NOT NULL,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await ensureColumn(connection, 'users', 'doctorTitle', 'VARCHAR(255) NULL');
        await ensureColumn(connection, 'users', 'doctorRegistrationNumber', 'VARCHAR(255) NULL');
        await ensureColumn(connection, 'users', 'doctorClinicAddress', 'TEXT NULL');
        await ensureColumn(connection, 'users', 'doctorClinicPhone', 'VARCHAR(50) NULL');
        await ensureColumn(connection, 'users', 'doctorEmail', 'VARCHAR(255) NULL');
        await ensureColumn(connection, 'users', 'doctorTimings', 'VARCHAR(255) NULL');
        await ensureUpdatedAt(connection, 'users');
        console.log('Users table created/verified.');

        // 2. Patients Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS patients (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                age INT,
                gender VARCHAR(10),
                mobile VARCHAR(20),
                visitReason TEXT,
                status VARCHAR(50) DEFAULT 'Waiting',
                medicalBackground TEXT,
                latestVisitDate DATE,
                tokenNumber INT DEFAULT 0,
                consultationFee DECIMAL(10, 2) DEFAULT 0,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await ensureColumn(connection, 'patients', 'tokenNumber', "INT DEFAULT 0 AFTER latestVisitDate");
        await ensureColumn(connection, 'patients', 'paymentMode', "VARCHAR(20) NOT NULL DEFAULT 'QR' AFTER consultationFee");
        await ensureUpdatedAt(connection, 'patients');
        console.log('Patients table created/verified.');

        // 3. Medicines Master Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS medicines (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        await ensureUpdatedAt(connection, 'medicines');
        console.log('Medicines table created/verified.');

        // 4. Diagnoses Master Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS diagnoses (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        await ensureUpdatedAt(connection, 'diagnoses');
        console.log('Diagnoses table created/verified.');

        // 5. Dosages Master Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS dosages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        await ensureUpdatedAt(connection, 'dosages');
        console.log('Dosages table created/verified.');

        // 6. Prescriptions Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS prescriptions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                patientId INT,
                date DATE NOT NULL,
                notes TEXT,
                nextVisitDate DATE,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (patientId) REFERENCES patients(id) ON DELETE CASCADE
            )
        `);
        await ensureUpdatedAt(connection, 'prescriptions');
        console.log('Prescriptions table created/verified.');

        // 7. Prescription Medicines Table (Many-to-Many / Detail)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS prescription_medicines (
                id INT AUTO_INCREMENT PRIMARY KEY,
                prescriptionId INT,
                medicineId INT,
                medicineName VARCHAR(255), -- Storing name for history or custom meds
                dosage VARCHAR(100),
                duration VARCHAR(100),
                instructions TEXT,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (prescriptionId) REFERENCES prescriptions(id) ON DELETE CASCADE,
                FOREIGN KEY (medicineId) REFERENCES medicines(id) ON DELETE SET NULL
            )
        `);
        await ensureUpdatedAt(connection, 'prescription_medicines');
        console.log('Prescription Medicines table created/verified.');

        // 8. Patient Current Diagnosis (Many-to-Many map for "currentDiagnosis" array in JSON)
        // We can normalize this or just store it as JSON string in patient table. 
        // For strict SQL, a link table is better.
        await connection.query(`
             CREATE TABLE IF NOT EXISTS patient_diagnoses (
                patientId INT,
                diagnosisName VARCHAR(255),
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (patientId, diagnosisName),
                FOREIGN KEY (patientId) REFERENCES patients(id) ON DELETE CASCADE
             )
        `);
        await ensureUpdatedAt(connection, 'patient_diagnoses');
        console.log('Patient Diagnoses table created/verified.');

        // 9. Export Runs Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS export_runs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                exportType VARCHAR(100) NOT NULL,
                status VARCHAR(30) NOT NULL,
                filePath TEXT,
                affectedDates TEXT,
                refreshedSheets TEXT,
                message TEXT,
                startedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completedAt TIMESTAMP NULL
            )
        `);
        console.log('Export Runs table created/verified.');

        connection.release();
        return true;
    } catch (error) {
        console.error('Error creating tables:', error);
        return false;
    }
};

module.exports = { createTables, ensureInitialAdminUser };

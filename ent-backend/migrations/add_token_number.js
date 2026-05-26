const db = require('../config/db.config');

const addTokenNumberColumn = async () => {
    try {
        const connection = await db.getConnection();
        console.log('Connected to database.');

        // Check if column exists
        const [columns] = await connection.query("SHOW COLUMNS FROM patients LIKE 'tokenNumber'");

        if (columns.length === 0) {
            console.log('Adding tokenNumber column...');
            await connection.query("ALTER TABLE patients ADD COLUMN tokenNumber INT DEFAULT 0 AFTER latestVisitDate");
            console.log('Column added successfully.');
        } else {
            console.log('tokenNumber column already exists.');
        }

        connection.release();
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

addTokenNumberColumn();

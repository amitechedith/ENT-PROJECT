const mysql = require('mysql2/promise');
require('dotenv').config();

const initDb = async () => {
    try {
        // Connect without database selected
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD
        });

        console.log('Connected to MySQL server.');

        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\`;`);
        console.log(`Database '${process.env.DB_NAME}' created or already exists.`);

        await connection.end();
    } catch (error) {
        console.error('Failed to initialize database:', error);
        process.exit(1);
    }
};

initDb();

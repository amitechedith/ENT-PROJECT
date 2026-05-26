const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();
const db = require('./config/db.config');
const { createTables } = require('./models');

const app = express();

const authRoutes = require('./routes/auth.routes');
const masterRoutes = require('./routes/master.routes');
const patientRoutes = require('./routes/patient.routes');

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/master', masterRoutes);
app.use('/api/patients', patientRoutes);

// Simple route to verify server is running
app.get('/', (req, res) => {
    res.json({ message: 'Welcome to ENT Clinic Backend API.' });
});

// Test DB Connection
app.get('/test-db', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT 1 + 1 AS solution');
        res.json({ message: 'Database connected successfully!', solution: rows[0].solution });
    } catch (error) {
        console.error('Database connection failed:', error);
        res.status(500).json({ message: 'Database connection failed', error: error.message });
    }
});

const PORT = process.env.PORT || 3000;

createTables()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}.`);
        });
    })
    .catch((error) => {
        console.error('Failed to prepare database schema:', error);
        process.exit(1);
    });

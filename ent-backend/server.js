const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();
const db = require('./config/db.config');
const { createTables, ensureInitialAdminUser } = require('./models');

const app = express();

const authRoutes = require('./routes/auth.routes');
const masterRoutes = require('./routes/master.routes');
const patientRoutes = require('./routes/patient.routes');
const exportRoutes = require('./routes/export.routes');

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/master', masterRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/export', exportRoutes);

// Serve Angular SPA static files in production
if (process.env.NODE_ENV === 'production') {
    const angularDistPath = path.join(__dirname, '../ent-dashboard/dist/ent-dashboard');
    app.use(express.static(angularDistPath, { maxAge: '1d', etag: false }));
    
    // SPA route fallback: serve index.html for all non-API routes
    app.get(/^(?!\/api).*/, (req, res) => {
        res.sendFile(path.join(angularDistPath, 'index.html'));
    });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API info endpoint
app.get('/api', (req, res) => {
    res.json({ message: 'Welcome to ENT Clinic Backend API.', version: '1.0.0' });
});

// Test DB Connection
app.get('/api/test-db', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT 1 + 1 AS solution');
        res.json({ message: 'Database connected successfully!', solution: rows[0].solution });
    } catch (error) {
        console.error('Database connection failed:', error);
        res.status(500).json({ message: 'Database connection failed', error: error.message });
    }
});

// Development fallback
if (process.env.NODE_ENV !== 'production') {
    app.get('/', (req, res) => {
        res.json({ message: 'Welcome to ENT Clinic Backend API.', mode: 'development' });
    });
}

const PORT = process.env.PORT || 3000;

createTables()
    .then(() => ensureInitialAdminUser())
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}.`);
        });
    })
    .catch((error) => {
        console.error('Failed to prepare database schema:', error);
        process.exit(1);
    });

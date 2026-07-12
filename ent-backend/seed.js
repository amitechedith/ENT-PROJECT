const db = require('./config/db.config');
const { createTables, ensureInitialAdminUser } = require('./models/index');

const seedData = async () => {
    try {
        console.log('Starting Database Seeding...');

        // 1. Create Tables
        const tablesCreated = await createTables();
        if (!tablesCreated) {
            console.error('Failed to create tables. Exiting.');
            process.exit(1);
        }

        const connection = await db.getConnection();

        // 2. Seed Users
        await ensureInitialAdminUser();

        const users = [
            ['2', 'doctor', 'doctor', 'Dr. Amit Panchal', '9876543210', 'doctor', null, 'MBBS, MS - ENT', '12345/MC', '123, Health Avenue, Medical City', '+91 98765 43210', 'doctor@email.com', '10AM - 2PM, 5PM - 9PM', 500],
            ['3', 'reception', 'reception', 'Reception Desk', '8888888888', 'receptionist', '2', null, null, null, null, null, null, null],
            ['4', 'billing', 'billing', 'Billing Desk', '7777777777', 'billing', '2', null, null, null, null, null, null, null]
        ];

        for (const user of users) {
            // Upsert (Insert or Update)
            await connection.query(`
                INSERT INTO users (
                    id, username, password, fullName, mobile, role,
                    assignedDoctorId, doctorTitle, doctorRegistrationNumber, doctorClinicAddress, doctorClinicPhone, doctorEmail, doctorTimings, defaultConsultationFee
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    fullName = VALUES(fullName),
                    mobile = VALUES(mobile),
                    password = VALUES(password),
                    assignedDoctorId = VALUES(assignedDoctorId),
                    doctorTitle = VALUES(doctorTitle),
                    doctorRegistrationNumber = VALUES(doctorRegistrationNumber),
                    doctorClinicAddress = VALUES(doctorClinicAddress),
                    doctorClinicPhone = VALUES(doctorClinicPhone),
                    doctorEmail = VALUES(doctorEmail),
                    doctorTimings = VALUES(doctorTimings),
                    defaultConsultationFee = VALUES(defaultConsultationFee)
             `, user);
        }
        console.log('Users seeded.');

        // 3. Seed Medicines
        const medicines = [
            "Amoxicillin 500mg", "Paracetamol 500mg", "Betahistine 16mg", "Meclizine 25mg", "Crosine 200mg"
        ];
        for (const med of medicines) {
            await connection.query(`INSERT IGNORE INTO medicines (name) VALUES (?)`, [med]);
        }
        console.log('Medicines seeded.');

        // 4. Seed Diagnoses
        const diagnoses = [
            "Throat Pain", "Running Nose", "Fever"
        ];
        for (const diag of diagnoses) {
            await connection.query(`INSERT IGNORE INTO diagnoses (name) VALUES (?)`, [diag]);
        }
        console.log('Diagnoses seeded.');

        // 5. Seed Dosages
        const dosages = [
            "1-0-1", "1-0-0", "0-0-1", "0-1-0", "1-1-1", "SOS", "1-1-0", "0-1-1"
        ];
        for (const dosage of dosages) {
            await connection.query(`INSERT IGNORE INTO dosages (name) VALUES (?)`, [dosage]);
        }
        console.log('Dosages seeded.');

        // 6. Seed Patients (Mock Data)
        // Note: Using simpler structure for seed, complex relations like prescriptions can be added manually or expanded here.
        const patients = [
            {
                name: "Ravi Kumar", age: 42, gender: "Male", mobile: "9876543210",
                visitReason: "Fever and throat pain", status: "Payment Done",
                medicalBackground: "No known allergies. Previous surgery for appendicitis in 2015.",
                diagnoses: ["Throat Pain"]
            },
            {
                name: "Anjali Sharma", age: 35, gender: "Female", mobile: "9876501123",
                visitReason: "Dizziness and mild headache", status: "In Consultation",
                medicalBackground: "No known allergies. Previous surgery for appendicitis in 2015.",
                diagnoses: ["Fever"]
            },
            {
                name: "Amit Kumar", age: 42, gender: "Male", mobile: "9876543210",
                visitReason: "Fever and throat pain", status: "Waiting",
                medicalBackground: "No known allergies. Previous surgery for appendicitis in 2015.",
                diagnoses: ["Throat Pain"]
            },
            {
                name: "Manali Sharma", age: 35, gender: "Female", mobile: "9876501123",
                visitReason: "Dizziness and mild headache", status: "Waiting",
                diagnoses: []
            }
        ];

        for (const p of patients) {
            // Check if patient exists by mobile and name to prevent duplication on re-seed
            const [exist] = await connection.query('SELECT id FROM patients WHERE mobile = ? AND name = ?', [p.mobile, p.name]);

            let patientId;
            if (exist.length > 0) {
                patientId = exist[0].id;
                // Update revisit date to TODAY so they show up in dashboard
                await connection.query('UPDATE patients SET latestVisitDate = CURDATE(), status = ? WHERE id = ?', [p.status, patientId]);
            } else {
                const [res] = await connection.query(`
                    INSERT INTO patients (name, age, gender, mobile, visitReason, status, medicalBackground, latestVisitDate)
                    VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE())
                `, [p.name, p.age, p.gender, p.mobile, p.visitReason, p.status, p.medicalBackground || null]);
                patientId = res.insertId;
            }

            // Seed Patient Diagnoses
            if (p.diagnoses && p.diagnoses.length > 0) {
                for (const d of p.diagnoses) {
                    await connection.query(`INSERT IGNORE INTO patient_diagnoses (patientId, diagnosisName) VALUES (?, ?)`, [patientId, d]);
                }
            }
        }
        console.log('Patients seeded.');

        console.log('Database seeding completed successfully!');
        connection.release();
        process.exit(0);

    } catch (error) {
        console.error('Seeding failed:', error);
        process.exit(1);
    }
};

seedData();

const db = require('../config/db.config');
const { ensureDefaultAccessControlsForDoctor } = require('../models');

const ACCESS_ROLES = ['receptionist', 'billing'];
const ACCESS_TABS = ['reception', 'doctor', 'billing', 'history'];
const STAFF_ROLES = ['receptionist', 'billing'];

const mapAccessControlRow = (row) => ({
    doctorId: row.doctorId,
    targetRole: row.targetRole,
    tabKey: row.tabKey,
    isAllowed: !!row.isAllowed
});

const assertAssignedDoctor = async (role, assignedDoctorId, res) => {
    if (!STAFF_ROLES.includes(role)) {
        return true;
    }

    if (!assignedDoctorId) {
        res.status(400).json({ message: 'Doctor selection is required for Reception and Prescription users' });
        return false;
    }

    const [doctorRows] = await db.query('SELECT id FROM users WHERE id = ? AND role = ?', [assignedDoctorId, 'doctor']);
    if (doctorRows.length === 0) {
        res.status(400).json({ message: 'Selected doctor was not found' });
        return false;
    }

    return true;
};

exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log("Login attempt:", username);

        const [users] = await db.query('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);

        if (users.length === 0) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        const user = users[0];
        // In a real app, use JWT. For now, sending user info back as requested.
        const { password: _, ...userWithoutPassword } = user;

        res.json({
            message: 'Login successful',
            user: userWithoutPassword
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login' });
    }
};

exports.register = async (req, res) => {
    // Only admins should ideally call this, but basic impl for now
    try {
        const {
            id,
            username,
            password,
            fullName,
            role,
            mobile,
            doctorTitle,
            doctorRegistrationNumber,
            doctorClinicAddress,
            doctorClinicPhone,
            doctorEmail,
            doctorTimings,
            defaultConsultationFee,
            assignedDoctorId
        } = req.body;

        // Simple validation
        if (!username || !password || !fullName || !role) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        if (role === 'doctor' && (!doctorTitle || !doctorRegistrationNumber || !doctorClinicAddress || !doctorClinicPhone || !doctorEmail || !doctorTimings)) {
            return res.status(400).json({ message: 'Doctor profile fields are required for doctor role' });
        }

        if (!await assertAssignedDoctor(role, assignedDoctorId, res)) {
            return;
        }

        // Check if username exists for a DIFFERENT user (exclude current user if updating)
        const [existing] = await db.query('SELECT * FROM users WHERE username = ? AND id != ?', [username, id || '']);
        if (existing.length > 0) {
            return res.status(400).json({ message: 'Username already exists' });
        }

        // Generate ID if not provided (timestamp based)
        const userId = id || Date.now().toString();

        // Check if user exists to determine if this is an update or create
        if (id) {
            const [userExists] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
            if (userExists.length > 0) {
                // Update existing user
                await db.query(
                    `UPDATE users
                     SET username = ?, password = ?, fullName = ?, mobile = ?, role = ?, assignedDoctorId = ?,
                         doctorTitle = ?, doctorRegistrationNumber = ?, doctorClinicAddress = ?,
                         doctorClinicPhone = ?, doctorEmail = ?, doctorTimings = ?, defaultConsultationFee = ?
                     WHERE id = ?`,
                    [
                        username,
                        password,
                        fullName,
                        mobile,
                        role,
                        STAFF_ROLES.includes(role) ? assignedDoctorId : null,
                        role === 'doctor' ? doctorTitle : null,
                        role === 'doctor' ? doctorRegistrationNumber : null,
                        role === 'doctor' ? doctorClinicAddress : null,
                        role === 'doctor' ? doctorClinicPhone : null,
                        role === 'doctor' ? doctorEmail : null,
                        role === 'doctor' ? doctorTimings : null,
                        role === 'doctor' ? Number(defaultConsultationFee || 0) || null : null,
                        id
                    ]
                );
                if (role === 'doctor') {
                    await ensureDefaultAccessControlsForDoctor(db, id);
                }
                return res.json({ message: 'User updated successfully', id });
            }
        }

        // Create new user
        await db.query(
            `INSERT INTO users (
                id, username, password, fullName, mobile, role,
                assignedDoctorId, doctorTitle, doctorRegistrationNumber, doctorClinicAddress, doctorClinicPhone, doctorEmail, doctorTimings, defaultConsultationFee
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                username,
                password,
                fullName,
                mobile,
                role,
                STAFF_ROLES.includes(role) ? assignedDoctorId : null,
                role === 'doctor' ? doctorTitle : null,
                role === 'doctor' ? doctorRegistrationNumber : null,
                role === 'doctor' ? doctorClinicAddress : null,
                role === 'doctor' ? doctorClinicPhone : null,
                role === 'doctor' ? doctorEmail : null,
                role === 'doctor' ? doctorTimings : null,
                role === 'doctor' ? Number(defaultConsultationFee || 0) || null : null
            ]
        );
        if (role === 'doctor') {
            await ensureDefaultAccessControlsForDoctor(db, userId);
        }

        res.status(201).json({ message: 'User created successfully', id: userId });

    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.getUsers = async (req, res) => {
    try {
        const [users] = await db.query(`
            SELECT id, username, password, fullName, mobile, role, assignedDoctorId,
                   doctorTitle, doctorRegistrationNumber, doctorClinicAddress, doctorClinicPhone,
                   doctorEmail, doctorTimings, defaultConsultationFee
            FROM users
        `);
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching users' });
    }
}

exports.getAccessControls = async (req, res) => {
    try {
        const [controls] = await db.query(`
            SELECT doctorId, targetRole, tabKey, isAllowed
            FROM role_access_controls
            ORDER BY doctorId, targetRole, tabKey
        `);

        res.json(controls.map(mapAccessControlRow));
    } catch (error) {
        console.error('Get access controls error:', error);
        res.status(500).json({ message: 'Error fetching access controls' });
    }
}

exports.updateAccessControls = async (req, res) => {
    try {
        const controls = Array.isArray(req.body?.controls) ? req.body.controls : [];
        if (controls.length === 0) {
            return res.status(400).json({ message: 'Access controls are required' });
        }

        const invalidControl = controls.find(control =>
            !control?.doctorId
            || !ACCESS_ROLES.includes(control?.targetRole)
            || !ACCESS_TABS.includes(control?.tabKey)
            || typeof control?.isAllowed !== 'boolean'
        );
        if (invalidControl) {
            return res.status(400).json({ message: 'Invalid access control found' });
        }

        const doctorIds = [...new Set(controls.map(control => control.doctorId))];
        const [doctorRows] = await db.query(
            `SELECT id FROM users WHERE role = 'doctor' AND id IN (${doctorIds.map(() => '?').join(', ')})`,
            doctorIds
        );
        const validDoctorIds = new Set(doctorRows.map(row => row.id));
        if (doctorIds.some(doctorId => !validDoctorIds.has(doctorId))) {
            return res.status(400).json({ message: 'Access controls must belong to a valid doctor' });
        }

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            for (const control of controls) {
                await connection.query(
                    `
                    INSERT INTO role_access_controls (doctorId, targetRole, tabKey, isAllowed)
                    VALUES (?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed)
                    `,
                    [control.doctorId, control.targetRole, control.tabKey, control.isAllowed ? 1 : 0]
                );
            }

            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

        const [updatedControls] = await db.query(`
            SELECT doctorId, targetRole, tabKey, isAllowed
            FROM role_access_controls
            ORDER BY doctorId, targetRole, tabKey
        `);

        res.json({
            message: 'Access controls updated',
            controls: updatedControls.map(mapAccessControlRow)
        });
    } catch (error) {
        console.error('Update access controls error:', error);
        res.status(500).json({ message: 'Error updating access controls' });
    }
}

exports.updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            username,
            fullName,
            mobile,
            password,
            role,
            doctorTitle,
            doctorRegistrationNumber,
            doctorClinicAddress,
            doctorClinicPhone,
            doctorEmail,
            doctorTimings,
            defaultConsultationFee,
            assignedDoctorId
        } = req.body;

        const [currentRows] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
        if (currentRows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const currentUser = currentRows[0];
        const finalPassword = typeof password === 'string' && password.trim()
            ? password
            : currentUser.password;

        // Check if username is being changed to one that already exists for another user
        if (username) {
            const [existing] = await db.query('SELECT * FROM users WHERE username = ? AND id != ?', [username, id]);
            if (existing.length > 0) {
                return res.status(400).json({ message: 'Username already exists' });
            }
        }

        if (role === 'doctor' && (!doctorTitle || !doctorRegistrationNumber || !doctorClinicAddress || !doctorClinicPhone || !doctorEmail || !doctorTimings)) {
            return res.status(400).json({ message: 'Doctor profile fields are required for doctor role' });
        }

        if (!await assertAssignedDoctor(role, assignedDoctorId, res)) {
            return;
        }

        // Build dynamic query or just update all allowed
        await db.query(
            `UPDATE users
             SET username = ?, fullName = ?, mobile = ?, password = ?, role = ?, assignedDoctorId = ?,
                 doctorTitle = ?, doctorRegistrationNumber = ?, doctorClinicAddress = ?,
                 doctorClinicPhone = ?, doctorEmail = ?, doctorTimings = ?, defaultConsultationFee = ?
             WHERE id = ?`,
            [
                username,
                fullName,
                mobile,
                finalPassword,
                role,
                STAFF_ROLES.includes(role) ? assignedDoctorId : null,
                role === 'doctor' ? doctorTitle : null,
                role === 'doctor' ? doctorRegistrationNumber : null,
                role === 'doctor' ? doctorClinicAddress : null,
                role === 'doctor' ? doctorClinicPhone : null,
                role === 'doctor' ? doctorEmail : null,
                role === 'doctor' ? doctorTimings : null,
                role === 'doctor' ? Number(defaultConsultationFee || 0) || null : null,
                id
            ]
        );
        if (role === 'doctor') {
            await ensureDefaultAccessControlsForDoctor(db, id);
        }
        res.json({ message: 'User updated' });

    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ message: 'Error updating user' });
    }
}

exports.changePassword = async (req, res) => {
    try {
        const { id } = req.params;
        const { oldPassword, newPassword, confirmPassword } = req.body;

        if (!oldPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ message: 'Old password, new password, and confirm password are required' });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ message: 'New password and confirm password do not match' });
        }

        if (newPassword.length < 4) {
            return res.status(400).json({ message: 'New password must be at least 4 characters' });
        }

        const [rows] = await db.query('SELECT id, password, role FROM users WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const user = rows[0];
        if (user.role === 'admin') {
            return res.status(403).json({ message: 'Admin password changes are managed from Admin users' });
        }

        if (user.password !== oldPassword) {
            return res.status(400).json({ message: 'Old password is incorrect' });
        }

        await db.query('UPDATE users SET password = ? WHERE id = ?', [newPassword, id]);
        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ message: 'Error updating password' });
    }
}

exports.deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM users WHERE id = ?', [id]);
        res.json({ message: 'User deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting user' });
    }
}

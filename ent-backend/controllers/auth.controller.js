const db = require('../config/db.config');

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
            doctorTimings
        } = req.body;

        // Simple validation
        if (!username || !password || !fullName || !role) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        if (role === 'doctor' && (!doctorTitle || !doctorRegistrationNumber || !doctorClinicAddress || !doctorClinicPhone || !doctorEmail || !doctorTimings)) {
            return res.status(400).json({ message: 'Doctor profile fields are required for doctor role' });
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
                     SET username = ?, password = ?, fullName = ?, mobile = ?, role = ?,
                         doctorTitle = ?, doctorRegistrationNumber = ?, doctorClinicAddress = ?,
                         doctorClinicPhone = ?, doctorEmail = ?, doctorTimings = ?
                     WHERE id = ?`,
                    [
                        username,
                        password,
                        fullName,
                        mobile,
                        role,
                        role === 'doctor' ? doctorTitle : null,
                        role === 'doctor' ? doctorRegistrationNumber : null,
                        role === 'doctor' ? doctorClinicAddress : null,
                        role === 'doctor' ? doctorClinicPhone : null,
                        role === 'doctor' ? doctorEmail : null,
                        role === 'doctor' ? doctorTimings : null,
                        id
                    ]
                );
                return res.json({ message: 'User updated successfully', id });
            }
        }

        // Create new user
        await db.query(
            `INSERT INTO users (
                id, username, password, fullName, mobile, role,
                doctorTitle, doctorRegistrationNumber, doctorClinicAddress, doctorClinicPhone, doctorEmail, doctorTimings
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                username,
                password,
                fullName,
                mobile,
                role,
                role === 'doctor' ? doctorTitle : null,
                role === 'doctor' ? doctorRegistrationNumber : null,
                role === 'doctor' ? doctorClinicAddress : null,
                role === 'doctor' ? doctorClinicPhone : null,
                role === 'doctor' ? doctorEmail : null,
                role === 'doctor' ? doctorTimings : null
            ]
        );

        res.status(201).json({ message: 'User created successfully', id: userId });

    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.getUsers = async (req, res) => {
    try {
        const [users] = await db.query(`
            SELECT id, username, password, fullName, mobile, role,
                   doctorTitle, doctorRegistrationNumber, doctorClinicAddress, doctorClinicPhone, doctorEmail, doctorTimings
            FROM users
        `);
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching users' });
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
            doctorTimings
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

        // Build dynamic query or just update all allowed
        await db.query(
            `UPDATE users
             SET username = ?, fullName = ?, mobile = ?, password = ?, role = ?,
                 doctorTitle = ?, doctorRegistrationNumber = ?, doctorClinicAddress = ?,
                 doctorClinicPhone = ?, doctorEmail = ?, doctorTimings = ?
             WHERE id = ?`,
            [
                username,
                fullName,
                mobile,
                finalPassword,
                role,
                role === 'doctor' ? doctorTitle : null,
                role === 'doctor' ? doctorRegistrationNumber : null,
                role === 'doctor' ? doctorClinicAddress : null,
                role === 'doctor' ? doctorClinicPhone : null,
                role === 'doctor' ? doctorEmail : null,
                role === 'doctor' ? doctorTimings : null,
                id
            ]
        );
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

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

router.post('/login', authController.login);
router.post('/register', authController.register); // Or /users
router.get('/users', authController.getUsers);
router.get('/access-controls', authController.getAccessControls);
router.put('/access-controls', authController.updateAccessControls);
router.put('/users/:id', authController.updateUser);
router.put('/users/:id/password', authController.changePassword);
router.delete('/users/:id', authController.deleteUser);

module.exports = router;

const express = require('express');
const router = express.Router();


const users = [];


const createUser = (userData) => {
    const newUser = { 
        id: Date.now().toString(), 
        name: userData.name || '',
        email: userData.email,
        password: userData.password, 
        createdAt: new Date()
    };
    users.push(newUser);
    return newUser;
};

const authenticateUser = (email, password) => {
    return users.find(user => user.email === email && user.password === password);
};

const getUserById = (id) => {
    return users.find(user => user.id === id);
};

const updateUser = (id, updateData) => {
    const userIndex = users.findIndex(user => user.id === id);
    if (userIndex === -1) return null;

    const user = users[userIndex];
    
    if (updateData.name !== undefined) user.name = updateData.name;
    if (updateData.email !== undefined) user.email = updateData.email;
    if (updateData.password !== undefined) user.password = updateData.password;

    return user;
};

const authenticateToken = require('../middleware/auth');

router.get('/me', authenticateToken, (req, res) => {
    const user = getUserById(req.user.id);
    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    const { password, ...userProfile } = user;
    res.json(userProfile);
});

router.put('/me', authenticateToken, (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        const updatedUser = updateUser(req.user.id, { name, email, password });

        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        const { password: _, ...userProfile } = updatedUser;
        
        res.json({
            message: 'Profile updated successfully',
            user: userProfile
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = {
    router,
    users,
    createUser,
    authenticateUser
};

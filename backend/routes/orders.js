const express = require('express');
const router = express.Router();

let orders = []; 

const authenticateToken  = require('../middleware/auth');

router.get('/my', authenticateToken, (req, res) => {
    const userOrders = orders.filter(order => order.userId === req.user.id);
    res.json(userOrders);
});

module.exports = router;
const users = [];
const createUser = (userData) => {
    const newUser = { 
        id: Date.now().toString(), 
        ...userData, 
        createdAt: new Date()
    };
    users.push(newUser);
    return newUser;
};

const authenticateUser = (email, password) => {
    return users.find(user => user.email === email && user.password === password);
};

module.exports = {
    users,
    createUser,
    authenticateUser
};

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "public", "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

let products = [];


function loadDb() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
            products = data.products || [];
        }
    } catch (err) {
        console.error("Error loading db.json", err);
    }
}

function saveDb() {
    try {
        let data = {};
        if (fs.existsSync(DB_FILE)) {
            data = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
        }
        data.products = products;
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Error saving db.json", err);
    }
}

const getProducts = () => products;
const getProductById = (id) => products.find(p => p.id === id);

const createProduct = (productData) => {
    const product = {
        id: "prod_" + Date.now().toString(36),
        ...productData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    products.push(product);
    saveDb();
    return product;
};

loadDb();

module.exports = { getProducts, getProductById, createProduct, products };
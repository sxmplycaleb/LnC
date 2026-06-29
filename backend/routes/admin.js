const express = require("express");
const productsRepository = require("../repositories/products");
const ordersRepository = require("../repositories/orders");
const usersRepository = require("../repositories/users");
const { authenticate, requireAdmin } = require("../middleware/auth");
const { publicUser } = require("../services/store");

const router = express.Router();

router.use(authenticate, requireAdmin);

router.get("/auth/me", (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.get("/dashboard", (req, res) => {
  const products = productsRepository.all();
  const orders = ordersRepository.all();
  const today = new Date().toISOString().slice(0, 10);
  const ordersToday = orders.filter((order) => String(order.createdAt || "").startsWith(today));
  const paidOrders = orders.filter((order) => !["Failed", "Refunded", "Cancelled"].includes(order.paymentStatus));
  const revenue = paidOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const revenueToday = ordersToday
    .filter((order) => !["Failed", "Refunded", "Cancelled"].includes(order.paymentStatus))
    .reduce((sum, order) => sum + Number(order.total || 0), 0);
  const recentOrders = orders.slice(0, 8);
  const outOfStock = products.filter((product) => Number(product.stock || 0) <= 0);
  const lowStockProducts = products.filter((product) => Number(product.stock || 0) > 0 && Number(product.stock || 0) <= 5);
  const lowStock = lowStockProducts.slice(0, 8);
  const users = usersRepository.all ? usersRepository.all() : [];
  const dayKey = (value) => String(value || "").slice(0, 10) || "Unscheduled";
  const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return date.toISOString().slice(0, 10);
  });
  const revenueByDay = lastSevenDays.map((date) => ({
    label: date.slice(5),
    value: orders
      .filter((order) => dayKey(order.createdAt) === date)
      .reduce((sum, order) => sum + Number(order.total || 0), 0)
  }));
  const ordersByDay = lastSevenDays.map((date) => ({
    label: date.slice(5),
    value: orders.filter((order) => dayKey(order.createdAt) === date).length
  }));
  const productSales = new Map();
  const categorySales = new Map();
  for (const order of orders) {
    for (const item of order.items || []) {
      const name = item.name || item.productId || "Unknown";
      const quantity = Number(item.quantity || 0);
      productSales.set(name, (productSales.get(name) || 0) + quantity);
      const product = products.find((entry) => entry.id === item.productId);
      const category = product?.category || "Uncategorized";
      categorySales.set(category, (categorySales.get(category) || 0) + quantity);
    }
  }
  const toSortedSeries = (map) => Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  const countByStatus = (status) => orders.filter((order) => order.status === status).length;
  const failedPayments = orders.filter((order) => order.paymentStatus === "Failed");

  res.json({
    kpis: {
      totalRevenue: revenue,
      revenueToday,
      totalOrders: orders.length,
      activeCustomers: users.filter((user) => user.role !== "admin").length,
      lowStockProducts: lowStockProducts.length,
      outOfStockProducts: outOfStock.length,
      totalProducts: products.length,
      ordersToday: ordersToday.length,
      revenue
    },
    charts: {
      revenueByDay,
      ordersByDay,
      bestSellingProducts: toSortedSeries(productSales),
      salesByCategory: toSortedSeries(categorySales)
    },
    orderCards: {
      pending: countByStatus("Pending"),
      processing: countByStatus("Processing"),
      completed: countByStatus("Completed"),
      cancelled: countByStatus("Cancelled"),
      refunded: orders.filter((order) => order.paymentStatus === "Refunded").length
    },
    products,
    orders,
    recentOrders,
    lowStock,
    outOfStock,
    failedPayments: failedPayments.slice(0, 8),
    recentActivity: recentOrders.map((order) => ({
      label: `Order ${order.id} is ${order.status}`,
      at: order.createdAt
    })),
    users: users.map(publicUser),
    latestUsers: users.slice(0, 8).map(publicUser)
  });
});

module.exports = router;

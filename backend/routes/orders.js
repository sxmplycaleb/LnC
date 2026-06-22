const crypto = require("crypto");
const express = require("express");
const { readDb, writeDb, publicUser, requireSignedIn, requireAdmin } = require("../services/store");
const { initiateStkPush } = require("../services/mpesa");
const { normalizePhone, sendOrderStatus } = require("../services/whatsapp");

const router = express.Router();

function buildOrderItems(db, requestedItems) {
  const orderItems = [];

  for (const item of requestedItems) {
    const quantity = Number(item.quantity || 0);
    const product = (db.products || []).find((entry) => entry.id === item.productId);

    if (!product || quantity < 1) {
      return { error: "Your cart contains an unavailable product." };
    }

    if (product.stock < quantity) {
      return { error: `${product.name} does not have enough stock.` };
    }

    orderItems.push({
      productId: product.id,
      name: product.name,
      image: product.image,
      price: product.price,
      quantity,
      subtotal: Number((product.price * quantity).toFixed(2))
    });
  }

  return { orderItems };
}

function reduceStockForPaidOrder(db, order) {
  if (order.stockReducedAt) return { ok: true };

  for (const item of order.items || []) {
    const product = (db.products || []).find((entry) => entry.id === item.productId);
    if (!product || product.stock < item.quantity) {
      return { ok: false, error: `${item.name} is no longer available in the requested quantity.` };
    }
  }

  for (const item of order.items || []) {
    const product = (db.products || []).find((entry) => entry.id === item.productId);
    product.stock -= item.quantity;
    product.updatedAt = new Date().toISOString();
  }

  order.stockReducedAt = new Date().toISOString();
  return { ok: true };
}

router.get("/", (req, res) => {
  const user = requireSignedIn(req, res);
  if (!user) return;

  const db = readDb();
  const orders = user.role === "admin"
    ? db.orders || []
    : (db.orders || []).filter((order) => order.userId === user.id);

  res.json({ orders });
});

router.post("/", async (req, res, next) => {
  try {
    const user = requireSignedIn(req, res);
    if (!user) return;

    const requestedItems = Array.isArray(req.body.items) ? req.body.items : [];
    if (!requestedItems.length) return res.status(400).json({ error: "Add products to your cart first." });

    if (req.body.paymentMethod !== "m-pesa") {
      return res.status(400).json({
        error: "Only confirmed M-Pesa checkout is enabled. Add Stripe/PayPal credentials before accepting card or PayPal orders."
      });
    }

    const mpesaPhone = normalizePhone(req.body.mpesaPhone || user.phone);
    if (!mpesaPhone) return res.status(400).json({ error: "Enter the M-Pesa phone number." });

    const db = readDb();
    const { orderItems, error } = buildOrderItems(db, requestedItems);
    if (error) return res.status(400).json({ error });

    const subtotal = Number(orderItems.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));
    const shipping = subtotal >= 100 ? 0 : 12;
    const tax = Number((subtotal * 0.08).toFixed(2));
    const now = new Date().toISOString();
    const order = {
      id: `ord_${crypto.randomBytes(8).toString("hex")}`,
      userId: user.id,
      customer: publicUser(user),
      items: orderItems,
      shippingAddress: req.body.shippingAddress || {},
      subtotal,
      shipping,
      tax,
      total: Number((subtotal + shipping + tax).toFixed(2)),
      status: "Pending Payment",
      paymentStatus: "Pending",
      paymentProvider: "m-pesa",
      mpesaPhone,
      timeline: [{ label: "M-Pesa payment requested", at: now }],
      createdAt: now
    };

    const stk = await initiateStkPush({ phone: mpesaPhone, amount: order.total, orderId: order.id });
    order.mpesaCheckoutRequestId = stk.CheckoutRequestID;
    order.mpesaMerchantRequestId = stk.MerchantRequestID;
    order.mpesaResponse = stk;

    db.orders = db.orders || [];
    db.orders.unshift(order);
    writeDb(db);

    return res.status(201).json({
      order,
      message: "M-Pesa prompt sent. The order will be accepted after payment confirmation."
    });
  } catch (error) {
    next(error);
  }
});

router.put("/:orderId", async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;

    const db = readDb();
    const order = (db.orders || []).find((entry) => entry.id === req.params.orderId);
    if (!order) return res.status(404).json({ error: "Order not found." });

    const allowedStatuses = ["Processing", "Packed", "Shipped", "Delivered", "Cancelled"];
    if (!allowedStatuses.includes(req.body.status)) {
      return res.status(400).json({ error: "Invalid order status." });
    }

    if (order.paymentStatus !== "Paid" && req.body.status !== "Cancelled") {
      return res.status(400).json({ error: "Payment must be confirmed before processing this order." });
    }

    order.status = req.body.status;
    order.timeline = order.timeline || [];
    order.timeline.push({ label: order.status, at: new Date().toISOString() });
    writeDb(db);

    await sendOrderStatus(order);
    return res.json({ order });
  } catch (error) {
    next(error);
  }
});

async function handleMpesaCallback(req, res, next) {
  try {
    const callback = req.body.Body?.stkCallback;
    const checkoutRequestId = callback?.CheckoutRequestID;
    const resultCode = callback?.ResultCode;
    const db = readDb();
    const order = (db.orders || []).find((entry) => entry.mpesaCheckoutRequestId === checkoutRequestId);

    if (order) {
      order.mpesaResult = callback;
      order.timeline = order.timeline || [];

      if (resultCode === 0) {
        const stock = reduceStockForPaidOrder(db, order);
        order.paymentStatus = "Paid";
        order.status = stock.ok ? "Processing" : "Payment Confirmed - Stock Issue";
        order.timeline.push({ label: "M-Pesa payment confirmed", at: new Date().toISOString() });
        if (!stock.ok) order.timeline.push({ label: stock.error, at: new Date().toISOString() });
        await sendOrderStatus(order);
      } else {
        order.paymentStatus = "Failed";
        order.status = "Payment Failed";
        order.timeline.push({ label: "M-Pesa payment failed", at: new Date().toISOString() });
      }

      writeDb(db);
    }

    return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (error) {
    next(error);
  }
}

router.mpesaCallback = handleMpesaCallback;

module.exports = router;

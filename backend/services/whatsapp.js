function normalizePhone(phone) {
  return String(phone || "").replace(/[^\d]/g, "");
}

async function sendWhatsAppMessage({ to, message, context = {} }) {
  const phone = normalizePhone(to || process.env.ADMIN_WHATSAPP || "254790321533");

  if (process.env.WHATSAPP_WEBHOOK_URL) {
    const response = await fetch(process.env.WHATSAPP_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: phone, message, ...context })
    });

    if (!response.ok) throw new Error("Could not send WhatsApp message.");
    return { sent: true };
  }

  const link = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  console.log(`WhatsApp message link: ${link}`);
  return { sent: false, link };
}

async function sendSignupCode(phone, code) {
  return sendWhatsAppMessage({
    to: phone,
    message: `Your OMANUTRO signup code is ${code}. It expires in 15 minutes.`
  });
}

async function sendResetCode(user, code) {
  return sendWhatsAppMessage({
    to: user.phone || process.env.RESET_WHATSAPP_TO,
    message: `OMANUTRO password reset code for ${user.email}: ${code}. It expires in 15 minutes.`,
    context: { email: user.email }
  });
}

async function sendOrderStatus(order) {
  const customer = order.customer || {};
  return sendWhatsAppMessage({
    to: customer.phone,
    message: `OMANUTRO order ${order.id} update: ${order.status}. Payment status: ${order.paymentStatus}.`,
    context: { orderId: order.id, status: order.status }
  });
}

module.exports = {
  normalizePhone,
  sendWhatsAppMessage,
  sendSignupCode,
  sendResetCode,
  sendOrderStatus
};


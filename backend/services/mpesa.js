function hasMpesaConfig() {
  return Boolean(
    process.env.MPESA_CONSUMER_KEY &&
    process.env.MPESA_CONSUMER_SECRET &&
    process.env.MPESA_SHORTCODE &&
    process.env.MPESA_PASSKEY &&
    process.env.MPESA_CALLBACK_URL
  );
}

function mpesaBaseUrl() {
  return process.env.MPESA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
}

function mpesaTimestamp() {
  return new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
}

async function getMpesaToken() {
  const auth = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString("base64");

  const response = await fetch(`${mpesaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` }
  });
  const data = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error(data.errorMessage || "Could not get M-Pesa access token.");
  }

  return data.access_token;
}

async function initiateStkPush({ phone, amount, orderId }) {
  if (!hasMpesaConfig()) {
    throw new Error("M-Pesa is not configured. Add Safaricom credentials and callback URL in backend/.env.");
  }

  const token = await getMpesaToken();
  const timestamp = mpesaTimestamp();
  const shortcode = process.env.MPESA_SHORTCODE;
  const password = Buffer.from(`${shortcode}${process.env.MPESA_PASSKEY}${timestamp}`).toString("base64");

  const response = await fetch(`${mpesaBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.max(1, Math.round(amount)),
      PartyA: phone,
      PartyB: shortcode,
      PhoneNumber: phone,
      CallBackUrl: process.env.MPESA_CALLBACK_URL,
      AccountReference: orderId,
      TransactionDesc: "L&C Enterprise checkout"
    })
  });

  const data = await response.json();
  if (!response.ok || data.ResponseCode !== "0") {
    throw new Error(data.errorMessage || data.ResponseDescription || "M-Pesa STK push failed.");
  }

  return data;
}

module.exports = {
  hasMpesaConfig,
  initiateStkPush
};

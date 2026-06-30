const assert = require("assert");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const TEST_PORT = process.env.SMOKE_TEST_PORT || "3055";
const BASE_URL = `http://localhost:${TEST_PORT}`;
const TEST_DB = path.join(__dirname, "..", "..", "data", "smoke-test.sqlite");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(pathname, options = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed: ${response.status} ${response.statusText}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await request("/api/products");
      return;
    } catch {
      await wait(250);
    }
  }
  throw new Error("Server did not become ready in time");
}

async function assertRejectsStatus(fn, status, messagePattern) {
  await assert.rejects(
    fn,
    (error) => error.status === status && (!messagePattern || messagePattern.test(error.message)),
    `Expected HTTP ${status}`
  );
}

async function login(email, password) {
  const data = await request("/api/auth/login", {
    method: "POST",
    body: { email, password }
  });
  assert(data.token, "Expected signed token on login");
  return data;
}

async function mpesaPaidCallback(checkoutRequestId) {
  return request("/api/mpesa/callback", {
    method: "POST",
    body: {
      Body: {
        stkCallback: {
          CheckoutRequestID: checkoutRequestId,
          ResultCode: 0,
          ResultDesc: "The service request is processed successfully."
        }
      }
    }
  });
}

async function main() {
  fs.rmSync(TEST_DB, { force: true });
  fs.rmSync(`${TEST_DB}-shm`, { force: true });
  fs.rmSync(`${TEST_DB}-wal`, { force: true });

  const server = spawn(process.execPath, [path.join("backend", "server.js")], {
    cwd: path.join(__dirname, "..", ".."),
    env: {
      ...process.env,
      PORT: TEST_PORT,
      APP_URL: BASE_URL,
      SQLITE_DB_FILE: TEST_DB,
      MPESA_MOCK_SUCCESS: "1",
      JWT_SECRET: "smoke-test-secret"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stderr = "";
  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForServer();

    const catalog = await request("/api/products");
    assert.equal(catalog.products.length, 0, "Expected an empty product catalog before merchant-added products");
    assert(catalog.pagination, "Expected product pagination metadata");

    const filteredCatalog = await request("/api/products?search=smoke&limit=1");
    assert.equal(filteredCatalog.products.length, 0, "Search should run through the SQL filter path");
    assert.equal(filteredCatalog.pagination.limit, 1, "Explicit product limit should be reflected in metadata");

    await assertRejectsStatus(() => request("/api/auth/me"), 401);
    await assertRejectsStatus(() => request("/api/orders"), 401);

    const admin = await login("admin@demo.com", "Admin123!");
    const signup = await request("/api/auth/request-signup-code", {
      method: "POST",
      body: {
        name: "Smoke Customer",
        email: "smoke.customer@example.com",
        phone: "254700000002",
        password: "Customer123!"
      }
    });
    const customer = await request("/api/auth/register", {
      method: "POST",
      body: {
        name: "Smoke Customer",
        email: "smoke.customer@example.com",
        phone: "254700000002",
        password: "Customer123!",
        verificationId: signup.verificationId,
        code: signup.signupCode
      }
    });
    assert.equal(admin.user.role, "admin", "Expected admin role");
    assert.equal(customer.user.role, "customer", "Expected customer role");

    const phoneLogin = await login("254700000002", "Customer123!");
    assert.equal(phoneLogin.user.email, "smoke.customer@example.com", "Normalized phone login should resolve indexed user lookup");

    const adminMe = await request("/api/auth/me", { headers: bearer(admin.token) });
    const customerMe = await request("/api/auth/me", { headers: bearer(customer.token) });
    assert.equal(adminMe.user.email, "admin@demo.com", "Admin token should resolve admin user");
    assert.equal(customerMe.user.email, "smoke.customer@example.com", "Customer token should resolve customer user");

    await assertRejectsStatus(
      () => request("/api/products", {
        method: "POST",
        headers: bearer(customer.token),
        body: {
          name: "Unauthorized Product",
          category: "Test",
          description: "Should not be created",
          price: 10,
          stock: 1,
          rating: 4,
          tags: "test",
          image: "https://example.com/image.jpg"
        }
      }),
      403,
      /Admin access required/
    );

    const created = await request("/api/products", {
      method: "POST",
      headers: bearer(admin.token),
      body: {
        name: "Smoke Race Product",
        category: "Test",
        description: "Temporary product created by integration test",
        price: 10,
        stock: 1,
        rating: 4.2,
        tags: "test",
        image: "https://example.com/image.jpg"
      }
    });
    assert(created.product.id, "Expected created product");

    await assertRejectsStatus(
      () => request("/api/orders", {
        method: "POST",
        headers: bearer(customer.token),
        body: {
          paymentMethod: "credit_card",
          shippingAddress: { name: "Smoke Test", address: "1 Test Way", city: "Nairobi" },
          items: [{ productId: created.product.id, quantity: 1 }]
        }
      }),
      400,
      /Only confirmed M-Pesa checkout is enabled/
    );

    const firstOrder = await request("/api/orders", {
      method: "POST",
      headers: bearer(customer.token),
      body: {
        paymentMethod: "m-pesa",
        mpesaPhone: "254700000001",
        shippingAddress: { name: "Smoke Test", address: "1 Test Way", city: "Nairobi" },
        items: [{ productId: created.product.id, quantity: 1 }]
      }
    });
    const secondOrder = await request("/api/orders", {
      method: "POST",
      headers: bearer(customer.token),
      body: {
        paymentMethod: "m-pesa",
        mpesaPhone: "254700000001",
        shippingAddress: { name: "Smoke Test", address: "1 Test Way", city: "Nairobi" },
        items: [{ productId: created.product.id, quantity: 1 }]
      }
    });

    await mpesaPaidCallback(firstOrder.order.mpesaCheckoutRequestId);
    await mpesaPaidCallback(secondOrder.order.mpesaCheckoutRequestId);

    const orders = await request("/api/orders", { headers: bearer(admin.token) });
    const refreshedFirst = orders.orders.find((order) => order.id === firstOrder.order.id);
    const refreshedSecond = orders.orders.find((order) => order.id === secondOrder.order.id);
    assert.equal(refreshedFirst.paymentStatus, "Paid", "First order payment should be paid");
    assert.equal(refreshedFirst.status, "Processing", "First order should reduce stock and process");
    assert.equal(refreshedSecond.paymentStatus, "Paid", "Second order payment should be paid");
    assert.equal(refreshedSecond.status, "Payment Confirmed - Stock Issue", "Second order should not oversell stock");

    const afterStock = await request("/api/products");
    const raceProduct = afterStock.products.find((product) => product.id === created.product.id);
    assert.equal(raceProduct.stock, 0, "Stock should not go below zero");

    await request(`/api/products/${created.product.id}`, {
      method: "DELETE",
      headers: bearer(admin.token)
    });

    console.log("Integration test passed: strict auth, admin authorization, multi-user sessions, CRUD, checkout enforcement, and stock race handling are working.");
  } finally {
    server.kill();
    if (stderr) {
      process.stderr.write(`Server stderr: ${stderr}`);
    }
  }
}

main().catch((error) => {
  console.error("Integration test failed:", error);
  process.exit(1);
});

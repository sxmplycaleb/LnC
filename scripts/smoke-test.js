const assert = require("assert");
const { spawn } = require("child_process");

const BASE_URL = "http://localhost:3000";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText} - ${JSON.stringify(data)}`);
  }
  return data;
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

async function main() {
  const server = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: "3000",
      APP_URL: BASE_URL
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
    assert(catalog.products.length >= 1, "Expected seeded products");

    const login = await request("/api/auth/login", {
      method: "POST",
      body: { email: "admin@demo.com", password: "Admin123!" }
    });
    assert(login.token, "Expected JWT token on login");
    assert.equal(login.user.role, "admin", "Expected user role to be admin");

    const created = await request("/api/products", {
      method: "POST",
      headers: { Authorization: `Bearer ${login.token}` },
      body: {
        name: "Smoke Test Product",
        category: "Test",
        description: "Temporary product created by smoke test",
        price: 10,
        stock: 3,
        rating: 4.2,
        tags: "test",
        image: "https://www.pexels.com/license/"
      }
    });
    assert(created.product.id, "Expected created product");

    const order = await request("/api/orders", {
      method: "POST",
      headers: { Authorization: `Bearer ${login.token}` },
      body: {
        paymentMethod: "credit_card",
        shippingAddress: { name: "Smoke Test", address: "1 Test Way", city: "Nairobi" },
        items: [{ productId: created.product.id, quantity: 1 }]
      }
    });
    assert(order.order.id, "Expected created order");

    await request(`/api/products/${created.product.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${login.token}` }
    });

    console.log("Smoke test passed successfully. JWT login, admin CRUD, and checkout are working.");
  } finally {
    server.kill();
    if (stderr) {
      process.stderr.write(`Server stderr: ${stderr}`);
    }
  }
}

main().catch((error) => {
  console.error("Smoke test failed:", error);
  process.exit(1);
});

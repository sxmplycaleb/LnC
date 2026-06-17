function getInitialsTheme() {
    const savedTheme = localStorage.getItem("commerce-theme");
    if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const state = {
    user: null,
    products: [],
    categories: [],
    cart: JSON.parse(localStorage.getItem("commerce-cart") || "[]"),
    authMode: "login",
    editProductId: null,
    theme: getInitialsTheme(),
    pendingCatalogRedirect: false,
    redirectAfterDcashPopup: false,
    resetStep: "email",
    resetToken: null
};

const $ = (selector) => document.querySelector(selector); 
const $$ = (selector) => [...document.querySelectorAll(selector)];
const money = (value) => `$${Number(value).toFixed(2)}`;

async function api(path, options = {}) {
    const body = options.body ? JSON.stringify(options.body) : undefined;
    if (typeof fetch !== "function") {
        return xhrApi(path, options, body);
    }

    const response = await fetch(path, {
        headers: {
            "Content-Type": "application/json", ...(options.headers || {}) },
        credentials: "include",
        ...options,
        body
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
}

function xhrApi(path, options = {}, body) {
    return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open(options.method || "GET", path, true);
        request.withCredentials = true;
        request.setRequestHeader("Content-Type", "application/json");
        Object.entries(options.headers || {}).forEach(([key, value]) => request.setRequestHeader(key, value));
        request.onload = () => {
            let data = {};
            try {
                data = request.responseText ? JSON.parse(request.responseText) : {};
            } catch {
                data = {};
            }
            if (request.status < 200 || request.status >= 300) {
                reject(new Error(data.error || "Request failed"));
                return;
            }
            resolve(data);
        };
        request.onerror = () => reject(new Error("Request failed"));
        request.send(body);
    });
}

function applyTheme(theme) {
    state.theme = theme === "light" ? "light" : "dark";
    document.body.classList.toggle("dark", state.theme === "dark");
    document.documentElement.dataset.theme = state.theme;

    localStorage.setItem("commerce-theme", state.theme);

    const button = $("#themeToggleButton");
    if (!button) return;
    const label = button.querySelector(".theme-label");
    
    if (label) {
      label.textContent = state.theme === "light" ? "Dark" : "Light";
    } else {
      button.textContent = state.theme === "light" ? "Dark" : "Light";
    }

    button.setAttribute("title", `Switch to ${state.theme === "light" ? "dark" : "light"} theme`);
    button.setAttribute("aria-label", `Switch to ${state.theme === "light" ? "dark" : "light"} theme`);
    button.setAttribute("aria-pressed", String(state.theme === "dark"));
}

function toggleTheme() {
    applyTheme(state.theme === "light" ? "dark" : "light");
}
function toast(message) {
    const node = $("#toast");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(node.timeout);
    node.timeout = setTimeout(() => node.classList.remove("show"), 2800);
}

function persistCart() {
  localStorage.setItem("commerce-cart", JSON.stringify(state.cart));
  renderCart();
}

function currentCartTotal() {
  return state.cart.reduce((sum, item) => {
    const product = state.products.find((entry) => entry.id === item.productId);
    return sum + (product ? product.price * item.quantity : 0);
  }, 0);
}

async function cleanCartBeforeCheckout() {
  const data = await api("/api/products");
  const products = data.products || [];
  const productIds = new Set(products.map((product) => product.id));
  const cleanCart = state.cart.filter((item) => productIds.has(item.productId) && Number(item.quantity) > 0);

  if (cleanCart.length !== state.cart.length) {
    state.cart = cleanCart;
    localStorage.setItem("commerce-cart", JSON.stringify(state.cart));
    renderCart();
    toast("Removed unavailable items from your cart.");
  }

  return state.cart.length > 0;
}

function switchView(viewName) {
  const targetView = $(`#${viewName}View`);
  if (!targetView) {
    if (viewName === "admin") location.href = "/?view=admin";
    return;
  }
  $$(".view").forEach((view) => view.classList.remove("active"));
  targetView.classList.add("active");
  $$(".nav-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === viewName));
  if (viewName === "orders") loadOrders();
  if (viewName === "admin") {
    renderAdminProducts();
    loadAdminOrders();
  }
}

function updateAuthUI() {
  const signedOutMenu = $("#signedOutMenu");
  const signedInMenu = $("#signedInMenu");
  const avatar = $("#profileMenuButton");

  if (signedOutMenu) signedOutMenu.classList.toggle("hidden", Boolean(state.user));
  if (signedInMenu) signedInMenu.classList.toggle("hidden", !state.user);
  if (avatar && state.user) {
    avatar.textContent = getUserInitials(state.user);
    avatar.title = state.user.name || state.user.email;
  }

  $$(".auth-only").forEach((node) => node.classList.toggle("hidden", !state.user));
  $$(".admin-only").forEach((node) => node.classList.toggle("hidden", state.user?.role !== "admin"));
}

async function loadMe() {
  const data = await api("/api/auth/me");
  state.user = data.user;
  updateAuthUI();
}

async function loadProducts() {
  const params = new URLSearchParams({
    search: $("#searchInput")?.value || "",
    category: $("#categorySelect")?.value || "all",
    maxPrice: $("#priceRange")?.value || "2000",
    minRating: $("#ratingSelect")?.value || "0",
    inStock: $("#stockCheckbox")?.checked || false
  });
  const data = await api(`/api/products?${params}`);
  state.products = data.products;
  state.categories = data.categories;
  renderCategoryOptions();
  renderProducts();
  renderCart();
}

function renderCategoryOptions() {
  const select = $("#categorySelect");
  const selected = select.value;
  select.innerHTML = `<option value="all">All categories</option>${state.categories.map((category) => (
    `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`
  )).join("")}`;
  select.value = state.categories.includes(selected) ? selected : "all";
}

function renderProducts() {
  const isCatalogPage = location.pathname.includes("catalog.html");
  const visibleProducts = isCatalogPage ? state.products : state.products.slice(0, 6);

  $("#resultCount").textContent = `${state.products.length} item${visibleProducts.length === 1 ? "" : "s"}`;
  if ($("#metricProducts")) $("#metricProducts").textContent = state.products.length;

  const grid = $("#productGrid");

  if (!visibleProducts.length) {
    grid.innerHTML = `<div class="wide-panel">No products match those filters.</div>`;
    return;
  }

  grid.innerHTML = visibleProducts.map((product) => `
    <article class="product-card" onclick="openProductDetail('${product.id}')">
      <img src="${escapeAttr(productImageSrc(product))}" alt="${escapeAttr(product.name)}">
      <div class="product-body">
        <div class="product-meta">
          <span class="pill">${escapeHtml(product.category)}</span>
          <strong>${product.rating.toFixed(1)} stars</strong>
        </div>
        <h3>${escapeHtml(product.name)}</h3>
        <p>${escapeHtml(product.description)}</p>
        <div class="product-footer">
          <span class="price">${money(product.price)}</span>
          <span>${product.stock} left</span>
        </div>
        <button class="primary-button" onclick="event.stopPropagation(); addToCart('${product.id}')" ${product.stock < 1 ? "disabled" : ""}>Add to cart</button>
      </div>
    </article>
  `).join("");
}

function openProductDetail(productId) {
  const product = state.products.find((entry) => entry.id === productId);
  if (!product) return;
  rememberRecentlyViewed(productId);
  const reviews = renderProductReviews(product.reviews);
  const tags = productTags(product).map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join("");
  $("#productDetailContent").innerHTML = `
    <div class="product-detail-layout">
      <img class="detail-image" src="${escapeAttr(productImageSrc(product))}" alt="${escapeAttr(product.name)}">
      <div class="detail-info">
        <div class="product-meta">
          <span class="pill">${escapeHtml(product.category)}</span>
          <strong>${product.rating.toFixed(1)} stars</strong>
        </div>
        <h2 id="detailProductName">${escapeHtml(product.name)}</h2>
        <p>${escapeHtml(product.description)}</p>
        <div class="detail-stats">
          <div><span>Price</span><strong>${money(product.price)}</strong></div>
          <div><span>Stock</span><strong>${product.stock} left</strong></div>
          <div><span>Reviews</span><strong>${(product.reviews || []).length}</strong></div>
        </div>
        <div class="detail-tags">${tags}</div>
        <button class="primary-button" onclick="addToCart('${product.id}'); closeProductDetail();" ${product.stock < 1 ? "disabled" : ""}>Add to cart</button>
      </div>
    </div>
    <div class="detail-review-section">
      <div class="section-heading">
        <span>Customer Reviews</span>
        <strong>${(product.reviews || []).length} comments</strong>
      </div>
      ${reviews || '<p class="muted-copy">No reviews yet.</p>'}
    </div>
  `;
  $("#productDetailModal").classList.remove("hidden");
}

function closeProductDetail() {
  $("#productDetailModal").classList.add("hidden");
}

function rememberRecentlyViewed(productId) {
  const current = JSON.parse(localStorage.getItem("commerce-recently-viewed") || "[]");
  const next = [productId, ...current.filter((id) => id !== productId)].slice(0, 8);
  localStorage.setItem("commerce-recently-viewed", JSON.stringify(next));
}

function showRecentlyViewed() {
  const ids = JSON.parse(localStorage.getItem("commerce-recently-viewed") || "[]");
  const products = ids.map((id) => state.products.find((product) => product.id === id)).filter(Boolean);
  if (!products.length) {
    toast("Recently viewed products will appear here after you open a product.");
    return;
  }

  $("#productDetailContent").innerHTML = `
    <div class="recently-viewed-panel">
      <div class="section-heading">
        <span>Recently viewed</span>
        <strong>${products.length} item${products.length === 1 ? "" : "s"}</strong>
      </div>
      <div class="recently-viewed-list">
        ${products.map((product) => `
          <button class="recently-viewed-item" type="button" onclick="openProductDetail('${product.id}')">
            <img src="${escapeAttr(productImageSrc(product))}" alt="${escapeAttr(product.name)}">
            <span><strong>${escapeHtml(product.name)}</strong><small>${money(product.price)} | ${escapeHtml(product.category)}</small></span>
          </button>
        `).join("")}
      </div>
    </div>
  `;
  $("#productDetailModal").classList.remove("hidden");
}

function productTags(product) {
  if (Array.isArray(product.tags)) return product.tags;
  return String(product.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean);
}

function productImageSrc(product) {
  const image = String(product.image || "").trim();
  if (image && !image.includes("via.placeholder.com")) return image;

  const label = escapeHtml(product.name || "Product");
  const category = escapeHtml(product.category || "L&C Enterprise");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 450">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#f8d66d"/>
          <stop offset="0.55" stop-color="#5fc4b5"/>
          <stop offset="1" stop-color="#315c96"/>
        </linearGradient>
      </defs>
      <rect width="600" height="450" fill="url(#bg)"/>
      <circle cx="475" cy="90" r="58" fill="#ffffff" opacity="0.22"/>
      <rect x="70" y="92" width="460" height="266" rx="28" fill="#ffffff" opacity="0.86"/>
      <text x="300" y="205" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#18202f">${label}</text>
      <text x="300" y="254" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="#3f4c5e">${category}</text>
      <text x="300" y="314" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" letter-spacing="3" fill="#315c96">L&C ENTERPRISE</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function renderProductReviews(reviews = []) {
  if (!reviews.length) return "";
  const featured = reviews.slice(0, 2).map((review) => `
    <div class="review-chip">
      <span>"${escapeHtml(review.comment)}"</span>
      <strong>${escapeHtml(review.name)}</strong>
    </div>
  `).join("");
  return `<div class="product-reviews">${featured}</div>`;
}
function addToCart(productId) {
  const product = state.products.find((entry) => entry.id === productId);
  if (!product || product.stock < 1) return;
  const line = state.cart.find((item) => item.productId === productId);
  if (line) line.quantity += 1;
  else state.cart.push({ productId, quantity: 1 });
  persistCart();
  toast(`${product.name} added to cart`);
}

function changeQuantity(productId, delta) {
  const line = state.cart.find((item) => item.productId === productId);
  if (!line) return;
  line.quantity += delta;
  if (line.quantity < 1) state.cart = state.cart.filter((item) => item.productId !== productId);
  persistCart();
}

function removeFromCart(productId) {
  state.cart = state.cart.filter((item) => item.productId !== productId);
  persistCart();
}

function renderCart() {
  const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  $("#cartCount").textContent = count;
  $("#cartTotal").textContent = money(currentCartTotal());
  if ($("#metricCart")) $("#metricCart").textContent = money(currentCartTotal());
  const items = $("#cartItems");
  if (!state.cart.length) {
    items.innerHTML = `<div class="wide-panel">Your cart is empty.</div>`;
    return;
  }
  items.innerHTML = state.cart.map((item) => {
    const product = state.products.find((entry) => entry.id === item.productId);
    if (!product) {
      return `
        <div class="cart-line">
          <div>
            <strong>Unavailable product</strong>
            <div>This item will be removed at checkout.</div>
          </div>
          <button class="danger-button" type="button" onclick="removeFromCart('${item.productId}')">Remove</button>
        </div>
      `;
    }
    return `
      <div class="cart-line">
        <div>
          <strong>${escapeHtml(product.name)}</strong>
          <div>${money(product.price)} each</div>
        </div>
        <div class="quantity-controls">
          <button type="button" onclick="changeQuantity('${item.productId}', -1)">-</button>
          <span>${item.quantity}</span>
          <button type="button" onclick="changeQuantity('${item.productId}', 1)">+</button>
        </div>
        <button class="danger-button" type="button" onclick="removeFromCart('${item.productId}')">Remove</button>
      </div>
    `;
  }).join("");
}

async function checkout(event) {
  event.preventDefault();
  if (!state.user) {
    openAuth("login");
    toast("Sign in before checkout.");
    return;
  }
  if (!state.cart.length) return toast("Add products to your cart first.");
  const hasAvailableItems = await cleanCartBeforeCheckout();
  if (!hasAvailableItems) return toast("Add products to your cart first.");

  const paymentMethod = $("#paymentMethod");
  const shipName = $("#shipName");
  const shipAddress = $("#shipAddress");
  const shipCity = $("#shipCity");

  if (!paymentMethod || !shipName || !shipAddress || !shipCity) {
    toast("Checkout form is missing required fields.");
    return;
  }

  if (!paymentMethod.value) {
    paymentMethod.focus();
    toast("Select a payment method.");
    return;
  }

  const body = {
    items: state.cart,
    paymentMethod: paymentMethod.value,
    mpesaPhone: $("#mpesaPhone")?.value,
    shippingAddress: {
      name: shipName.value,
      address: shipAddress.value,
      city: shipCity.value
    }
  };
  const data = await api("/api/orders", { method: "POST", body });
  state.cart = [];
  persistCart();
  await loadProducts();
  $("#cartDrawer").classList.remove("open");
  if (data.checkoutUrl) {
    location.href = data.checkoutUrl;
  } else {
    toast(`Order ${data.order.id} placed.`);
    switchView("orders");
  }
}

async function loadOrders() {
  const list = $("#ordersList");
  if (!state.user) {
    list.innerHTML = `<div class="order-card">Sign in to track your orders.</div>`;
    return;
  }
  const data = await api("/api/orders");
  list.innerHTML = renderOrders(data.orders, false);
}

async function loadAdminOrders() {
  if (state.user?.role !== "admin") return;
  const data = await api("/api/orders");
  $("#adminOrderCount").textContent = `${data.orders.length} order${data.orders.length === 1 ? "" : "s"}`;
  $("#adminOrders").innerHTML = renderOrders(data.orders, true);
}

function renderOrders(orders, adminMode) {
  if (!orders.length) return `<div class="order-card">No orders yet.</div>`;
  return orders.map((order) => `
    <article class="order-card">
      <div class="order-line">
        <div>
          <strong>${order.id}</strong>
          <div>${new Date(order.createdAt).toLocaleString()}${adminMode ? ` | ${escapeHtml(order.customer.email)}` : ""}</div>
        </div>
        <span class="status">${escapeHtml(order.status)}</span>
      </div>
      <div class="order-items">
        ${order.items.map((item) => `<span>${item.quantity} x ${escapeHtml(item.name)} - ${money(item.subtotal)}</span>`).join("")}
      </div>
      <div class="timeline">
        ${order.timeline.map((item) => `<span class="pill">${escapeHtml(item.label)}</span>`).join("")}
      </div>
      <div class="order-line">
        <strong>${money(order.total)}</strong>
        ${adminMode ? `
          <select onchange="updateOrderStatus('${order.id}', this.value)">
            ${["Processing", "Packed", "Shipped", "Delivered", "Cancelled"].map((status) => `<option ${status === order.status ? "selected" : ""}>${status}</option>`).join("")}
          </select>
        ` : `<span>${escapeHtml(order.paymentProvider)} payment</span>`}
      </div>
    </article>
  `).join("");
}

async function updateOrderStatus(orderId, status) {
  await api(`/api/orders/${orderId}`, { method: "PUT", body: { status } });
  toast("Order status updated.");
  loadAdminOrders();
}

function renderAdminProducts() {
  $("#adminProductCount").textContent = `${state.products.length} product${state.products.length === 1 ? "" : "s"}`;
  $("#adminProducts").innerHTML = state.products.map((product) => `
    <div class="admin-product-row">
      <div>
        <strong>${escapeHtml(product.name)}</strong>
        <div>${escapeHtml(product.category)} | ${money(product.price)} | ${product.stock} stock</div>
      </div>
      <div class="row-actions">
        <button class="small-button" onclick="editProduct('${product.id}')">Edit</button>
        <button class="danger-button" onclick="deleteProduct('${product.id}')">Delete</button>
      </div>
    </div>
  `).join("");
}

function setAdminPanel(panel) {
  const selected = panel === "product" ? "product" : "inventory";
  const adminView = $("#adminView");
  if (adminView) adminView.dataset.activeSection = selected;
  $$("[data-admin-panel]").forEach((button) => button.classList.toggle("active", button.dataset.adminPanel === selected));
  $(`[data-admin-section="${selected}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function editProduct(productId) {
  const product = state.products.find((entry) => entry.id === productId);
  if (!product) return;
  state.editingProductId = productId;
  $("#formTitle").textContent = "Edit Product";
  $("#productId").value = product.id;
  $("#productName").value = product.name;
  $("#productCategory").value = product.category;
  $("#productDescription").value = product.description;
  $("#productPrice").value = product.price;
  $("#productStock").value = product.stock;
  $("#productRating").value = product.rating;
  $("#productTags").value = productTags(product).join(", ");
  $("#productImage").value = product.image;
  setAdminPanel("product");
}

function resetProductForm() {
  state.editingProductId = null;
  $("#formTitle").textContent = "Add Product";
  $("#productForm").reset();
  $("#productId").value = "";
  $("#productRating").value = "4.5";
}

async function saveProduct(event) {
  event.preventDefault();
  const body = {
    name: $("#productName").value,
    category: $("#productCategory").value,
    description: $("#productDescription").value,
    price: $("#productPrice").value,
    stock: Number($("#productStock").value),
    rating: $("#productRating").value,
    tags: $("#productTags").value,
    image: $("#productImage").value
  };
  const path = state.editingProductId ? `/api/products/${state.editingProductId}` : "/api/products";
  const method = state.editingProductId ? "PUT" : "POST";
  await api(path, { method, body });
  toast(state.editingProductId ? "Product updated." : "Product added.");
  resetProductForm();
  await loadProducts();
  renderAdminProducts();
}

async function deleteProduct(productId) {
  if (!confirm("Delete this product?")) return;
  await api(`/api/products/${productId}`, { method: "DELETE" });
  toast("Product deleted.");
  await loadProducts();
  renderAdminProducts();
}

async function uploadProductImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const data = await api("/api/uploads", { method: "POST", body: { dataUrl } });
  $("#productImage").value = data.url;
  toast("Image uploaded.");
}

function openAuth(mode = "login") {
  state.authMode = mode;
  closeMenus();
  $("#authModal").classList.remove("hidden");
  const isRegister = mode === "register";
  $("#authTitle").textContent = isRegister ? "Create account" : "Sign in";
  $("#authSubmit").textContent = isRegister ? "Create account" : "Sign in";
  $("#toggleAuthMode").textContent = isRegister ? "Already have an account? Sign in" : "Need an account? Create one";
  $$(".register-only").forEach((node) => node.classList.toggle("hidden", !isRegister));
}

function openResetPassword() {
  state.resetStep = "email";
  state.resetToken = null;
  $("#authModal")?.classList.add("hidden");
  $("#resetModal")?.classList.remove("hidden");
  $("#resetForm")?.reset();
  updateResetPasswordUI();
}

function closeResetPassword() {
  $("#resetModal")?.classList.add("hidden");
}

function updateResetPasswordUI() {
  const codeField = $(".reset-code-field");
  const passwordField = $(".reset-password-field");
  const codeInput = $("#resetCode");
  const passwordInput = $("#resetPassword");
  const submit = $("#resetSubmit");
  const help = $("#resetHelp");

  codeField?.classList.toggle("hidden", state.resetStep === "email");
  passwordField?.classList.toggle("hidden", state.resetStep !== "password");
  if (codeInput) codeInput.required = state.resetStep === "code";
  if (passwordInput) passwordInput.required = state.resetStep === "password";

  if (state.resetStep === "email") {
    if (submit) submit.textContent = "Send code";
    if (help) help.textContent = "Enter your account email and we will send a reset code to WhatsApp.";
  } else if (state.resetStep === "code") {
    if (submit) submit.textContent = "Verify code";
    if (help) help.textContent = "Enter the reset code sent to WhatsApp.";
  } else {
    if (submit) submit.textContent = "Update password";
    if (help) help.textContent = "Enter a new password to finish resetting your account.";
  }
}

async function submitResetPassword(event) {
  event.preventDefault();
  const email = $("#resetEmail")?.value;

  if (state.resetStep === "email") {
    await api("/api/auth/forgot-password", { method: "POST", body: { email } });
    state.resetStep = "code";
    updateResetPasswordUI();
    toast("Reset code sent to WhatsApp.");
    $("#resetCode")?.focus();
    return;
  }

  if (state.resetStep === "code") {
    const data = await api("/api/auth/verify-reset-code", {
      method: "POST",
      body: { email, code: $("#resetCode")?.value }
    });
    state.resetToken = data.resetToken;
    state.resetStep = "password";
    updateResetPasswordUI();
    $("#resetPassword")?.focus();
    return;
  }

  await api("/api/auth/reset-password", {
    method: "POST",
    body: { resetToken: state.resetToken, password: $("#resetPassword")?.value }
  });
  closeResetPassword();
  openAuth("login");
  toast("Password updated. Sign in with your new password.");
}

async function submitAuth(event) {
  event.preventDefault();
  const body = {
    name: $("#authName").value,
    email: $("#authEmail").value,
    password: $("#authPassword").value
  };
  const path = state.authMode === "register" ? "/api/auth/register" : "/api/auth/login";
  const data = await api(path, { method: "POST", body });
  state.user = data.user;
  $("#authModal").classList.add("hidden");
  updateAuthUI();
  toast(`Welcome, ${state.user.name}.`);

  state.pendingCatalogRedirect = false;
  if (state.user.role === "admin") {
    if ($("#adminView")) {
      switchView("admin");
    } else {
      location.href = "/?view=admin";
    }
    return;
  }

  if (!location.pathname.includes("catalog.html")) {
    location.href = "/catalog.html";
    return;
  }

  switchView("shop");
}

async function logout() {
  await api("/api/auth/logout", { method: "POST" });
  state.user = null;
  updateAuthUI();
  toast("Signed out.");
  location.href = "/";
}

function getUserInitials(user) {
  const source = user?.name || user?.email || "A";
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "A";
}

function closeMenus() {
  ["#accountMenu", "#profileMenu"].forEach((selector) => {
    const menu = $(selector);
    if (menu) menu.classList.add("hidden");
  });
  ["#accountMenuButton", "#profileMenuButton"].forEach((selector) => {
    const button = $(selector);
    if (button) button.setAttribute("aria-expanded", "false");
  });
}

function toggleMenu(buttonSelector, menuSelector) {
  const button = $(buttonSelector);
  const menu = $(menuSelector);
  if (!button || !menu) return;
  const willOpen = menu.classList.contains("hidden");
  closeMenus();
  menu.classList.toggle("hidden", !willOpen);
  button.setAttribute("aria-expanded", String(willOpen));
}

function requireSignin(message = "Sign in first.") {
  if (state.user) return true;
  openAuth("login");
  toast(message);
  return false;
}

function handleAccountAction(action) {
  closeMenus();
  if (action === "signin") {
    openAuth("login");
    return;
  }

  if (!requireSignin("Sign in to continue.")) return;

  if (action === "orders" || action === "my-account") {
    switchView(state.user.role === "admin" && action === "my-account" ? "admin" : "orders");
    return;
  }

  if (action === "wishlist") {
    toast("Wishlist will be available from your account soon.");
  }
}

function handleProfileAction(action) {
  closeMenus();
  if (action === "signout") {
    logout().catch((error) => toast(error.message));
    return;
  }

  if (action === "profile") {
    switchView(state.user?.role === "admin" ? "admin" : "orders");
    return;
  }

  if (action === "recently-viewed") {
    showRecentlyViewed();
    return;
  }

  toast(`${action[0].toUpperCase()}${action.slice(1)} will be available soon.`);
}

function runSearchFrom(source) {
  const topSearchInput = $("#topSearchInput");
  const searchInput = $("#searchInput");
  if (source === "top" && topSearchInput && searchInput) searchInput.value = topSearchInput.value;
  if (source === "filter" && topSearchInput && searchInput) topSearchInput.value = searchInput.value;
  loadProducts().catch((error) => toast(error.message));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function showDcashPopup() {
  const dcashPopup = $("#dcashPopup");
  if (dcashPopup) {
    dcashPopup.classList.remove("hidden");
  }
}
function hideDcashPopup() {
  const dcashPopup = $("#dcashPopup");
  
  if (dcashPopup) {
    dcashPopup.classList.add("hidden");
  }
  
  if (state.redirectAfterDcashPopup) {
    state.redirectAfterDcashPopup = false;
    location.href = "/catalog.html";
  }
}

function bindEvents() {
  const dcashPopup = $("#dcashPopup");
  const closeDcashPopup = $("#closeDcashPopup");

  if (dcashPopup && closeDcashPopup) {
    setTimeout(showDcashPopup, 1500);

    closeDcashPopup.addEventListener("click", hideDcashPopup);

    dcashPopup.addEventListener("click", (event) => {
      if (event.target === dcashPopup) {
        hideDcashPopup();
      }
    });
  }

  const shopNowButton = $("#shopNowButton");

  if (shopNowButton) {
    shopNowButton.addEventListener("click", (event) => {
      event.preventDefault();

      if (!state.user) {
        state.pendingCatalogRedirect = true;
        openAuth("login");
        toast("Sign in to view the full catalog.");
        return;
      }

      state.redirectAfterDcashPopup = true;
      showDcashPopup();
    });
  }

  $$(".nav-tab").forEach((tab) => tab.addEventListener("click", () => {
    if (!state.user) {
      requireSignin("Sign in to view this section.");
      return;
    }
    switchView(tab.dataset.view);
  }));

  const topSearchInput = $("#topSearchInput");
  const searchInput = $("#searchInput");
  if (topSearchInput && searchInput) {
    topSearchInput.addEventListener("input", () => {
      searchInput.value = topSearchInput.value;
      loadProducts().catch((error) => toast(error.message));
    });
  }
  $("#topSearchButton")?.addEventListener("click", () => runSearchFrom("top"));
  $("#searchButton")?.addEventListener("click", () => runSearchFrom("filter"));

  ["searchInput", "categorySelect", "priceRange", "ratingSelect", "stockCheckbox"].forEach((id) => {
    const node = $(`#${id}`);
    if (!node) return;
    node.addEventListener("input", () => {
      if ($("#priceLabel") && $("#priceRange")) $("#priceLabel").textContent = money($("#priceRange").value);
      if (id === "searchInput" && topSearchInput) topSearchInput.value = node.value;
      loadProducts().catch((error) => toast(error.message));
    });
  });

  $("#themeToggleButton")?.addEventListener("click", () => {
    applyTheme(state.theme === "light" ? "dark" : "light");
  });

  $("#cartButton")?.addEventListener("click", () => {
    if (!requireSignin("Please sign in before opening your cart.")) return;
    $("#cartDrawer").classList.add("open");
  });

  $("#accountMenuButton")?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMenu("#accountMenuButton", "#accountMenu");
  });
  $("#profileMenuButton")?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMenu("#profileMenuButton", "#profileMenu");
  });

  $$("[data-account-action]").forEach((button) => {
    button.addEventListener("click", () => handleAccountAction(button.dataset.accountAction));
  });
  $$("[data-profile-action]").forEach((button) => {
    button.addEventListener("click", () => handleProfileAction(button.dataset.profileAction));
  });

  document.addEventListener("click", closeMenus);
  $$(".dropdown-menu").forEach((menu) => menu.addEventListener("click", (event) => event.stopPropagation()));

  $("#closeCartButton")?.addEventListener("click", () => $("#cartDrawer").classList.remove("open"));
  $("#checkoutForm")?.addEventListener("submit", (event) => checkout(event).catch((error) => toast(error.message)));
  $("#refreshOrdersButton")?.addEventListener("click", () => loadOrders().catch((error) => toast(error.message)));
  $("#closeAuthButton")?.addEventListener("click", () => $("#authModal").classList.add("hidden"));
  $("#forgotPasswordButton")?.addEventListener("click", openResetPassword);
  $("#closeResetButton")?.addEventListener("click", closeResetPassword);
  $("#resetForm")?.addEventListener("submit", (event) => submitResetPassword(event).catch((error) => toast(error.message)));
  $("#closeProductDetailButton")?.addEventListener("click", closeProductDetail);
  $("#productDetailModal")?.addEventListener("click", (event) => { if (event.target.id === "productDetailModal") closeProductDetail(); });
  $("#toggleAuthMode")?.addEventListener("click", () => openAuth(state.authMode === "login" ? "register" : "login"));
  $("#authForm")?.addEventListener("submit", (event) => submitAuth(event).catch((error) => toast(error.message)));
  $("#productForm")?.addEventListener("submit", (event) => saveProduct(event).catch((error) => toast(error.message)));
  $("#resetProductForm")?.addEventListener("click", resetProductForm);
  $$("[data-admin-panel]").forEach((button) => {
    button.addEventListener("click", () => setAdminPanel(button.dataset.adminPanel));
  });
  $("#imageUpload")?.addEventListener("change", (event) => uploadProductImage(event).catch((error) => toast(error.message)));
}

async function init() {
  bindEvents();
  applyTheme(state.theme);
  if ($("#copyrightYear")) $("#copyrightYear").textContent = new Date().getFullYear();
  if ($("#priceLabel") && $("#priceRange")) $("#priceLabel").textContent = money($("#priceRange").value);
  await loadMe();
  await loadProducts();
  const params = new URLSearchParams(location.search);
  if (params.get("order")) {
    toast(`Payment returned for ${params.get("order")}.`);
    switchView("orders");
  }
  if (params.get("view") === "admin" && state.user?.role === "admin") {
    switchView("admin");
  }
}

window.openProductDetail = openProductDetail;
window.addToCart = addToCart;
window.changeQuantity = changeQuantity;
window.removeFromCart = removeFromCart;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.updateOrderStatus = updateOrderStatus;

init().catch((error) => toast(error.message));


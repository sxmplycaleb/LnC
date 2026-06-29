function getInitialsTheme() {
    const savedTheme = localStorage.getItem("commerce-theme");
    if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const state = {
    user: null,
    authToken: window.CommerceApi?.getToken() || "",
    products: [],
    categories: [],
    cart: window.CommerceCart?.load() || JSON.parse(localStorage.getItem("commerce-cart") || "[]"),
    authMode: "login",
    editProductId: null,
    theme: getInitialsTheme(),
    currency: localStorage.getItem("commerce-currency") === "KES" ? "KES" : "USD",
    heroProducts: [],
    heroIndex: 0,
    heroTimer: null,
    pendingCatalogRedirect: false,
    redirectAfterDcashPopup: false,
    resetStep: "email",
    resetToken: null,
    signupStep: "details",
    signupVerificationId: null
};

const $ = (selector) => document.querySelector(selector); 
const $$ = (selector) => [...document.querySelectorAll(selector)];
const USD_TO_KES_RATE = 130;
const money = (value) => {
  const amount = Number(value) || 0;
  if (state.currency === "KES") return `KES ${Math.round(amount * USD_TO_KES_RATE).toLocaleString("en-KE")}`;
  return `$${amount.toFixed(2)}`;
};
let revealObserver = null;

async function api(path, options = {}) {
    if (window.CommerceApi && typeof fetch === "function") {
        return window.CommerceApi.request(path, options);
    }

    const body = options.body ? JSON.stringify(options.body) : undefined;
    return xhrApi(path, options, body);
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
  window.CommerceCart?.save(state.cart);
  renderCart();
}

function currentCartTotal() {
  return window.CommerceCart?.total(state.cart, state.products) || 0;
}

async function cleanCartBeforeCheckout() {
  const data = await api("/api/products");
  const products = data.products || [];
  const cleanCart = window.CommerceCart?.availableOnly(state.cart, products) || [];

  if (cleanCart.length !== state.cart.length) {
    state.cart = cleanCart;
    window.CommerceCart?.save(state.cart);
    renderCart();
    toast("Removed unavailable items from your cart.");
  }

  return state.cart.length > 0;
}

function switchView(viewName) {
  if (viewName === "cart") renderCart();
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
  try {
    const data = await api("/api/auth/me");
    state.user = data.user;
  } catch (error) {
    if (error.status !== 401) throw error;
    state.user = null;
    state.authToken = "";
    window.CommerceAuth?.clearSession();
  }
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
  renderProductLoadingState();
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
  const visibleProducts = state.products;

  $("#resultCount").textContent = `${state.products.length} item${state.products.length === 1 ? "" : "s"}`;
  if ($("#metricProducts")) $("#metricProducts").textContent = state.products.length;
  renderHeroPreview();

  const grid = $("#productGrid");
  grid?.setAttribute("aria-busy", "false");

  if (!visibleProducts.length) {
    grid.innerHTML = emptyStateMarkup({
      title: "No products match those filters.",
      message: "Try widening your price, rating, or stock filters to see more of the collection.",
      action: `<button class="secondary-button" type="button" onclick="clearCatalogFilters()">Reset filters</button>`
    });
    return;
  }

  grid.innerHTML = visibleProducts.map(productCardMarkup).join("");
  prepareScrollReveals(grid.querySelectorAll(".product-card"));
}

function renderProductLoadingState() {
  const grid = $("#productGrid");
  if (!grid) return;
  grid.setAttribute("aria-busy", "true");
  grid.innerHTML = Array.from({ length: 6 }, (_, index) => `
    <article class="product-card product-card-skeleton" aria-hidden="true" style="--reveal-delay: ${index * 50}ms">
      <div class="skeleton-media"></div>
      <div class="product-body">
        <span class="skeleton-line short"></span>
        <span class="skeleton-line title"></span>
        <span class="skeleton-line"></span>
        <span class="skeleton-line"></span>
        <span class="skeleton-button"></span>
      </div>
    </article>
  `).join("");
}

function productCardMarkup(product) {
  const stock = Number(product.stock) || 0;
  const isOutOfStock = stock < 1;
  const stockLabel = isOutOfStock ? "Out of stock" : stock < 6 ? `Only ${stock} left` : `${stock} in stock`;
  const rating = Number(product.rating || 0).toFixed(1);
  const category = product.category || "Featured";
  const description = product.description || "Product details are coming soon.";

  return `
    <article class="product-card${isOutOfStock ? " is-out-of-stock" : ""}" onclick="openProductDetail('${product.id}')">
      <div class="product-media">
        <img src="${escapeAttr(productImageSrc(product))}" alt="${escapeAttr(product.name)}" loading="lazy" onerror="this.onerror=null; this.src='${escapeAttr(productFallbackImage(product))}';">
        <span class="stock-badge ${isOutOfStock ? "stock-badge-muted" : ""}">${escapeHtml(stockLabel)}</span>
      </div>
      <div class="product-body">
        <div class="product-meta">
          <span class="pill">${escapeHtml(category)}</span>
          <strong aria-label="Rated ${rating} out of 5">${rating} stars</strong>
        </div>
        <h3>${escapeHtml(product.name)}</h3>
        <p>${escapeHtml(description)}</p>
        <div class="product-footer">
          <span class="price">${money(product.price)}</span>
          <span>${escapeHtml(stockLabel)}</span>
        </div>
        <div class="product-actions">
          <button class="primary-button" type="button" onclick="event.stopPropagation(); addToCart('${product.id}')" ${isOutOfStock ? "disabled aria-disabled=\"true\"" : ""}>${isOutOfStock ? "Sold out" : "Add to cart"}</button>
          <button class="secondary-button" type="button" onclick="event.stopPropagation(); openProductDetail('${product.id}')" aria-label="View ${escapeAttr(product.name)} details">Details</button>
        </div>
      </div>
    </article>
  `;
}

function clearCatalogFilters() {
  if ($("#searchInput")) $("#searchInput").value = "";
  if ($("#topSearchInput")) $("#topSearchInput").value = "";
  if ($("#categorySelect")) $("#categorySelect").value = "all";
  if ($("#priceSelect")) $("#priceSelect").value = "";
  if ($("#priceRange")) $("#priceRange").value = "2000";
  if ($("#ratingSelect")) $("#ratingSelect").value = "0";
  if ($("#stockCheckbox")) $("#stockCheckbox").checked = false;
  if ($("#priceLabel") && $("#priceRange")) $("#priceLabel").textContent = money($("#priceRange").value);
  loadProducts().catch((error) => toast(error.message));
}

function emptyStateMarkup({ title, message, action = "" }) {
  return `
    <div class="empty-state wide-panel" role="status">
      <span class="empty-state-icon" aria-hidden="true">L&C</span>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(message)}</p>
      ${action}
    </div>
  `;
}

function renderHeroPreview() {
  const strip = $("#heroProductStrip");
  if (!state.products.length) return;

  const featuredProducts = state.products
    .filter((product) => product.stock > 0)
    .sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));

  state.heroProducts = featuredProducts.length ? featuredProducts : state.products;
  if (state.heroIndex >= state.heroProducts.length) state.heroIndex = 0;
  renderHeroProduct();

  if (strip) {
    strip.innerHTML = state.heroProducts.slice(0, 4).map((product, index) => `
      <button class="hero-strip-item" type="button" onclick="showHeroProduct(${index})" aria-label="Show ${escapeAttr(product.name)} in hero">
        <img src="${escapeAttr(productImageSrc(product))}" alt="">
        <span>${escapeHtml(product.name)}</span>
      </button>
    `).join("");
  }

  startHeroRotation();
}

function renderHeroProduct() {
  const featureImage = $("#heroFeatureImage");
  if (!featureImage || !state.heroProducts.length) return;

  const product = state.heroProducts[state.heroIndex] || state.heroProducts[0];
  featureImage.classList.remove("is-swapping");
  featureImage.src = productImageSrc(product);
  featureImage.alt = `${product.name} from L&C Enterprise`;
  window.requestAnimationFrame?.(() => featureImage.classList.add("is-swapping"));
}

function showHeroProduct(index) {
  if (!state.heroProducts.length) return;
  state.heroIndex = (index + state.heroProducts.length) % state.heroProducts.length;
  renderHeroProduct();
  startHeroRotation();
}

function moveHeroProduct(direction) {
  showHeroProduct(state.heroIndex + direction);
}

function startHeroRotation() {
  window.clearInterval(state.heroTimer);
  if (state.heroProducts.length < 2) return;
  state.heroTimer = window.setInterval(() => moveHeroProduct(1), 5000);
}
function prepareScrollReveals(nodes) {
  const revealNodes = [...nodes].filter(Boolean);
  if (!revealNodes.length) return;

  revealNodes.forEach((node, index) => {
    node.classList.add("scroll-reveal");
    node.style.setProperty("--reveal-delay", `${Math.min(index, 8) * 70}ms`);

    if (!revealObserver) {
      node.classList.add("is-visible");
    } else {
      revealObserver.observe(node);
    }
  });
}

function setupScrollAnimations() {
  const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const revealTargets = [
    ".hero-copy",
    ".hero-showcase",
    ".hero-trust-row > *",
    ".filters",
    ".wide-panel",
    ".settings-group",
    ".admin-form",
    ".admin-product-row",
    ".order-card",
    ".footer-panel"
  ];

  if (motionQuery?.matches || !("IntersectionObserver" in window)) {
    prepareScrollReveals($$(revealTargets.join(", ")));
    return;
  }

  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      revealObserver.unobserve(entry.target);
    });
  }, {
    threshold: 0.14,
    rootMargin: "0px 0px -8% 0px"
  });

  prepareScrollReveals($$(revealTargets.join(", ")));
}

function animateToProducts() {
  const shopView = $("#shopView");
  if (!shopView) return;

  document.body.classList.add("shop-transition-active");
  shopView.classList.add("focus-arrive");
  shopView.scrollIntoView({ behavior: "smooth", block: "start" });

  window.setTimeout(() => {
    document.body.classList.remove("shop-transition-active");
    shopView.classList.remove("focus-arrive");
  }, 1300);
}

function applyCurrency(currency) {
  state.currency = currency === "KES" ? "KES" : "USD";
  localStorage.setItem("commerce-currency", state.currency);
  const button = $("#currencyToggleButton");
  const label = $("#currencyLabel");
  if (label) label.textContent = state.currency;
  if (button) {
    const nextCurrency = state.currency === "USD" ? "KES" : "USD";
    button.setAttribute("aria-label", `Switch currency to ${nextCurrency}`);
    button.setAttribute("title", `Switch currency to ${nextCurrency}`);
  }
  if ($("#priceLabel") && $("#priceRange")) $("#priceLabel").textContent = money($("#priceRange").value);
  updatePriceSelectLabels();
}

function toggleCurrency() {
  applyCurrency(state.currency === "USD" ? "KES" : "USD");
  renderProducts();
  renderCart();
  if (!$("#productDetailModal")?.classList.contains("hidden")) closeProductDetail();
}

function updatePriceSelectLabels() {
  const priceSelect = $("#priceSelect");
  if (!priceSelect) return;
  const labels = [
    ["", "All prices"],
    ["0-50", `Under ${money(50)}`],
    ["50-250", `${money(50)} to ${money(250)}`],
    ["250-550", `${money(250)} to ${money(550)}`],
    ["550-1000", `${money(550)} to ${money(1000)}`],
    ["1000+", `Over ${money(1000)}`]
  ];
  labels.forEach(([value, label]) => {
    const option = [...priceSelect.options].find((entry) => entry.value === value);
    if (option) option.textContent = label;
  });
}

function updateTopbarState() {
  document.body.classList.toggle("topbar-scrolled", window.scrollY > 18);
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
  return window.CommerceCatalog?.tags(product) || [];
}

function productImageSrc(product) {
  const image = String(product.image || "").trim();
  if (image && !image.includes("via.placeholder.com")) return image;
  return window.CommerceCatalog?.imageSrc(product, escapeHtml) || "";
}

function productFallbackImage(product) {
  return window.CommerceCatalog?.imageSrc({ ...product, image: "" }, escapeHtml) || "";
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
  if ($("#cartCount")) {
    $("#cartCount").textContent = count;
    $("#cartCount").classList.toggle("hidden", !state.user || count === 0);
  }

  if ($("#cartTotal")) $("#cartTotal").textContent = money(currentCartTotal());
  if ($("#cartPageTotal")) $("#cartPageTotal").textContent = money(currentCartTotal());
  if ($("#metricCart")) $("#metricCart").textContent = money(currentCartTotal());
  const items = $("#cartItems");
  const pageItems = $("#cartPageItems");
  if (!state.cart.length) {
    const emptyCart = emptyStateMarkup({
      title: "Your cart is empty.",
      message: "Add a product from the collection and checkout will be ready when you are.",
      action: `<button class="secondary-button" type="button" onclick="switchView('shop')">Continue shopping</button>`
    });
    if (items) items.innerHTML = emptyCart;
    if (pageItems) pageItems.innerHTML = emptyCart;
    return;
  }
  const markup = state.cart.map((item) => {
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
  if (items) items.innerHTML = markup;
  if (pageItems) pageItems.innerHTML = markup;
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

  const payload = window.CommerceCheckout?.buildOrderPayload({
    cart: state.cart,
    paymentMethod: paymentMethod.value,
    mpesaPhone: $("#mpesaPhone")?.value,
    user: state.user,
    shippingAddress: {
      name: shipName.value,
      address: shipAddress.value,
      city: shipCity.value
    }
  });

  if (payload?.error) {
    if (payload.error.includes("M-Pesa")) $("#mpesaPhone")?.focus();
    toast(payload.error);
    return;
  }

  const data = await api("/api/orders", { method: "POST", body: payload.body });
  $("#cartDrawer")?.classList.remove("open");
  if (data.checkoutUrl) {
    location.href = data.checkoutUrl;
  } else {
    toast(data.message || `Order ${data.order.id} placed.`);
    switchView("orders");
  }
}

async function loadOrders() {
  const list = $("#ordersList");
  if (!state.user) {
    list.innerHTML = emptyStateMarkup({
      title: "Sign in to track your orders.",
      message: "Your order history, payment state, and delivery updates appear here after checkout.",
      action: `<button class="primary-button" type="button" onclick="openAuth('login')">Sign in</button>`
    });
    return;
  }
  const data = await api("/api/orders");
  list.innerHTML = renderOrders(data.orders, state.user.role === "admin");
}

async function loadAdminOrders() {
  if (state.user?.role !== "admin") return;
  const data = await api("/api/orders");
  $("#adminOrderCount").textContent = `${data.orders.length} order${data.orders.length === 1 ? "" : "s"}`;
  $("#adminOrders").innerHTML = renderOrders(data.orders, true);
}

function renderOrders(orders, adminMode) {
  if (!orders.length) {
    return emptyStateMarkup({
      title: "No orders yet.",
      message: adminMode ? "New customer orders will appear here as they are placed." : "When you place an order, tracking and payment details will appear here."
    });
  }
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
      <div class="order-line">
        <span>${escapeHtml(order.paymentProvider)} payment</span>
        <strong>${escapeHtml(order.paymentStatus || "Unknown")}</strong>
      </div>
      <div class="timeline">
        ${order.timeline.map((item) => `<span class="pill">${escapeHtml(item.label)}</span>`).join("")}
      </div>
      <div class="order-line">
        <strong>${money(order.total)}</strong>
        ${adminMode ? `
          <select onchange="updateOrderStatus('${order.id}', this.value)">
            ${(window.CommerceAdmin?.ORDER_STATUSES || ["Processing", "Packed", "Shipped", "Delivered", "Cancelled"]).map((status) => `<option ${status === order.status ? "selected" : ""}>${status}</option>`).join("")}
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

async function loadSearchSuggestions(value) {
  const query = String(value || "").trim();
  const list = $("#searchSuggestions");
  if (!list) return;
  if (!query) {
    list.innerHTML = "";
    return;
  }

  const data = await api(`/api/products/suggestions?search=${encodeURIComponent(query)}`);
  list.innerHTML = (data.suggestions || [])
    .map((suggestion) => `<option value="${escapeAttr(suggestion)}"></option>`)
    .join("");
}

function setAdminPanel(panel) {
  const selected = ["inventory", "add-product", "edit-product", "orders"].includes(panel) ? panel : "inventory";
  const visibleSection = ["add-product", "edit-product"].includes(selected) ? "product-form" : selected;
  const adminView = $("#adminView");
  if (adminView) adminView.dataset.activeSection = selected;
  $$("[data-admin-panel]").forEach((button) => button.classList.toggle("active", button.dataset.adminPanel === selected));
  $(`[data-admin-section="${visibleSection}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
  setAdminPanel("edit-product");
}

function resetProductForm() {
  state.editingProductId = null;
  $("#formTitle").textContent = "Add Product";
  $("#productForm").reset();
  $("#productId").value = "";
  $("#productRating").value = "4.5";
  setAdminPanel("add-product");
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
  state.signupStep = "details";
  state.signupVerificationId = null;
  closeMenus();
  $("#authModal").classList.remove("hidden");
  const isRegister = mode === "register";
  $("#authTitle").textContent = isRegister ? "Create account" : "Sign in";
  $("#authSubmit").textContent = isRegister ? "Send WhatsApp code" : "Sign in";
  $("#toggleAuthMode").textContent = isRegister ? "Already have an account? Sign in" : "Need an account? Create one";
  $$(".register-only").forEach((node) => node.classList.toggle("hidden", !isRegister));
  $$(".signup-code-field").forEach((node) => node.classList.add("hidden"));
  $("#authPhone")?.toggleAttribute("required", isRegister);
  $("#authSignupCode")?.toggleAttribute("required", false);
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
  const identifier = $("#resetIdentifier")?.value || $("#resetEmail")?.value;

  if (state.resetStep === "email") {
    await api("/api/auth/forgot-password", { method: "POST", body: { identifier } });
    state.resetStep = "code";
    updateResetPasswordUI();
    toast("Reset code sent to WhatsApp.");
    $("#resetCode")?.focus();
    return;
  }

  if (state.resetStep === "code") {
    const data = await api("/api/auth/verify-reset-code", {
      method: "POST",
      body: { identifier, code: $("#resetCode")?.value }
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
    phone: $("#authPhone")?.value,
    password: $("#authPassword").value
  };
  if (state.authMode === "register" && state.signupStep === "details") {
    const data = await api("/api/auth/request-signup-code", { method: "POST", body });
    state.signupStep = "code";
    state.signupVerificationId = data.verificationId;
    $("#authTitle").textContent = "Enter WhatsApp code";    
    $$(".signup-code-field").forEach((node) => node.classList.remove("hidden"));
    $("#authSignupCode")?.toggleAttribute("required", true);
    $("#authSubmit").textContent = "Verify and create account";
    toast("Signup code sent to WhatsApp.");
    $("#authSignupCode")?.focus();
    return;
  }
  if (state.authMode === "register") {
    body.verificationId = state.signupVerificationId;
    body.code = $("#authSignupCode")?.value;
  }
  const path = state.authMode === "register" ? "/api/auth/register" : "/api/auth/login";
  const data = await api(path, { method: "POST", body });
  state.user = data.user;
  state.authToken = data.token || "";
  window.CommerceAuth?.rememberSession(state.authToken);
  $("#authModal").classList.add("hidden");
  updateAuthUI();
  toast(`Welcome, ${state.user.name}.`);

  state.pendingCatalogRedirect = false;
  if (state.user.role === "admin") {
    location.href = "/admin/index.html#overview";
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
  state.authToken = "";
  window.CommerceAuth?.clearSession();
  updateAuthUI();
  toast("Signed out.");
  location.href = "/";
}

function getUserInitials(user) {
  return window.CommerceAuth?.initials(user) || "A";
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

  if (action === "cart") {
    switchView("cart");
    return;
  }

  if (action === "wishlist") {
    toast("Wishlist will be available from your account soon.");
  }
}

function renderProfileForm() {
  if (!state.user) return;

  const names = String(state.user.name || "").split(" ");
  $("#profileFirstName").value = names[0] || "";
  $("#profileLastName").value = names.slice(1).join(" ");
  $("#profileEmail").value = state.user.email || "";
  $("#profilePhone").value = state.user.phone || "";
  $("#profileDisplayName").textContent = state.user.name || "My Profile";
  $("#profileEmailText").textContent = state.user.email || "";
}

function previewProfileAvatar(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    $("#profileAvatarPreview").src = reader.result;
  };
  reader.readAsDataURL(file);
}

async function saveProfile(event) {
  event.preventDefault();

  const body = {
    name: `${$("#profileFirstName").value} ${$("#profileLastName").value}`.trim(),
    phone: $("#profilePhone").value,
    dob: $("#profileDob").value,
    gender: $("#profileGender").value,
    username: $("#profileUsername").value,
    bio: $("#profileBio").value
  };

  const data = await api("/api/auth/profile", {
    method: "PUT",
    body
  });

  state.user = data.user;
  updateAuthUI();
  renderProfileForm();
  toast("Profile saved.");
}

function handleProfileAction(action) {
  closeMenus();
  if (action === "signout") {
    logout().catch((error) => toast(error.message));
    return;
  }

  if (action === "profile") {
  switchView("profile");
  renderProfileForm();
  return;
}

if (action === "settings") {
  switchView("settings");
  return;
}

if (action === "help") {
  switchView("help");
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

function updatePaymentFields() {
  const selected = $("#paymentMethod")?.value;
  $("#cardFields")?.classList.toggle("hidden", selected !== "credit_card");
  $("#mpesaFields")?.classList.toggle("hidden", selected !== "m-pesa");
  $("#paypalFields")?.classList.toggle("hidden", selected !== "paypal");
  $("#dcashFields")?.classList.toggle("hidden", selected !== "d-cash");
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
      animateToProducts();
    });
  }

  $("#scrollToShopButton")?.addEventListener("click", animateToProducts);
  $("#heroPrevButton")?.addEventListener("click", () => moveHeroProduct(-1));
  $("#heroNextButton")?.addEventListener("click", () => moveHeroProduct(1));
  $("#currencyToggleButton")?.addEventListener("click", toggleCurrency);
  updateTopbarState();
  window.addEventListener("scroll", updateTopbarState, { passive: true });

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
      loadSearchSuggestions(topSearchInput.value).catch(() => {});
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
      if (id === "searchInput") loadSearchSuggestions(node.value).catch(() => {});
      loadProducts().catch((error) => toast(error.message));
    });
  });

  $("#themeToggleButton")?.addEventListener("click", () => {
    applyTheme(state.theme === "light" ? "dark" : "light");
  });

  $("#profileAvatar")?.addEventListener("change", previewProfileAvatar);
  $("#profileForm")?.addEventListener("submit", (event) => saveProfile(event).catch((error) => toast(error.message)));

  $("#openCheckoutButton")?.addEventListener("click", () => {
    if (!requireSignin("Please sign in before checkout.")) return;
    $("#cartDrawer")?.classList.add("open");
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
  $("#paymentMethod")?.addEventListener("change", updatePaymentFields);
  $("#refreshOrdersButton")?.addEventListener("click", () => loadOrders().catch((error) => toast(error.message)));
  $("#closeAuthButton")?.addEventListener("click", () => $("#authModal").classList.add("hidden"));
  $("#forgotPasswordButton")?.addEventListener("click", openResetPassword);
  $("#backToLoginButton")?.addEventListener("click", () => { closeResetPassword(); openAuth("login");});
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
  setupScrollAnimations();
  applyTheme(state.theme);
  applyCurrency(state.currency);
  if ($("#copyrightYear")) $("#copyrightYear").textContent = new Date().getFullYear();
  if ($("#priceLabel") && $("#priceRange")) $("#priceLabel").textContent = money($("#priceRange").value);
  updatePaymentFields();
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
window.showHeroProduct = showHeroProduct;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.updateOrderStatus = updateOrderStatus;

init().catch((error) => toast(error.message));

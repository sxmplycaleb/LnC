(function () {
  const tokenKey = "commerce-auth-token";
  const sidebarStateKey = "commerce-admin-sidebar";
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
  const state = {
    user: null,
    dashboard: null,
    route: "overview",
    loading: true,
    loadError: "",
    tableFilter: "",
    selected: new Set()
  };

  const navItems = [
    { id: "overview", label: "Overview", icon: "OV", roles: ["admin"] },
    { id: "profile", label: "Profile", icon: "PR", roles: ["admin"] },
    { id: "products", label: "Products", icon: "PD", roles: ["admin"] },
    { id: "orders", label: "Orders", icon: "OR", roles: ["admin"] },
    { id: "users", label: "Users", icon: "US", roles: ["admin"] },
    { id: "categories", label: "Categories", icon: "CT", roles: ["admin"] },
    { id: "brands", label: "Brands", icon: "BR", roles: ["admin"] },
    { id: "inventory", label: "Inventory", icon: "IN", roles: ["admin"] },
    { id: "reviews", label: "Reviews", icon: "RV", roles: ["admin"] },
    { id: "coupons", label: "Coupons", icon: "CP", roles: ["admin"] },
    { id: "analytics", label: "Analytics", icon: "AN", roles: ["admin"] },
    { id: "settings", label: "Settings", icon: "ST", roles: ["admin"] }
  ];

  const pageMeta = {
    overview: ["Dashboard", "Overview", "Business performance, operations, and alerts at a glance."],
    profile: ["Account", "Profile", "Manage admin identity, security, and recent account activity."],
    products: ["Catalog", "Products", "Search, filter, edit, import, export, and manage inventory."],
    orders: ["Sales", "Orders", "Review orders, payment status, fulfillment, refunds, and invoices."],
    users: ["Access", "Users", "Manage customers, staff roles, online status, and account controls."],
    categories: ["Catalog", "Categories", "Organize product groups, images, and product counts."],
    brands: ["Catalog", "Brands", "Maintain brand records, logos, and product assignments."],
    inventory: ["Operations", "Inventory", "Track stock movements, restocking, warehouses, and alerts."],
    reviews: ["Customers", "Reviews", "Moderate ratings, replies, and product feedback."],
    coupons: ["Growth", "Coupons & Discounts", "Create promotions, usage limits, and expiry rules."],
    analytics: ["Reports", "Analytics", "Revenue, customers, sales trends, and exportable reports."],
    settings: ["System", "Settings", "Store, tax, currency, shipping, payment, theme, and security controls."]
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  async function api(path, options = {}) {
    const token = localStorage.getItem(tokenKey) || "";
    const response = await fetch(path, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  }

  function initTheme() {
    const saved = localStorage.getItem("commerce-theme") || "dark";
    document.documentElement.setAttribute("data-theme", saved);
    updateThemeButton(saved);
  }

  function updateThemeButton(theme) {
    const themeToggle = document.getElementById("themeToggle");
    if (themeToggle) themeToggle.textContent = theme === "dark" ? "D" : "L";
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("commerce-theme", next);
    updateThemeButton(next);
    toast(`${next === "dark" ? "Dark" : "Light"} mode enabled`);
  }

  function toast(message) {
    const region = document.getElementById("toastRegion");
    if (!region) return;
    const item = document.createElement("div");
    item.className = "toast";
    item.textContent = message;
    region.appendChild(item);
    window.setTimeout(() => item.remove(), 2800);
  }

  async function handleLogin(event) {
    event.preventDefault();
    const error = document.getElementById("loginError");
    if (error) error.textContent = "";
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: {
          email: document.getElementById("email").value,
          password: document.getElementById("password").value
        }
      });
      localStorage.setItem(tokenKey, data.token);
      window.location.href = dashboardPathForRole(data.user);
    } catch (err) {
      if (error) error.textContent = err.message;
    }
  }

  function dashboardPathForRole(user) {
    const role = String(user?.role || "").toLowerCase();
    if (role === "admin") return "/admin/index.html#overview";
    return "/catalog.html";
  }

  function canAccess(item) {
    return item.roles.includes(state.user?.role);
  }

  function renderNav() {
    const nav = document.getElementById("sidebarNav");
    if (!nav) return;
    nav.innerHTML = navItems.filter(canAccess).map((item) => `
      <a class="${state.route === item.id ? "active" : ""}" href="#${item.id}" title="${escapeHtml(item.label)}">
        <span class="nav-icon" aria-hidden="true">${item.icon}</span>
        <span class="nav-label">${escapeHtml(item.label)}</span>
      </a>
    `).join("");
  }

  function setPageChrome() {
    const [section, title, subtitle] = pageMeta[state.route] || pageMeta.overview;
    updateGreeting();
    document.getElementById("pageSection").textContent = section;
    document.getElementById("pageTitle").textContent = title;
    document.getElementById("pageSubtitle").textContent = subtitle;
    document.getElementById("breadcrumb").textContent = `${section} / ${title}`;
    document.getElementById("pageActions").innerHTML = actionMarkup(state.route);
  }

  function actionMarkup(route) {
    const actions = {
      overview: `<button class="secondary-button" data-action="refresh">Refresh</button><a class="primary-button" href="#analytics">Open Analytics</a>`,
      products: `<button class="secondary-button" data-action="export-products">Export CSV</button><button class="primary-button" data-action="add-product">Add Product</button>`,
      orders: `<button class="secondary-button" data-action="print-invoice">Print Invoice</button><button class="primary-button" data-action="refresh">Refresh</button>`,
      users: `<button class="secondary-button" data-action="rbac">RBAC Matrix</button><button class="primary-button" data-action="invite-user">Invite User</button>`,
      analytics: `<button class="secondary-button" data-action="export-pdf">Export PDF</button><button class="primary-button" data-action="export-csv">Export CSV</button>`,
      settings: `<button class="primary-button" data-action="save-settings">Save Settings</button>`
    };
    return actions[route] || `<button class="primary-button" data-action="create">Create</button>`;
  }

  function updateGreeting() {
    const greeting = document.getElementById("welcomeGreeting");
    if (!greeting) return;
    const hour = new Date().getHours();
    const daypart = hour >= 5 && hour < 12 ? "Good morning" : hour >= 12 && hour < 17 ? "Good afternoon" : "Good evening";
    const name = String(state.user?.name || state.user?.email || "Admin").trim();
    const firstName = name.includes(" ") ? name.split(/\s+/)[0] : name;
    greeting.textContent = `${daypart}, ${firstName}`;
  }

  function skeleton(count = 8) {
    return `<div class="skeleton-grid">${Array.from({ length: count }, () => `<div class="skeleton"></div>`).join("")}</div>`;
  }

  function errorState(message) {
    return `
      <div class="empty-state error-state">
        <strong>Dashboard data could not load</strong>
        <p>${escapeHtml(message || "Check that the server is running, then try again.")}</p>
        <button class="primary-button" data-action="retry-load" type="button">Retry</button>
      </div>
    `;
  }

  function emptyState(title, body) {
    return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(body)}</p></div>`;
  }

  function statusPill(value) {
    const key = String(value || "Unknown").toLowerCase().replace(/\s+/g, "-");
    return `<span class="pill ${key}">${escapeHtml(value || "Unknown")}</span>`;
  }

  function card(label, value, hint) {
    return `<article class="stat-card"><span>${escapeHtml(label)}</span><strong>${value}</strong><small>${escapeHtml(hint || "")}</small></article>`;
  }

  function chart(title, series, formatValue = (value) => value) {
    const max = Math.max(...(series || []).map((item) => Number(item.value || 0)), 1);
    const bars = (series || []).map((item) => `
      <div class="bar-row">
        <span>${escapeHtml(item.label)}</span>
        <div class="bar-track"><i style="width:${Math.max((Number(item.value || 0) / max) * 100, 3)}%"></i></div>
        <strong>${escapeHtml(formatValue(item.value))}</strong>
      </div>
    `).join("");
    return `<article class="panel chart-panel"><h2>${escapeHtml(title)}</h2>${bars || emptyState("No chart data", "Data will appear when transactions are recorded.")}</article>`;
  }

  function table(headers, rows, emptyMessage) {
    if (!rows.length) return emptyState("Nothing to show", emptyMessage);
    return `
      <div class="table-wrap">
        <table>
          <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
          <tbody>${rows.join("")}</tbody>
        </table>
      </div>
      <div class="table-footer"><span>Showing ${rows.length} records</span><div><button class="pager" disabled>Prev</button><button class="pager">Next</button></div></div>
    `;
  }

  function filtered(items, fields) {
    const value = state.tableFilter.trim().toLowerCase();
    if (!value) return items;
    return items.filter((item) => fields.some((field) => String(item[field] || "").toLowerCase().includes(value)));
  }

  function renderOverview() {
    const data = state.dashboard;
    const kpis = data.kpis || {};
    const notifications = [
      ...((data.lowStock || []).map((product) => ({ label: `${product.name} is low on stock`, type: "Low stock" }))),
      ...((data.recentOrders || []).filter((order) => order.status === "Pending").map((order) => ({ label: `Order ${order.id} needs processing`, type: "Pending order" }))),
      ...((data.failedPayments || []).map((order) => ({ label: `Payment failed for ${order.id}`, type: "Failed payment" }))),
      ...((data.latestUsers || []).slice(0, 3).map((user) => ({ label: `${user.name || user.email} registered`, type: "New customer" })))
    ].slice(0, 8);
    return `
      <section class="stats-grid">
        ${card("Total Revenue", money.format(kpis.totalRevenue || kpis.revenue || 0), "All successful sales")}
        ${card("Revenue Today", money.format(kpis.revenueToday || 0), "Since midnight")}
        ${card("Total Orders", kpis.totalOrders || 0, "Lifetime orders")}
        ${card("Orders Today", kpis.ordersToday || 0, "New today")}
        ${card("Total Products", kpis.totalProducts || 0, "Catalog items")}
        ${card("Active Customers", kpis.activeCustomers || 0, "Non-admin accounts")}
        ${card("Low Stock Products", kpis.lowStockProducts || 0, "At or below threshold")}
        ${card("Out of Stock Products", kpis.outOfStockProducts || 0, "Require restocking")}
      </section>
      <section class="grid two">
        ${chart("Revenue Over Time", data.charts?.revenueByDay || [], (value) => money.format(value || 0))}
        ${chart("Orders Over Time", data.charts?.ordersByDay || [])}
        ${chart("Best-selling Products", data.charts?.bestSellingProducts || [])}
        ${chart("Sales by Category", data.charts?.salesByCategory || [])}
      </section>
      <section class="grid three">
        <article class="panel"><h2>Recent Orders</h2>${ordersTable((data.recentOrders || []).slice(0, 6))}</article>
        <article class="panel"><h2>Recent Activity</h2>${activityList(data.recentActivity || [])}</article>
        <article class="panel"><h2>Latest Registered Users</h2>${usersTable((data.latestUsers || []).slice(0, 6))}</article>
      </section>
      <section class="panel"><div class="panel-title"><h2>Notifications</h2><span class="badge">${notifications.length}</span></div>${notificationList(notifications)}</section>
    `;
  }

  function ordersTable(orders) {
    return table(["Order", "Customer", "Total", "Status"], orders.map((order) => `
      <tr><td>${escapeHtml(order.id)}</td><td>${escapeHtml(order.customer?.email || order.customer?.name || "Guest")}</td><td>${money.format(order.total || 0)}</td><td>${statusPill(order.status)}</td></tr>
    `), "Orders will appear after checkout.");
  }

  function usersTable(users) {
    return table(["Name", "Email", "Role"], users.map((user) => `
      <tr><td>${escapeHtml(user.name || "Unnamed")}</td><td>${escapeHtml(user.email)}</td><td>${statusPill(user.role)}</td></tr>
    `), "Users will appear after registration.");
  }

  function activityList(items) {
    if (!items.length) return emptyState("No recent activity", "Operational events will show up here.");
    return `<div class="activity-list">${items.map((item) => `<div class="split"><span>${escapeHtml(item.label)}</span><small>${formatDate(item.at)}</small></div>`).join("")}</div>`;
  }

  function notificationList(items) {
    if (!items.length) return emptyState("All clear", "No stock, payment, order, or registration alerts right now.");
    return `<div class="notification-grid">${items.map((item) => `<div class="notice"><span>${escapeHtml(item.type)}</span><strong>${escapeHtml(item.label)}</strong></div>`).join("")}</div>`;
  }

  function formatDate(value) {
    if (!value) return "Unknown";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Unknown" : dateFormatter.format(date);
  }

  function renderProfile() {
    const user = state.user || {};
    return `
      <section class="grid two">
        <article class="panel">
          <h2>Personal Information</h2>
          <div class="form-grid">
            <label>Name<input value="${escapeHtml(user.name || "")}"></label>
            <label>Email<input type="email" value="${escapeHtml(user.email || "")}"></label>
            <label>Phone<input value="${escapeHtml(user.phone || "")}"></label>
            <label>Username<input value="${escapeHtml(user.username || "")}"></label>
          </div>
        </article>
        <article class="panel">
          <h2>Security</h2>
          <div class="setting-row"><span>Change password</span><button class="secondary-button" data-action="password">Update</button></div>
          <div class="setting-row"><span>Two-factor authentication</span><label class="switch"><input type="checkbox"><i></i></label></div>
          <div class="setting-row"><span>Profile picture</span><button class="secondary-button" data-action="upload-avatar">Upload</button></div>
        </article>
      </section>
      <section class="panel"><h2>Account Activity</h2>${activityList([{ label: "Current admin session verified", at: new Date().toISOString() }])}</section>
    `;
  }

  function renderProducts() {
    const products = filtered(state.dashboard.products || [], ["name", "category"]);
    return `
      ${filtersMarkup(["Category", "Brand", "Stock status", "Price"])}
      <section class="panel">
        <div class="panel-title"><h2>All Products</h2><div class="button-row"><button class="secondary-button" data-action="bulk-edit">Bulk Edit</button><button class="danger-button" data-action="bulk-delete">Bulk Delete</button></div></div>
        ${table(["", "Product", "Category", "Price", "Stock", "Visibility"], products.map((product) => `
          <tr>
            <td><input type="checkbox" data-select="${escapeHtml(product.id)}"></td>
            <td><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.id)}</small></td>
            <td>${escapeHtml(product.category || "Uncategorized")}</td>
            <td>${money.format(product.price || 0)}</td>
            <td>${statusPill(Number(product.stock || 0) <= 0 ? "Out of stock" : Number(product.stock || 0) <= 5 ? "Low stock" : "In stock")}</td>
            <td><label class="switch"><input type="checkbox" checked><i></i></label></td>
          </tr>
        `), "No products match the current search.")}
      </section>
    `;
  }

  function renderOrders() {
    const orders = filtered(state.dashboard.orders || [], ["id", "status", "paymentStatus"]);
    const cards = state.dashboard.orderCards || {};
    return `
      <section class="stats-grid compact">
        ${card("Pending Orders", cards.pending || 0, "Needs attention")}
        ${card("Processing Orders", cards.processing || 0, "Being fulfilled")}
        ${card("Completed Orders", cards.completed || 0, "Delivered")}
        ${card("Cancelled Orders", cards.cancelled || 0, "Stopped")}
        ${card("Refunded Orders", cards.refunded || 0, "Money returned")}
      </section>
      ${filtersMarkup(["Date", "Status", "Customer", "Payment status"])}
      <section class="panel">
        <h2>Customer Orders</h2>
        ${table(["Order", "Customer", "Total", "Payment", "Status", "Actions"], orders.map((order) => `
          <tr><td>${escapeHtml(order.id)}</td><td>${escapeHtml(order.customer?.email || order.customer?.name || "Guest")}</td><td>${money.format(order.total || 0)}</td><td>${statusPill(order.paymentStatus)}</td><td>${statusPill(order.status)}</td><td><button class="table-action" data-action="order-details">Details</button></td></tr>
        `), "No orders match the current search.")}
      </section>
    `;
  }

  function renderUsers() {
    const users = filtered(state.dashboard.users || [], ["name", "email", "role"]);
    const roles = ["Super Admin", "Admin", "Finance", "Customer Support", "Inventory Manager", "Sales Manager", "Customer"];
    return `
      ${filtersMarkup(["Role", "Status", "Last active"])}
      <section class="panel"><h2>All Users</h2>${table(["Name", "Email", "Role", "Last Active", "Actions"], users.map((user) => `
        <tr><td>${escapeHtml(user.name || "Unnamed")}</td><td>${escapeHtml(user.email)}</td><td>${statusPill(user.role)}</td><td>${formatDate(user.createdAt)}</td><td><button class="table-action" data-action="edit-user">Edit</button></td></tr>
      `), "No users match the current search.")}</section>
      <section class="panel"><h2>Role Permissions</h2><div class="permission-grid">${roles.map((role) => `<div class="permission-card"><strong>${escapeHtml(role)}</strong><p>RBAC-ready role with expandable permissions for future modules.</p></div>`).join("")}</div></section>
    `;
  }

  function filtersMarkup(labels) {
    return `<section class="toolbar"><label class="search-inline"><span>Search</span><input id="tableSearch" type="search" value="${escapeHtml(state.tableFilter)}" placeholder="Search this page"></label>${labels.map((label) => `<button class="filter-button" data-action="filter">${escapeHtml(label)}</button>`).join("")}</section>`;
  }

  function renderCategories() {
    const counts = new Map();
    for (const product of state.dashboard.products || []) counts.set(product.category || "Uncategorized", (counts.get(product.category || "Uncategorized") || 0) + 1);
    return entityGrid("Categories", Array.from(counts.entries()).map(([name, count]) => ({ name, meta: `${count} products`, action: "Edit category" })), "Add Category");
  }

  function renderBrands() {
    return entityGrid("Brands", [
      { name: "House Brand", meta: "Logo pending", action: "Assign products" },
      { name: "Marketplace", meta: "Shared catalog", action: "Edit brand" }
    ], "Add Brand");
  }

  function renderInventory() {
    const products = [...(state.dashboard.products || [])].sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0)).slice(0, 12);
    return `
      <section class="grid two">
        <article class="panel"><h2>Low Stock Alerts</h2>${notificationList((state.dashboard.lowStock || []).map((product) => ({ type: "Restock", label: `${product.name}: ${product.stock} left` })))}</article>
        <article class="panel"><h2>Stock Movements</h2>${activityList(products.map((product) => ({ label: `${product.name} has ${product.stock || 0} units in warehouse`, at: product.updatedAt || product.createdAt })))}</article>
      </section>
      <section class="panel"><h2>Warehouse Quantity</h2>${table(["Product", "Category", "Quantity", "History"], products.map((product) => `<tr><td>${escapeHtml(product.name)}</td><td>${escapeHtml(product.category)}</td><td>${product.stock || 0}</td><td><button class="table-action" data-action="inventory-history">View</button></td></tr>`), "Inventory data will appear after products are added.")}</section>
    `;
  }

  function renderReviews() {
    const reviews = (state.dashboard.products || []).flatMap((product) => (product.reviews || []).map((review) => ({ ...review, product: product.name })));
    return `<section class="panel"><h2>Customer Reviews</h2>${table(["Product", "Rating", "Review", "Actions"], reviews.map((review) => `<tr><td>${escapeHtml(review.product)}</td><td>${review.rating || "N/A"}</td><td>${escapeHtml(review.comment || review.text || "No comment")}</td><td><button class="table-action" data-action="approve-review">Approve</button><button class="table-action" data-action="reply-review">Reply</button></td></tr>`), "No reviews have been submitted yet.")}</section>`;
  }

  function renderCoupons() {
    return entityGrid("Coupons & Discounts", [
      { name: "WELCOME10", meta: "10% off, usage limit ready", action: "Edit coupon" },
      { name: "FIXED5", meta: "$5 off, expiry ready", action: "Edit coupon" }
    ], "Create Coupon");
  }

  function renderAnalytics() {
    const data = state.dashboard;
    return `
      <section class="grid two">
        ${chart("Revenue Analytics", data.charts?.revenueByDay || [], (value) => money.format(value || 0))}
        ${chart("Customer Growth", (data.latestUsers || []).map((user, index) => ({ label: user.name || user.email, value: index + 1 })))}
        ${chart("Best-selling Products", data.charts?.bestSellingProducts || [])}
        ${chart("Sales Trends", data.charts?.ordersByDay || [])}
      </section>
    `;
  }

  function renderSettings() {
    const groups = ["Store information", "Taxes", "Currency", "Shipping", "Email settings", "Payment gateway settings", "Theme settings", "Security settings"];
    return `<section class="settings-grid">${groups.map((group) => `<article class="panel"><h2>${escapeHtml(group)}</h2><div class="form-grid"><label>Name<input placeholder="${escapeHtml(group)}"></label><label>Status<select><option>Enabled</option><option>Disabled</option></select></label></div></article>`).join("")}</section>`;
  }

  function entityGrid(title, items, buttonLabel) {
    return `<section class="panel"><div class="panel-title"><h2>${escapeHtml(title)}</h2><button class="primary-button" data-action="create-entity">${escapeHtml(buttonLabel)}</button></div><div class="entity-grid">${items.map((item) => `<article class="entity-card"><div class="entity-image"></div><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.meta)}</p><button class="table-action" data-action="entity-action">${escapeHtml(item.action)}</button></article>`).join("")}</div></section>`;
  }

  function renderView() {
    const view = document.getElementById("appView");
    if (!view) return;
    renderNav();
    setPageChrome();
    if (state.loading) {
      view.innerHTML = skeleton(10);
      return;
    }
    if (state.loadError || !state.dashboard) {
      view.innerHTML = errorState(state.loadError);
      return;
    }
    const routes = {
      overview: renderOverview,
      profile: renderProfile,
      products: renderProducts,
      orders: renderOrders,
      users: renderUsers,
      categories: renderCategories,
      brands: renderBrands,
      inventory: renderInventory,
      reviews: renderReviews,
      coupons: renderCoupons,
      analytics: renderAnalytics,
      settings: renderSettings
    };
    view.innerHTML = (routes[state.route] || renderOverview)();
    document.getElementById("tableSearch")?.addEventListener("input", (event) => {
      state.tableFilter = event.target.value;
      renderView();
    });
  }

  function setRoute() {
    const next = (window.location.hash || "#overview").replace("#", "") || "overview";
    const item = navItems.find((entry) => entry.id === next);
    state.route = item && canAccess(item) ? next : "overview";
    state.tableFilter = "";
    renderView();
    closeMobileSidebar();
  }

  async function loadDashboard() {
    try {
      state.loading = true;
      state.loadError = "";
      renderView();
      const me = await api("/api/admin/auth/me");
      state.user = me.user;
      if (state.user?.role !== "admin") throw new Error("Admin access required.");
      const initials = (state.user.name || state.user.email || "AD").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
      document.getElementById("avatarInitials").textContent = initials;
      state.dashboard = await api("/api/admin/dashboard");
      state.loading = false;
      setRoute();
    } catch (err) {
      state.loading = false;
      state.dashboard = null;
      state.loadError = err.message || "Unable to load dashboard data.";
      if (/sign in|invalid|expired|admin access/i.test(state.loadError)) {
        localStorage.removeItem(tokenKey);
        window.location.href = "/admin/login.html";
        return;
      }
      renderView();
    }
  }

  function closeMobileSidebar() {
    document.getElementById("appShell")?.classList.remove("sidebar-open");
  }

  function applyStoredSidebarState() {
    const shell = document.getElementById("appShell");
    if (!shell || window.matchMedia("(max-width: 900px)").matches) return;
    const collapsed = sessionStorage.getItem(sidebarStateKey) === "collapsed";
    shell.classList.toggle("sidebar-collapsed", collapsed);
    document.getElementById("sidebarToggle")?.setAttribute("aria-expanded", String(!collapsed));
  }

  function toggleSidebar() {
    const shell = document.getElementById("appShell");
    if (!shell) return;
    if (window.matchMedia("(max-width: 900px)").matches) {
      shell.classList.toggle("sidebar-open");
      return;
    }
    shell.classList.toggle("sidebar-collapsed");
    const collapsed = shell.classList.contains("sidebar-collapsed");
    sessionStorage.setItem(sidebarStateKey, collapsed ? "collapsed" : "expanded");
    document.getElementById("sidebarToggle")?.setAttribute("aria-expanded", String(!collapsed));
  }

  function initDashboardChrome() {
    applyStoredSidebarState();
    document.getElementById("sidebarToggle")?.addEventListener("click", toggleSidebar);
    window.addEventListener("resize", applyStoredSidebarState);
    document.getElementById("mobileSidebarClose")?.addEventListener("click", closeMobileSidebar);
    document.getElementById("sidebarBackdrop")?.addEventListener("click", closeMobileSidebar);
    document.getElementById("themeToggle")?.addEventListener("click", toggleTheme);
    document.getElementById("accountToggle")?.addEventListener("click", () => {
      document.getElementById("accountMenu")?.classList.toggle("open");
    });
    document.addEventListener("click", (event) => {
      if (!event.target.closest("#accountMenu")) document.getElementById("accountMenu")?.classList.remove("open");
    });
    document.getElementById("logoutButton")?.addEventListener("click", () => {
      localStorage.removeItem(tokenKey);
      window.location.href = "/admin/login.html";
    });
    document.getElementById("globalSearch")?.addEventListener("input", (event) => {
      state.tableFilter = event.target.value;
      renderView();
    });
    document.getElementById("pageActions")?.addEventListener("click", async (event) => {
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (!action) return;
      if (action === "refresh") {
        toast("Refreshing dashboard data");
        await loadDashboard();
      } else if (action.includes("delete")) {
        if (window.confirm("Are you sure? This action should be reviewed before continuing.")) toast("Action queued");
      } else {
        toast(`${event.target.textContent.trim()} is ready for backend integration`);
      }
    });
    document.getElementById("appView")?.addEventListener("click", async (event) => {
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (action === "retry-load") {
        toast("Retrying dashboard data");
        await loadDashboard();
      } else if (action?.includes("delete")) {
        if (window.confirm("Are you sure? This action should be reviewed before continuing.")) toast("Action queued");
      } else if (action) {
        toast(`${event.target.textContent.trim()} is ready for backend integration`);
      }
    });
    window.addEventListener("hashchange", setRoute);
  }

  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    document.getElementById("loginForm")?.addEventListener("submit", handleLogin);
    if (document.body.dataset.page === "dashboard") {
      initDashboardChrome();
      loadDashboard();
    }
  });
})();

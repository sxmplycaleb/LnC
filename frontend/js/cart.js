(function () {
  const LEGACY_CART_KEY = "commerce-cart";
  const CART_KEY_PREFIX = "omanutro-cart";

  function ownerKey(user) {
    const ownerId = user?.id || user?.email;
    return ownerId ? `${CART_KEY_PREFIX}:${ownerId}` : `${CART_KEY_PREFIX}:guest`;
  }

  function normalize(cart) {
    return (Array.isArray(cart) ? cart : [])
      .map((item) => ({
        productId: item.productId,
        quantity: Math.max(1, Number(item.quantity) || 1)
      }))
      .filter((item) => item.productId);
  }

  function load(user) {
    return normalize(JSON.parse(localStorage.getItem(ownerKey(user)) || "[]"));
  }

  function save(cart, user) {
    localStorage.setItem(ownerKey(user), JSON.stringify(normalize(cart)));
  }

  function clearLegacy() {
    localStorage.removeItem(LEGACY_CART_KEY);
  }

  function total(cart, products) {
    return cart.reduce((sum, item) => {
      const product = products.find((entry) => entry.id === item.productId);
      return sum + (product ? product.price * item.quantity : 0);
    }, 0);
  }

  function availableOnly(cart, products) {
    const productIds = new Set(products.map((product) => product.id));
    return cart.filter((item) => productIds.has(item.productId) && Number(item.quantity) > 0);
  }

  window.CommerceCart = {
    load,
    save,
    clearLegacy,
    total,
    availableOnly
  };
})();


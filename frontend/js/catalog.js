(function () {
  function tags(product) {
    if (Array.isArray(product.tags)) return product.tags;
    return String(product.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean);
  }

  function fallbackImage(product, escapeHtml) {
    const label = escapeHtml(product.name || "Product");
    const category = escapeHtml(product.category || "OMANUTRO");
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
        <text x="300" y="314" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" letter-spacing="3" fill="#315c96">OMANUTRO</text>
      </svg>
    `;

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function imageSrc(product, escapeHtml) {
    const image = String(product.image || "").trim();
    if (image && !image.includes("via.placeholder.com")) return image;
    return fallbackImage(product, escapeHtml);
  }

  window.CommerceCatalog = {
    tags,
    imageSrc
  };
})();


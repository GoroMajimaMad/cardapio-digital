// Endereço do servidor backend Flask + SocketIO
const API_BASE_URL = "http://127.0.0.1:5000";

function formatBRL(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDateTime(isoStr) {
  if (!isoStr) return "-";
  const date = new Date(isoStr);
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadgeClass(status) {
  return "status-badge-" + String(status || "").replace(/\s+/g, "-");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

// Gera uma imagem ilustrativa SVG quando o produto ainda não possui foto cadastrada
function getCategoryPlaceholder(categorySlug, productName) {
  const palette = {
    sorvetes: { bg1: "#f9c5d1", bg2: "#9795ef", icon: "🍦", label: "Sorvete Artesanal" },
    picoles: { bg1: "#fbc2eb", bg2: "#a6c1ee", icon: "🍧", label: "Picolé Geladinho" },
    acai: { bg1: "#5b216b", bg2: "#b03a8d", icon: "🥣", label: "Açaí Carol Mix" },
    "copo-da-felicidade": { bg1: "#ff9a9e", bg2: "#fad0c4", icon: "🍨", label: "Copo da Felicidade" },
  };
  const style = palette[categorySlug] || {
    bg1: "#7f3f98",
    bg2: "#e94e89",
    icon: "🍨",
    label: "Carol Mix",
  };
  const safeLabel = (productName || style.label).slice(0, 28).replace(/[<>&"]/g, "");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${style.bg1}" />
          <stop offset="100%" stop-color="${style.bg2}" />
        </linearGradient>
      </defs>
      <rect width="600" height="400" fill="url(#g)" />
      <circle cx="520" cy="70" r="95" fill="rgba(255,255,255,0.12)" />
      <circle cx="90" cy="340" r="120" fill="rgba(255,255,255,0.10)" />
      <text x="50%" y="46%" dominant-baseline="middle" text-anchor="middle" font-size="92">${style.icon}</text>
      <text x="50%" y="73%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="Segoe UI, Arial, sans-serif" font-size="24" font-weight="700">${safeLabel}</text>
      <text x="50%" y="85%" dominant-baseline="middle" text-anchor="middle" fill="rgba(255,255,255,0.88)" font-family="Segoe UI, Arial, sans-serif" font-size="15">Carol Mix • Espaço para foto real</text>
    </svg>
  `.trim();
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

function resolveProductImage(product) {
  if (product && product.image_url) {
    if (product.image_url.startsWith("http://") || product.image_url.startsWith("https://")) {
      return product.image_url;
    }
    return API_BASE_URL + product.image_url;
  }
  return getCategoryPlaceholder(product?.category_slug, product?.name);
}

function showToast(message, type = "primary") {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const id = "toast-" + Date.now() + Math.floor(Math.random() * 1000);
  const bgMap = {
    primary: "text-bg-primary",
    success: "text-bg-success",
    warning: "text-bg-warning",
    danger: "text-bg-danger",
    info: "text-bg-info",
  };
  const cls = bgMap[type] || "text-bg-primary";
  const html = `
    <div id="${id}" class="toast align-items-center ${cls} border-0 shadow" role="alert">
      <div class="d-flex">
        <div class="toast-body fw-semibold">${escapeHtml(message)}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    </div>
  `;
  container.insertAdjacentHTML("beforeend", html);
  const el = document.getElementById(id);
  const toast = new bootstrap.Toast(el, { delay: 4000 });
  toast.show();
  el.addEventListener("hidden.bs.toast", () => el.remove());
}

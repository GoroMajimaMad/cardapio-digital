let jwtToken = localStorage.getItem("carol_mix_jwt") || "";
let currentAdmin = null;
let adminSocket = null;
let soundEnabled = true;

let ordersList = [];
let activeStatusFilter = "";
let categoriesCache = [];
let productsCache = [];
let addonsCache = [];

const productFormModal = new bootstrap.Modal(document.getElementById("productFormModal"));
const historyModal = new bootstrap.Modal(document.getElementById("historyModal"));

// INICIALIZAÇÃO E AUTENTICAÇÃO
document.addEventListener("DOMContentLoaded", async () => {
  bindAdminEvents();
  if (jwtToken) {
    const valid = await verifySession();
    if (valid) {
      enterDashboard();
      return;
    }
  }
  showLoginScreen();
});

function showLoginScreen() {
  document.getElementById("loginSection").classList.remove("d-none");
  document.getElementById("dashboardSection").classList.add("d-none");
  if (adminSocket) {
    adminSocket.disconnect();
    adminSocket = null;
  }
}

async function enterDashboard() {
  document.getElementById("loginSection").classList.add("d-none");
  document.getElementById("dashboardSection").classList.remove("d-none");
  document.getElementById("adminUserName").textContent = currentAdmin ? `Olá, ${currentAdmin.name}` : "";

  initAdminWebSocket();
  await Promise.all([loadOrders(), loadCategories(), loadProducts(), loadAddons()]);
}

function authHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${jwtToken}`,
    ...extra,
  };
}

async function apiFetchAuth(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: authHeaders(options.headers || {}),
  });
  if (res.status === 401) {
    logout("Sessão expirada. Faça login novamente.");
    throw new Error("Unauthorized");
  }
  return res;
}

async function verifySession() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: authHeaders(),
    });
    if (!res.ok) return false;
    const data = await res.json();
    currentAdmin = data.admin;
    return true;
  } catch {
    return false;
  }
}

function logout(message = "") {
  jwtToken = "";
  currentAdmin = null;
  localStorage.removeItem("carol_mix_jwt");
  showLoginScreen();
  if (message) showToast(message, "warning");
}

function bindAdminEvents() {
  document.getElementById("loginForm").addEventListener("submit", handleLogin);
  document.getElementById("btnLogout").addEventListener("click", () => logout("Logout realizado."));
  document.getElementById("btnRefreshOrders").addEventListener("click", loadOrders);

  document.getElementById("btnToggleSound").addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    document.getElementById("soundIcon").className = soundEnabled
      ? "bi bi-volume-up-fill me-1"
      : "bi bi-volume-mute-fill me-1";
    document.getElementById("soundLabel").textContent = soundEnabled ? "Som Ativo" : "Som Mudo";
    if (soundEnabled) playNotificationBeep();
  });

  document.querySelectorAll("#statusFilterGroup button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#statusFilterGroup button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeStatusFilter = btn.dataset.status;
      renderOrders();
    });
  });

  document.getElementById("btnNewProduct").addEventListener("click", () => openProductModal(null));
  document.getElementById("productForm").addEventListener("submit", handleSaveProduct);
  document.getElementById("addonForm").addEventListener("submit", handleCreateAddon);
}

async function handleLogin(e) {
  e.preventDefault();
  const errorBox = document.getElementById("loginError");
  errorBox.classList.add("d-none");

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      errorBox.textContent = data.error || "Credenciais inválidas.";
      errorBox.classList.remove("d-none");
      return;
    }

    jwtToken = data.access_token;
    currentAdmin = data.admin;
    localStorage.setItem("carol_mix_jwt", jwtToken);
    document.getElementById("loginForm").reset();
    enterDashboard();
  } catch {
    errorBox.textContent = "Não foi possível conectar ao servidor backend.";
    errorBox.classList.remove("d-none");
  }
}

// WEBSOCKET E ALERTA
function initAdminWebSocket() {
  const dot = document.getElementById("adminWsDot");
  const text = document.getElementById("adminWsText");

  adminSocket = io(API_BASE_URL, {
    transports: ["websocket", "polling"],
  });

  adminSocket.on("connect", () => {
    dot.className = "ws-dot bg-success";
    text.textContent = "Tempo Real";
    adminSocket.emit("join_admin", { token: jwtToken });
  });

  adminSocket.on("disconnect", () => {
    dot.className = "ws-dot bg-danger";
    text.textContent = "Desconectado";
  });

  // Novo pedido recebido em tempo real
  adminSocket.on("new_order", (order) => {
    const exists = ordersList.some((o) => o.id === order.id);
    if (!exists) {
      order._isNew = true;
      ordersList.unshift(order);
      renderOrders();
      showToast(`🔔 Novo pedido ${order.order_number} de ${order.customer_name} (${order.table_or_pickup})!`, "warning");
      if (soundEnabled) playNotificationBeep();
    }
  });

  // Atualização de status
  adminSocket.on("order_status_updated", (updatedOrder) => {
    const idx = ordersList.findIndex((o) => o.id === updatedOrder.id);
    if (idx !== -1) {
      ordersList[idx] = updatedOrder;
      renderOrders();
    }
  });
}

// bip
function playNotificationBeep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
  } catch {
    // Navegador bloqueou áudio antes de interação do usuário
  }
}

// PEDIDOS
async function loadOrders() {
  try {
    const res = await apiFetchAuth(`${API_BASE_URL}/api/orders`);
    ordersList = await res.json();
    renderOrders();
  } catch (err) {
    console.error(err);
  }
}

function renderOrders() {
  const grid = document.getElementById("adminOrdersGrid");
  const pendingCount = ordersList.filter((o) => ["Recebido", "Em preparo"].includes(o.status)).length;
  document.getElementById("pendingOrdersCount").textContent = pendingCount;

  const filtered = activeStatusFilter
    ? ordersList.filter((o) => o.status === activeStatusFilter)
    : ordersList;

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-12 text-center py-5 text-muted">
        <i class="bi bi-inbox display-4"></i>
        <p class="mt-2">Nenhum pedido encontrado neste filtro.</p>
      </div>
    `;
    return;
  }

  const statuses = ["Recebido", "Em preparo", "Pronto", "Entregue", "Cancelado"];

  grid.innerHTML = filtered
    .map((o) => {
      const itemsHtml = (o.items || [])
        .map((it) => {
          const addons = (it.addons || []).map((a) => a.name).join(", ");
          return `
            <li class="mb-1">
              <span class="fw-bold">${it.quantity}x ${escapeHtml(it.product_name)}</span>
              ${it.selected_size ? `<span class="badge bg-light text-dark border ms-1">${escapeHtml(it.selected_size)}</span>` : ""}
              ${addons ? `<div class="small text-muted">+ ${escapeHtml(addons)}</div>` : ""}
              ${it.item_notes ? `<div class="small text-danger fst-italic">Obs: ${escapeHtml(it.item_notes)}</div>` : ""}
            </li>
          `;
        })
        .join("");

      const statusOptions = statuses
        .map((st) => `<option value="${st}" ${o.status === st ? "selected" : ""}>${st}</option>`)
        .join("");

      const flashClass = o._isNew ? "new-order-flash" : "";

      return `
        <div class="col-12 col-md-6 col-xl-4">
          <div class="card border-0 shadow-sm h-100 ${flashClass}">
            <div class="card-header bg-white d-flex justify-content-between align-items-center py-3">
              <div>
                <span class="fw-bold fs-5">${escapeHtml(o.order_number)}</span>
                <div class="small text-muted">${formatDateTime(o.created_at)}</div>
              </div>
              <span class="badge rounded-pill ${statusBadgeClass(o.status)} px-3 py-2">${escapeHtml(o.status)}</span>
            </div>
            <div class="card-body d-flex flex-column">
              <div class="mb-2">
                <i class="bi bi-person-fill text-primary me-1"></i><strong>${escapeHtml(o.customer_name)}</strong>
                <span class="badge bg-secondary-subtle text-dark ms-2">${escapeHtml(o.table_or_pickup)}</span>
              </div>
              ${o.notes ? `<div class="alert alert-light border py-1 px-2 small mb-2"><strong>Obs:</strong> ${escapeHtml(o.notes)}</div>` : ""}

              <ul class="list-unstyled small flex-grow-1 border-top border-bottom py-2 my-2">
                ${itemsHtml}
              </ul>

              <div class="d-flex justify-content-between align-items-center mb-3">
                <span class="fw-semibold text-muted">Total</span>
                <span class="fs-5 fw-bold text-primary">${formatBRL(o.total)}</span>
              </div>

              <div class="d-flex gap-2">
                <select class="form-select form-select-sm fw-semibold" onchange="changeOrderStatus(${o.id}, this.value)">
                  ${statusOptions}
                </select>
                <button class="btn btn-outline-secondary btn-sm text-nowrap" onclick="openOrderHistory(${o.id})">
                  <i class="bi bi-clock-history"></i> Histórico
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

window.changeOrderStatus = async function (orderId, newStatus) {
  try {
    const res = await apiFetchAuth(`${API_BASE_URL}/api/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Erro ao atualizar status.", "danger");
      return;
    }
    const idx = ordersList.findIndex((o) => o.id === orderId);
    if (idx !== -1) ordersList[idx] = data;
    renderOrders();
    showToast(`Status do pedido ${data.order_number} alterado para "${newStatus}".`, "success");
  } catch (err) {
    console.error(err);
  }
};

window.openOrderHistory = function (orderId) {
  const order = ordersList.find((o) => o.id === orderId);
  if (!order) return;

  document.getElementById("historyModalTitle").textContent = `Histórico • ${order.order_number}`;
  const history = order.history || [];

  document.getElementById("historyModalBody").innerHTML =
    history.length === 0
      ? '<p class="text-muted mb-0">Sem registros de histórico.</p>'
      : `<ul class="list-group list-group-flush">
          ${history
            .map(
              (h) => `
              <li class="list-group-item d-flex justify-content-between align-items-start px-0">
                <div>
                  <span class="badge ${statusBadgeClass(h.status)} me-2">${escapeHtml(h.status)}</span>
                  <div class="small text-muted mt-1">Por: ${escapeHtml(h.changed_by_name)}</div>
                </div>
                <small class="text-muted">${formatDateTime(h.changed_at)}</small>
              </li>
            `
            )
            .join("")}
        </ul>`;

  historyModal.show();
};

// GERENCIAR CARDÁPIO
async function loadCategories() {
  const res = await fetch(`${API_BASE_URL}/api/categories`);
  categoriesCache = await res.json();
  const select = document.getElementById("prodCategory");
  select.innerHTML = categoriesCache
    .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
    .join("");
}

async function loadProducts() {
  const res = await fetch(`${API_BASE_URL}/api/products`);
  productsCache = await res.json();
  renderAdminProducts();
}

function renderAdminProducts() {
  const tbody = document.getElementById("adminProductsTableBody");
  if (productsCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">Nenhum produto cadastrado.</td></tr>';
    return;
  }

  tbody.innerHTML = productsCache
    .map((p) => {
      const sizesCount = (p.sizes || []).length;
      return `
        <tr>
          <td style="width: 72px;">
            <img src="${resolveProductImage(p)}" alt="" class="rounded-3" style="width: 58px; height: 48px; object-fit: cover;" />
          </td>
          <td>
            <div class="fw-bold">${escapeHtml(p.name)}</div>
            <div class="small text-muted text-truncate" style="max-width: 280px;">${escapeHtml(p.short_description)}</div>
          </td>
          <td><span class="badge bg-secondary-subtle text-dark">${escapeHtml(p.category_name || "")}</span></td>
          <td class="fw-bold text-primary">${formatBRL(p.price)}</td>
          <td class="small">
            ${sizesCount > 0 ? `<span class="badge bg-info-subtle text-dark me-1">${sizesCount} tamanhos</span>` : '<span class="text-muted">Único</span>'}
            ${p.allow_addons ? '<span class="badge bg-success-subtle text-dark">Com adicionais</span>' : ""}
          </td>
          <td class="text-end text-nowrap">
            <button class="btn btn-sm btn-outline-primary me-1" onclick="editProduct(${p.id})">
              <i class="bi bi-pencil"></i> Editar
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteProduct(${p.id})">
              <i class="bi bi-trash"></i> Remover
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

window.editProduct = function (productId) {
  const p = productsCache.find((x) => x.id === productId);
  if (p) openProductModal(p);
};

function openProductModal(product) {
  document.getElementById("productForm").reset();
  document.getElementById("prodImageFile").value = "";

  if (product) {
    document.getElementById("productModalTitle").textContent = "Editar Produto";
    document.getElementById("prodId").value = product.id;
    document.getElementById("prodName").value = product.name;
    document.getElementById("prodCategory").value = product.category_id;
    document.getElementById("prodPrice").value = product.price;
    document.getElementById("prodShortDesc").value = product.short_description;
    document.getElementById("prodDesc").value = product.description;
    document.getElementById("prodIngredients").value = product.ingredients;
    document.getElementById("prodImageUrl").value = product.image_url || "";
    document.getElementById("prodAllowAddons").checked = Boolean(product.allow_addons);
    document.getElementById("prodSizesText").value = (product.sizes || [])
      .map((s) => `${s.label}=${s.extra_price}`)
      .join("\n");
  } else {
    document.getElementById("productModalTitle").textContent = "Novo Produto";
    document.getElementById("prodId").value = "";
    document.getElementById("prodAllowAddons").checked = true;
  }

  productFormModal.show();
}

function parseSizesText(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, extra] = line.split("=");
      return {
        label: (label || "").trim(),
        extra_price: parseFloat((extra || "0").replace(",", ".")) || 0,
      };
    })
    .filter((s) => s.label);
}

async function handleSaveProduct(e) {
  e.preventDefault();
  const btn = document.getElementById("btnSaveProduct");
  btn.disabled = true;

  try {
    let imageUrl = document.getElementById("prodImageUrl").value.trim();
    const fileInput = document.getElementById("prodImageFile");

    if (fileInput.files && fileInput.files[0]) {
      const formData = new FormData();
      formData.append("image", fileInput.files[0]);
      const upRes = await apiFetchAuth(`${API_BASE_URL}/api/upload`, {
        method: "POST",
        body: formData,
      });
      const upData = await upRes.json();
      if (!upRes.ok) {
        showToast(upData.error || "Erro ao enviar imagem.", "danger");
        return;
      }
      imageUrl = upData.image_url;
    }

    const payload = {
      name: document.getElementById("prodName").value.trim(),
      category_id: parseInt(document.getElementById("prodCategory").value, 10),
      price: parseFloat(document.getElementById("prodPrice").value),
      short_description: document.getElementById("prodShortDesc").value.trim(),
      description: document.getElementById("prodDesc").value.trim(),
      ingredients: document.getElementById("prodIngredients").value.trim(),
      allow_addons: document.getElementById("prodAllowAddons").checked,
      sizes: parseSizesText(document.getElementById("prodSizesText").value),
      image_url: imageUrl,
    };

    const prodId = document.getElementById("prodId").value;
    const url = prodId ? `${API_BASE_URL}/api/products/${prodId}` : `${API_BASE_URL}/api/products`;
    const method = prodId ? "PUT" : "POST";

    const res = await apiFetchAuth(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || "Erro ao salvar produto.", "danger");
      return;
    }

    productFormModal.hide();
    await loadProducts();
    showToast(prodId ? "Produto atualizado com sucesso!" : "Produto cadastrado com sucesso!", "success");
  } catch (err) {
    console.error(err);
  } finally {
    btn.disabled = false;
  }
}

window.deleteProduct = async function (productId) {
  const prod = productsCache.find((x) => x.id === productId);
  const label = prod ? prod.name : `#${productId}`;
  if (!confirm(`Deseja remover "${label}" do cardápio? (O histórico de pedidos anteriores será preservado.)`)) {
    return;
  }
  try {
    const res = await apiFetchAuth(`${API_BASE_URL}/api/products/${productId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await loadProducts();
      showToast("Produto removido do cardápio.", "info");
    }
  } catch (err) {
    console.error(err);
  }
};

// ADICIONAIS
async function loadAddons() {
  const res = await fetch(`${API_BASE_URL}/api/addons`);
  addonsCache = await res.json();
  const tbody = document.getElementById("adminAddonsTableBody");
  if (addonsCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-muted">Nenhum adicional cadastrado.</td></tr>';
    return;
  }
  tbody.innerHTML = addonsCache
    .map(
      (a) => `
      <tr>
        <td class="fw-semibold">${escapeHtml(a.name)}</td>
        <td class="text-primary fw-bold">+${formatBRL(a.price)}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-danger" onclick="deleteAddon(${a.id})">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>
    `
    )
    .join("");
}

async function handleCreateAddon(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById("addonName").value.trim(),
    price: parseFloat(document.getElementById("addonPrice").value),
  };
  try {
    const res = await apiFetchAuth(`${API_BASE_URL}/api/addons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      document.getElementById("addonForm").reset();
      await loadAddons();
      showToast("Adicional cadastrado!", "success");
    }
  } catch (err) {
    console.error(err);
  }
}

window.deleteAddon = async function (addonId) {
  if (!confirm("Remover este adicional?")) return;
  try {
    const res = await apiFetchAuth(`${API_BASE_URL}/api/addons/${addonId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await loadAddons();
      showToast("Adicional removido.", "info");
    }
  } catch (err) {
    console.error(err);
  }
};

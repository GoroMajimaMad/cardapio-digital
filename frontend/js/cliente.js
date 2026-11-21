let allCategories = [];
let allProducts = [];
let allAddons = [];
let activeCategoryId = "all";
let currentDetailProduct = null;
let selectedSizeObj = null;
let selectedAddonIds = new Set();

let cart = JSON.parse(localStorage.getItem("carol_mix_cart") || "[]");
let trackedOrderIds = JSON.parse(localStorage.getItem("carol_mix_orders") || "[]");
let trackedOrdersMap = {};
let socket = null;

const productDetailModal = new bootstrap.Modal(document.getElementById("productDetailModal"));
const orderConfirmationModal = new bootstrap.Modal(document.getElementById("orderConfirmationModal"));
const myOrdersModal = new bootstrap.Modal(document.getElementById("myOrdersModal"));

// INICIALIZAÇÃO E WEBSOCKET
document.addEventListener("DOMContentLoaded", async () => {
  initWebSocket();
  bindEvents();
  await loadMenuData();
  renderCart();
  await loadTrackedOrders();
});

function initWebSocket() {
  const wsDot = document.getElementById("wsDot");
  const wsText = document.getElementById("wsText");

  socket = io(API_BASE_URL, {
    transports: ["websocket", "polling"],
  });

  socket.on("connect", () => {
    wsDot.className = "ws-dot bg-success";
    wsText.textContent = "Tempo Real";
    trackedOrderIds.forEach((id) => socket.emit("join_order", { order_id: id }));
  });

  socket.on("disconnect", () => {
    wsDot.className = "ws-dot bg-danger";
    wsText.textContent = "Reconectando...";
  });

  // Atualização em tempo real do status de um pedido 
  socket.on("order_status_updated", (order) => {
    if (!trackedOrderIds.includes(order.id)) return;
    trackedOrdersMap[order.id] = order;
    renderMyOrders();
    showToast(`Pedido ${order.order_number} atualizado para: ${order.status}`, "info");
  });

  // Atualização automática do cardápio quando o admin altera algo
  socket.on("menu_updated", async () => {
    await loadMenuData(true);
  });
}

function bindEvents() {
  document.getElementById("searchInput").addEventListener("input", renderProducts);

  document.getElementById("btnDetailQtyMinus").addEventListener("click", () => {
    const el = document.getElementById("detailQty");
    const val = Math.max(1, parseInt(el.value, 10) - 1);
    el.value = val;
    updateDetailTotal();
  });

  document.getElementById("btnDetailQtyPlus").addEventListener("click", () => {
    const el = document.getElementById("detailQty");
    el.value = parseInt(el.value, 10) + 1;
    updateDetailTotal();
  });

  document.getElementById("btnAddToCart").addEventListener("click", addCurrentDetailToCart);
  document.getElementById("checkoutForm").addEventListener("submit", submitOrder);

  document.getElementById("btnTrackConfirmedOrder").addEventListener("click", () => {
    orderConfirmationModal.hide();
    myOrdersModal.show();
  });

  document.getElementById("btnOpenMyOrders").addEventListener("click", loadTrackedOrders);

  document.getElementById("btnLookupOrder").addEventListener("click", async () => {
    const raw = document.getElementById("lookupOrderIdInput").value.trim();
    const id = parseInt(raw, 10);
    if (!id) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/orders/${id}`);
      if (!res.ok) {
        showToast("Pedido não encontrado.", "warning");
        return;
      }
      const order = await res.json();
      trackOrder(order);
      document.getElementById("lookupOrderIdInput").value = "";
      showToast(`Acompanhando pedido ${order.order_number}!`, "success");
    } catch {
      showToast("Erro ao consultar pedido.", "danger");
    }
  });
}

// CARREGAMENTO DO CARDÁPIO
async function loadMenuData(silent = false) {
  const loader = document.getElementById("menuLoader");
  if (!silent) loader.classList.remove("d-none");

  try {
    const [catRes, prodRes, addonRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/categories`),
      fetch(`${API_BASE_URL}/api/products`),
      fetch(`${API_BASE_URL}/api/addons`),
    ]);

    allCategories = await catRes.json();
    allProducts = await prodRes.json();
    allAddons = await addonRes.json();

    renderCategoryTabs();
    renderProducts();
  } catch (err) {
    console.error(err);
    document.getElementById("productsGrid").innerHTML = `
      <div class="col-12">
        <div class="alert alert-danger">
          <i class="bi bi-exclamation-triangle me-2"></i>
          Não foi possível conectar à API (${API_BASE_URL}). Verifique se o servidor Flask está rodando.
        </div>
      </div>
    `;
  } finally {
    loader.classList.add("d-none");
  }
}

function renderCategoryTabs() {
  const container = document.getElementById("categoryTabs");
  let html = `
    <button class="category-pill ${activeCategoryId === "all" ? "active" : ""}" data-category="all">
      <i class="bi bi-grid-fill me-1"></i> Todos
    </button>
  `;
  allCategories.forEach((cat) => {
    const isActive = String(activeCategoryId) === String(cat.id) ? "active" : "";
    html += `
      <button class="category-pill ${isActive}" data-category="${cat.id}">
        <i class="bi ${escapeHtml(cat.icon || "bi-star")} me-1"></i> ${escapeHtml(cat.name)}
      </button>
    `;
  });
  container.innerHTML = html;

  container.querySelectorAll(".category-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeCategoryId = btn.dataset.category;
      container.querySelectorAll(".category-pill").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderProducts();
    });
  });
}

function renderProducts() {
  const grid = document.getElementById("productsGrid");
  const emptyState = document.getElementById("emptyMenuState");
  const search = document.getElementById("searchInput").value.trim().toLowerCase();

  const filtered = allProducts.filter((p) => {
    const matchCat = activeCategoryId === "all" || String(p.category_id) === String(activeCategoryId);
    const matchSearch =
      !search ||
      p.name.toLowerCase().includes(search) ||
      p.short_description.toLowerCase().includes(search) ||
      p.ingredients.toLowerCase().includes(search);
    return matchCat && matchSearch;
  });

  if (filtered.length === 0) {
    grid.innerHTML = "";
    emptyState.classList.remove("d-none");
    return;
  }

  emptyState.classList.add("d-none");
  grid.innerHTML = filtered
    .map((p) => {
      const imgSrc = resolveProductImage(p);
      const hasSizes = p.sizes && p.sizes.length > 0;
      return `
        <div class="col-12 col-sm-6 col-lg-4">
          <div class="card product-card h-100 shadow-sm" onclick="openProductDetail(${p.id})">
            <div class="product-img-wrapper">
              <img src="${imgSrc}" alt="${escapeHtml(p.name)}" loading="lazy" />
              <span class="badge bg-dark bg-opacity-75 position-absolute top-0 start-0 m-2">
                ${escapeHtml(p.category_name || "")}
              </span>
            </div>
            <div class="card-body d-flex flex-column">
              <h5 class="card-title fw-bold mb-1">${escapeHtml(p.name)}</h5>
              <p class="card-text text-muted small flex-grow-1 mb-3">${escapeHtml(p.short_description)}</p>
              <div class="d-flex justify-content-between align-items-center pt-2 border-top">
                <div>
                  ${hasSizes ? '<small class="text-muted d-block" style="font-size:0.72rem;">A partir de</small>' : ""}
                  <span class="price-tag">${formatBRL(p.price)}</span>
                </div>
                <button class="btn btn-cm-primary btn-sm rounded-pill px-3" type="button">
                  <i class="bi bi-plus-lg me-1"></i> Detalhes
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

// DETALHES DO PRODUTO
window.openProductDetail = function (productId) {
  const product = allProducts.find((p) => p.id === productId);
  if (!product) return;

  currentDetailProduct = product;
  selectedAddonIds = new Set();
  selectedSizeObj = product.sizes && product.sizes.length > 0 ? product.sizes[0] : null;

  document.getElementById("detailCategory").textContent = product.category_name || "";
  document.getElementById("detailName").textContent = product.name;
  document.getElementById("detailBasePrice").textContent = formatBRL(product.price);
  document.getElementById("detailDescription").textContent = product.description;
  document.getElementById("detailIngredients").textContent = product.ingredients;
  document.getElementById("detailImage").src = resolveProductImage(product);
  document.getElementById("detailItemNotes").value = "";
  document.getElementById("detailQty").value = "1";

  // Tamanhos
  const sizesSection = document.getElementById("detailSizesSection");
  const sizesList = document.getElementById("detailSizesList");
  if (product.sizes && product.sizes.length > 0) {
    sizesSection.classList.remove("d-none");
    sizesList.innerHTML = product.sizes
      .map(
        (s, idx) => `
        <input type="radio" class="btn-check" name="productSizeRadio" id="sizeOpt${idx}" value="${idx}" ${idx === 0 ? "checked" : ""}>
        <label class="btn btn-outline-primary btn-sm rounded-pill" for="sizeOpt${idx}">
          ${escapeHtml(s.label)} ${s.extra_price > 0 ? `(+${formatBRL(s.extra_price)})` : ""}
        </label>
      `
      )
      .join("");
    sizesList.querySelectorAll("input[name='productSizeRadio']").forEach((radio) => {
      radio.addEventListener("change", (e) => {
        selectedSizeObj = product.sizes[parseInt(e.target.value, 10)];
        updateDetailTotal();
      });
    });
  } else {
    sizesSection.classList.add("d-none");
    sizesList.innerHTML = "";
  }

  // Adicionais
  const addonsSection = document.getElementById("detailAddonsSection");
  const addonsList = document.getElementById("detailAddonsList");
  if (product.allow_addons && allAddons.length > 0) {
    addonsSection.classList.remove("d-none");
    addonsList.innerHTML = allAddons
      .map(
        (a) => `
        <div class="col-6">
          <div class="form-check border rounded-3 p-2 ps-4 bg-white">
            <input class="form-check-input addon-checkbox" type="checkbox" value="${a.id}" id="addonChk${a.id}">
            <label class="form-check-label small w-100 d-flex justify-content-between" for="addonChk${a.id}" style="cursor:pointer;">
              <span>${escapeHtml(a.name)}</span>
              <span class="fw-semibold text-primary">+${formatBRL(a.price)}</span>
            </label>
          </div>
        </div>
      `
      )
      .join("");
    addonsList.querySelectorAll(".addon-checkbox").forEach((chk) => {
      chk.addEventListener("change", (e) => {
        const id = parseInt(e.target.value, 10);
        if (e.target.checked) selectedAddonIds.add(id);
        else selectedAddonIds.delete(id);
        updateDetailTotal();
      });
    });
  } else {
    addonsSection.classList.add("d-none");
    addonsList.innerHTML = "";
  }

  updateDetailTotal();
  productDetailModal.show();
};

function computeDetailUnitPrice() {
  if (!currentDetailProduct) return 0;
  let price = Number(currentDetailProduct.price);
  if (selectedSizeObj) price += Number(selectedSizeObj.extra_price || 0);
  selectedAddonIds.forEach((id) => {
    const addon = allAddons.find((a) => a.id === id);
    if (addon) price += Number(addon.price);
  });
  return price;
}

function updateDetailTotal() {
  const qty = parseInt(document.getElementById("detailQty").value, 10) || 1;
  const total = computeDetailUnitPrice() * qty;
  document.getElementById("detailComputedTotal").textContent = formatBRL(total);
}

// CARRINHO
function addCurrentDetailToCart() {
  if (!currentDetailProduct) return;
  const qty = parseInt(document.getElementById("detailQty").value, 10) || 1;
  const itemNotes = document.getElementById("detailItemNotes").value.trim();
  const chosenAddons = Array.from(selectedAddonIds)
    .sort((a, b) => a - b)
    .map((id) => allAddons.find((a) => a.id === id))
    .filter(Boolean);

  const selectedSize = selectedSizeObj ? selectedSizeObj.label : "";
  const unitPrice = computeDetailUnitPrice();

  const key = JSON.stringify({
    pid: currentDetailProduct.id,
    size: selectedSize,
    addons: chosenAddons.map((a) => a.id),
    notes: itemNotes,
  });

  const existing = cart.find((item) => item.key === key);
  if (existing) {
    existing.quantity += qty;
  } else {
    cart.push({
      key,
      product_id: currentDetailProduct.id,
      product_name: currentDetailProduct.name,
      selected_size: selectedSize,
      addons: chosenAddons,
      addon_ids: chosenAddons.map((a) => a.id),
      item_notes: itemNotes,
      quantity: qty,
      unit_price: unitPrice,
    });
  }

  saveCart();
  renderCart();
  productDetailModal.hide();
  showToast(`${currentDetailProduct.name} adicionado ao pedido!`, "success");
}

function saveCart() {
  localStorage.setItem("carol_mix_cart", JSON.stringify(cart));
}

window.updateCartQty = function (index, delta) {
  if (!cart[index]) return;
  cart[index].quantity += delta;
  if (cart[index].quantity <= 0) {
    cart.splice(index, 1);
  }
  saveCart();
  renderCart();
};

window.removeCartItem = function (index) {
  cart.splice(index, 1);
  saveCart();
  renderCart();
};

function renderCart() {
  const list = document.getElementById("cartItemsList");
  const checkoutSection = document.getElementById("cartCheckoutSection");
  const totalCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const totalValue = cart.reduce((acc, item) => acc + item.unit_price * item.quantity, 0);

  document.getElementById("navCartCount").textContent = totalCount;
  document.getElementById("fabCartCount").textContent = totalCount;
  document.getElementById("cartTotalValue").textContent = formatBRL(totalValue);

  if (cart.length === 0) {
    checkoutSection.classList.add("d-none");
    list.innerHTML = `
      <div class="text-center py-5 text-muted">
        <i class="bi bi-cart-x display-4"></i>
        <p class="mt-2 mb-0">Seu carrinho está vazio.</p>
        <small>Escolha um sorvete, açaí ou Copo da Felicidade no cardápio!</small>
      </div>
    `;
    return;
  }

  checkoutSection.classList.remove("d-none");
  list.innerHTML = cart
    .map((item, idx) => {
      const addonsText =
        item.addons && item.addons.length > 0
          ? `<div class="small text-muted">+ ${item.addons.map((a) => escapeHtml(a.name)).join(", ")}</div>`
          : "";
      const sizeText = item.selected_size
        ? `<span class="badge bg-light text-dark border me-1">${escapeHtml(item.selected_size)}</span>`
        : "";
      const notesText = item.item_notes
        ? `<div class="small fst-italic text-secondary">Obs: ${escapeHtml(item.item_notes)}</div>`
        : "";

      return `
        <div class="card mb-2 border-0 shadow-sm">
          <div class="card-body p-3">
            <div class="d-flex justify-content-between align-items-start gap-2">
              <div>
                <div class="fw-bold">${escapeHtml(item.product_name)}</div>
                <div class="mt-1">${sizeText}</div>
                ${addonsText}
                ${notesText}
              </div>
              <button class="btn btn-sm btn-outline-danger border-0" onclick="removeCartItem(${idx})" title="Remover">
                <i class="bi bi-trash"></i>
              </button>
            </div>
            <div class="d-flex justify-content-between align-items-center mt-2 pt-2 border-top">
              <div class="input-group input-group-sm" style="width: 105px;">
                <button class="btn btn-outline-secondary" onclick="updateCartQty(${idx}, -1)">-</button>
                <span class="form-control text-center fw-bold">${item.quantity}</span>
                <button class="btn btn-outline-secondary" onclick="updateCartQty(${idx}, 1)">+</button>
              </div>
              <div class="text-end">
                <small class="text-muted d-block">${formatBRL(item.unit_price)} un.</small>
                <span class="fw-bold text-primary">${formatBRL(item.unit_price * item.quantity)}</span>
              </div>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

async function submitOrder(e) {
  e.preventDefault();
  if (cart.length === 0) return;

  const btn = document.getElementById("btnSubmitOrder");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Enviando pedido...';

  const payload = {
    customer_name: document.getElementById("customerName").value.trim(),
    table_or_pickup: document.getElementById("tableOrPickup").value.trim(),
    notes: document.getElementById("orderNotes").value.trim(),
    items: cart.map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
      selected_size: item.selected_size,
      addon_ids: item.addon_ids,
      item_notes: item.item_notes,
    })),
  };

  try {
    const res = await fetch(`${API_BASE_URL}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || "Erro ao enviar pedido.", "danger");
      return;
    }

    cart = [];
    saveCart();
    renderCart();
    document.getElementById("checkoutForm").reset();

    const offcanvasEl = document.getElementById("cartOffcanvas");
    const offcanvasInstance = bootstrap.Offcanvas.getInstance(offcanvasEl);
    if (offcanvasInstance) offcanvasInstance.hide();

    trackOrder(data);

    document.getElementById("confirmOrderNumber").textContent = data.order_number;
    document.getElementById("confirmOrderDetails").textContent =
      `${data.customer_name} • ${data.table_or_pickup} • Total ${formatBRL(data.total)}`;
    orderConfirmationModal.show();
  } catch (err) {
    console.error(err);
    showToast("Falha de conexão com o servidor.", "danger");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-send-check me-1"></i> Confirmar e Enviar Pedido';
  }
}

// MEUS PEDIDOS
function trackOrder(order) {
  if (!trackedOrderIds.includes(order.id)) {
    trackedOrderIds.unshift(order.id);
    localStorage.setItem("carol_mix_orders", JSON.stringify(trackedOrderIds.slice(0, 15)));
  }
  trackedOrdersMap[order.id] = order;
  if (socket && socket.connected) {
    socket.emit("join_order", { order_id: order.id });
  }
  renderMyOrders();
}

async function loadTrackedOrders() {
  if (trackedOrderIds.length === 0) {
    renderMyOrders();
    return;
  }

  const validIds = [];
  for (const id of trackedOrderIds) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/orders/${id}`);
      if (res.ok) {
        const order = await res.json();
        trackedOrdersMap[order.id] = order;
        validIds.push(id);
        if (socket && socket.connected) {
          socket.emit("join_order", { order_id: id });
        }
      }
    } catch {
      // ignora erro temporário
    }
  }
  trackedOrderIds = validIds;
  localStorage.setItem("carol_mix_orders", JSON.stringify(trackedOrderIds));
  renderMyOrders();
}

function renderOrderStepper(status) {
  if (status === "Cancelado") {
    return `<div class="alert alert-danger py-2 px-3 small mb-2"><i class="bi bi-x-circle me-1"></i> Este pedido foi cancelado pelo estabelecimento.</div>`;
  }
  const steps = ["Recebido", "Em preparo", "Pronto", "Entregue"];
  const currentIndex = steps.indexOf(status);

  return `
    <div class="order-stepper">
      ${steps
        .map((step, idx) => {
          let cls = "";
          if (idx < currentIndex) cls = "completed";
          else if (idx === currentIndex) cls = "current";
          return `
            <div class="step-item ${cls}">
              <div class="step-dot">${idx < currentIndex ? '<i class="bi bi-check-lg"></i>' : idx + 1}</div>
              <div class="small fw-semibold" style="font-size:0.75rem;">${step}</div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderMyOrders() {
  const container = document.getElementById("myOrdersList");
  const badge = document.getElementById("myOrdersBadge");
  const orders = trackedOrderIds.map((id) => trackedOrdersMap[id]).filter(Boolean);

  const activeCount = orders.filter((o) => !["Entregue", "Cancelado"].includes(o.status)).length;
  if (activeCount > 0) {
    badge.textContent = activeCount;
    badge.classList.remove("d-none");
  } else {
    badge.classList.add("d-none");
  }

  if (orders.length === 0) {
    container.innerHTML = `
      <div class="text-center py-4 text-muted">
        <i class="bi bi-receipt fs-1"></i>
        <p class="mt-2 mb-0">Você ainda não realizou nenhum pedido neste dispositivo.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = orders
    .map((o) => {
      const itemsHtml = (o.items || [])
        .map((it) => {
          const addons = (it.addons || []).map((a) => a.name).join(", ");
          return `<li class="small">${it.quantity}x <strong>${escapeHtml(it.product_name)}</strong> ${
            it.selected_size ? `(${escapeHtml(it.selected_size)})` : ""
          } ${addons ? `• +${escapeHtml(addons)}` : ""} — ${formatBRL(it.subtotal)}</li>`;
        })
        .join("");

      return `
        <div class="card mb-3 border shadow-sm">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <div>
                <span class="fw-bold fs-5">${escapeHtml(o.order_number)}</span>
                <small class="text-muted ms-2">${formatDateTime(o.created_at)}</small>
              </div>
              <span class="badge rounded-pill ${statusBadgeClass(o.status)} px-3 py-2">${escapeHtml(o.status)}</span>
            </div>
            <div class="small text-muted mb-2">
              <i class="bi bi-person me-1"></i>${escapeHtml(o.customer_name)} •
              <i class="bi bi-geo-alt me-1"></i>${escapeHtml(o.table_or_pickup)}
            </div>
            ${renderOrderStepper(o.status)}
            <ul class="mb-2 mt-3 ps-3">${itemsHtml}</ul>
            <div class="text-end fw-bold text-primary border-top pt-2">Total: ${formatBRL(o.total)}</div>
          </div>
        </div>
      `;
    })
    .join("");
}

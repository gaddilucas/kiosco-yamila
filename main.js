(function () {
  // ==========================================
  // 1. CONFIGURACIÓN Y UTILIDADES
  // ==========================================
  const SUPABASE_URL = "https://ykjwzapdioyfpevxzzqy.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlrand6YXBkaW95ZnBldnh6enF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1OTA1OTIsImV4cCI6MjEwNzE2NjU5Mn0.KeHBe4Vev_QEW7sXQEdKv4kIpnbWocpZMPRFX7ccx_k";
  const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const PAY = { efectivo: "Efectivo", transferencia: "Transferencia", modo: "MODO", tarjeta: "Tarjeta", otro: "Otro", cuenta_corriente: "Cuenta corriente" };
  const $ = (id) => document.getElementById(id);
  const asNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const fmt = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-AR");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const todayKey = () => new Date().toLocaleDateString("sv-SE");
  const uid = () => Math.random().toString(36).slice(2, 10);
  const formatWeight = (n) => String(Number(n)).replace(/\.0+$/, "");

  // ESTADO GLOBAL
  let data = { products: [], sales: [], expenses: [] };
  let cart = {};
  let summaryRange = { from: todayKey(), to: todayKey() };

  function normalizeProduct(p) {
    const isWeight = Boolean(p.is_weight || p.stock === null || p.stock === undefined);
    return {
      id: p.id,
      name: String(p.name || "").trim(),
      price: asNumber(p.price, 0),
      cost: asNumber(p.cost, 0),
      stock: isWeight ? null : Math.max(0, asNumber(p.stock, 0)),
      min: Math.max(0, asNumber(p.min_stock, 3)),
      isWeight
    };
  }

  function getProductById(id) {
    return data.products.find((x) => x.id === id);
  }

  function safeQty(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function getRangeFromInputs() {
    const from = $("summary-from")?.value || todayKey();
    const to = $("summary-to")?.value || todayKey();
    return { from, to };
  }

  function setRangeInputs(range) {
    if (!$("summary-from") || !$("summary-to")) return;
    $("summary-from").value = range.from || todayKey();
    $("summary-to").value = range.to || todayKey();
  }

  function inDateRange(dateValue, from, to) {
    if (!dateValue) return false;
    if (!from && !to) return true;
    if (from && dateValue < from) return false;
    if (to && dateValue > to) return false;
    return true;
  }

  function getFilteredSummarySales() {
    const { from, to } = summaryRange;
    return data.sales.filter((s) => inDateRange(s.date, from, to));
  }

  function getFilteredSummaryExpenses() {
    const { from, to } = summaryRange;
    return data.expenses.filter((e) => inDateRange(e.date, from, to));
  }

  function renderSummary() {
    const sales = getFilteredSummarySales();
    const exps = getFilteredSummaryExpenses();
    const total = sales.reduce((a, s) => a + s.total, 0);
    const profit = sales.reduce((a, s) => a + s.profit, 0);
    const expTotal = exps.reduce((a, e) => a + e.amount, 0);

    $("s-sales").textContent = fmt(total);
    $("s-count").textContent = sales.length;
    $("s-profit").textContent = fmt(profit);
    $("s-exp").textContent = fmt(expTotal);
    $("s-net").textContent = fmt(profit - expTotal);

    const byPay = {};
    sales.forEach((s) => { byPay[s.pay] = (byPay[s.pay] || 0) + s.total; });
    $("pay-body").innerHTML = Object.keys(PAY).filter((k) => byPay[k]).map((k) =>
      `<tr><td>${PAY[k]}</td><td class="num">${fmt(byPay[k])}</td></tr>`).join("")
      || `<tr><td class="muted">Sin ventas en el rango.</td></tr>`;

    const byAccount = {};
    sales.filter((s) => s.pay === "cuenta_corriente").forEach((s) => {
      const accountName = s.account || "Sin cuenta";
      byAccount[accountName] = (byAccount[accountName] || 0) + s.total;
    });
    $("account-body").innerHTML = Object.keys(byAccount).map((name) =>
      `<tr><td>${esc(name)}</td><td class="num">${fmt(byAccount[name])}</td></tr>`).join("")
      || `<tr><td class="muted">Sin cuentas corrientes.</td></tr>`;

    const low = data.products.filter((p) => !p.isWeight && p.stock <= p.min);
    $("low-list").innerHTML = low.length
      ? low.map((p) => `${esc(p.name)} (${p.stock})`).join(" · ")
      : "Todo en orden.";

    $("sales-body").innerHTML = [...data.sales].reverse().slice(0, 20).map((s) => {
      const d = new Date(s.at);
      const hora = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
      const items = (s.items || []).map((i) => `${i.qty} ${i.name}`).join(", ");
      const payText = s.pay === "cuenta_corriente" ? `${PAY[s.pay]} · ${esc(s.account || "Sin cuenta")}` : PAY[s.pay];
      return `<tr><td>${s.date.slice(5)} ${hora}</td><td>${items}</td><td>${payText}</td><td class="num">${fmt(s.total)}</td></tr>`;
    }).join("") || `<tr><td class="muted">Sin ventas todavía.</td></tr>`;
  }

  function applySummaryFilter() {
    summaryRange = getRangeFromInputs();
    renderSummary();
  }

  function exportCsv() {
    const sales = getFilteredSummarySales();
    const exps = getFilteredSummaryExpenses();

    const rows = [
      ["tipo", "fecha", "descripcion", "monto", "medio_pago"],
      ...sales.map((s) => ["venta", s.date, (s.items || []).map((i) => `${i.qty} ${i.name}`).join(" | "), String(s.total), s.pay]),
      ...exps.map((e) => ["gasto", e.date, e.desc, String(e.amount), "-"])
    ];

    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resumen-${summaryRange.from || "inicio"}-to-${summaryRange.to || "fin"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ==========================================
  // 2. CONEXIÓN A BASE DE DATOS (FETCH)
  // ==========================================
  async function loadData() {
    try {
      const [resProd, resSales, resExp] = await Promise.all([
        _supabase.from('products').select('*'),
        _supabase.from('sales').select('*'),
        _supabase.from('expenses').select('*')
      ]);

      if (resProd.error) throw resProd.error;
      if (resSales.error) throw resSales.error;
      if (resExp.error) throw resExp.error;

      data.products = (resProd.data || []).map(normalizeProduct);

      data.sales = (resSales.data || []).map(s => ({
        id: s.id, at: s.created_at, date: s.date,
        items: s.items, total: Number(s.total), profit: Number(s.profit), pay: s.pay, account: s.account || null
      }));

      data.expenses = (resExp.data || []).map(e => ({
        id: e.id, date: e.date, desc: e.description, amount: Number(e.amount)
      }));

      renderAll();
    } catch (e) {
      console.error("Error al conectar con Supabase:", e);
    }
  }

  // ==========================================
  // 3. RENDERIZADO DE INTERFAZ (UI)
  // ==========================================
  function renderAll() {
    renderProducts();
    renderCart();
    renderStock();
    renderExpenses();
    renderSummary();
  }

  function renderProducts() {
    const query = ($("search-vender").value || "").trim().toLowerCase();
    const filtered = data.products.filter(p => p.name.toLowerCase().includes(query));

    $("product-grid").innerHTML = filtered.map((p) => {
      const out = !p.isWeight && p.stock <= 0;
      const subLabel = p.isWeight 
        ? `<span class="stock">Al peso (x Kg)</span>` 
        : `<span class="stock ${p.stock <= p.min ? "low" : ""}">Stock: ${p.stock}</span>`;

      return `<button class="prod ${out ? "out" : ""}" data-id="${p.id}" ${out ? "disabled" : ""}>
        <span>${esc(p.name)}</span>
        <span class="price">${fmt(p.price)} ${p.isWeight ? '/ kg' : ''}</span>
        ${subLabel}
      </button>`;
    }).join("") || `<p class="muted">${data.products.length ? "No se encontraron productos." : "Cargá productos en la pestaña Stock."}</p>`;
  }

  function renderCart() {
    const lines = Object.entries(cart).filter(([, q]) => q > 0);
    $("cart").innerHTML = lines.length ? lines.map(([id, q]) => {
      const p = data.products.find((x) => x.id === id);
      if (!p) return "";
      
      const qtyText = p.isWeight ? `${q} kg` : `${q}`;
      
      return `<div class="cart-line">
        <span>${esc(p.name)} ${p.isWeight ? '<small class="muted">(x Kg)</small>' : ''}</span>
        <span class="qty">
          <button data-dec="${id}">−</button>
          <span>${qtyText}</span>
          <button data-inc="${id}">+</button>
          <span style="min-width:70px;text-align:right">${fmt(p.price * q)}</span>
        </span></div>`;
    }).join("") : `<p class="muted">Carrito vacío.</p>`;
    
    $("cart-total").textContent = fmt(cartTotal());
    $("charge").disabled = !lines.length;
  }

  function renderStock() {
    const query = ($("search-stock").value || "").trim().toLowerCase();
    const filtered = data.products.filter(p => p.name.toLowerCase().includes(query));

    $("stock-body").innerHTML = filtered.map((p) => {
      const stockCol = p.isWeight 
        ? `<span class="muted">Al peso</span>`
        : `<button data-minus="${p.id}">−</button> ${p.stock} <button data-plus="${p.id}">+</button>`;

      return `<tr>
        <td>${esc(p.name)}</td>
        <td class="num">${fmt(p.price)} ${p.isWeight ? '/ kg' : ''}</td>
        <td class="num">${fmt(p.cost)}</td>
        <td class="num ${!p.isWeight && p.stock <= p.min ? "low" : ""}">
          ${stockCol}
        </td>
        <td class="num"><button class="danger" data-del="${p.id}">✕</button></td>
      </tr>`;
    }).join("");
    
    $("stock-empty").textContent = data.products.length 
      ? (filtered.length ? "" : "No se encontraron productos.") 
      : "No hay productos todavía.";
  }

  function renderExpenses() {
    const rows = [...data.expenses].reverse();
    $("expense-body").innerHTML = rows.map((e) => `<tr>
      <td>${esc(e.date)}</td><td>${esc(e.desc)}</td>
      <td class="num">${fmt(e.amount)}</td>
      <td class="num"><button class="danger" data-edel="${e.id}">✕</button></td>
    </tr>`).join("") || `<tr><td class="muted">Sin gastos registrados.</td></tr>`;
  }

  // ==========================================
  // 4. LÓGICA DE NEGOCIO (ACCIONES)
  // ==========================================
  function cartTotal() {
    return Object.entries(cart).reduce((t, [id, quantity]) => {
      const p = getProductById(id);
      const q = safeQty(quantity);
      return t + (p ? p.price * q : 0);
    }, 0);
  }

  function getSelectedAccountName() {
    const pay = $("pay").value;
    if (pay !== "cuenta_corriente") return null;
    const account = $("account-select").value;
    return account || "Sin cuenta";
  }

  function updatePaySelection() {
    const isCuenta = $("pay").value === "cuenta_corriente";
    $("account-box").classList.toggle("hidden", !isCuenta);
    if (!isCuenta) {
      $("account-select").value = "";
    }
  }

  async function charge() {
    const saleItems = [];
    let total = 0;
    let profit = 0;

    if ($("pay").value === "cuenta_corriente" && !$("account-select").value) {
      alert("Seleccioná una cuenta corriente antes de cobrar.");
      return;
    }

    for (const [id, rawQty] of Object.entries(cart)) {
      const p = getProductById(id);
      const qty = safeQty(rawQty);
      if (!p || qty <= 0) continue;

      let finalQty = qty;
      if (!p.isWeight) {
        finalQty = Math.floor(qty);
        if (finalQty <= 0 || (p.stock || 0) < finalQty) {
          alert(`No hay stock suficiente para ${p.name}.`);
          return;
        }
      } else {
        finalQty = qty;
      }

      saleItems.push({
        productId: p.id,
        name: p.name,
        qty: p.isWeight ? `${formatWeight(finalQty)}kg` : `${finalQty}x`,
        price: p.price,
        unitQty: finalQty
      });

      total += p.price * finalQty;
      profit += (p.price - p.cost) * finalQty;
    }

    if (!saleItems.length) {
      alert("No hay productos válidos en el carrito.");
      return;
    }

    const saleRecord = {
      id: uid(),
      date: todayKey(),
      items: saleItems.map((i) => ({ name: i.name, qty: i.qty, price: i.price })),
      total: Number(total.toFixed(2)),
      profit: Number(profit.toFixed(2)),
      pay: $("pay").value,
      account: getSelectedAccountName()
    };

    const resSale = await _supabase.from('sales').insert([saleRecord]);
    if (resSale.error) {
      alert("Error guardando venta.");
      return;
    }

    const stockUpdates = saleItems
      .filter((item) => {
        const p = getProductById(item.productId);
        return p && !p.isWeight;
      })
      .map((item) => {
        const p = getProductById(item.productId);
        const nextStock = Math.max(0, (p.stock || 0) - Math.floor(item.unitQty));
        return _supabase.from('products').update({ stock: nextStock }).eq('id', p.id);
      });

    if (stockUpdates.length) await Promise.all(stockUpdates);

    cart = {};
    loadData();
  }

  async function addProduct() {
    const name = $("p-name").value.trim();
    const price = parseFloat($("p-price").value);
    const type = $("p-type").value;
    const isWeight = type === "weight";

    if (!name || Number.isNaN(price) || price <= 0) {
      alert("Poné un nombre y un precio válido.");
      return;
    }

    const normalizedName = name.trim();
    const existing = data.products.find((p) => p.name.trim().toLowerCase() === normalizedName.toLowerCase());
    const stockValue = isWeight ? null : Math.max(0, parseInt($("p-stock").value, 10) || 0);
    const minValue = isWeight ? 0 : Math.max(0, parseInt($("p-min").value, 10) || 0);
    const costValue = Math.max(0, parseFloat($("p-cost").value) || 0);

    if (existing && existing.isWeight !== isWeight) {
      alert("Ya existe un producto con ese nombre y tiene un tipo distinto. Cambiá el nombre o borra el anterior.");
      return;
    }

    if (existing) {
      const { error } = await _supabase.from('products').update({
        name: normalizedName,
        price: price,
        cost: costValue,
        stock: stockValue,
        min_stock: minValue,
        is_weight: isWeight
      }).eq('id', existing.id);

      if (error) {
        alert("Error al actualizar el producto.");
        console.error(error);
        return;
      }
    } else {
      const newProd = {
        id: uid(),
        name: normalizedName,
        price: price,
        cost: costValue,
        stock: stockValue,
        min_stock: minValue,
        is_weight: isWeight
      };

      const { error } = await _supabase.from('products').insert([newProd]);
      if (error) {
        alert("Error al agregar producto.");
        console.error(error);
        return;
      }
    }

    ["p-name", "p-price", "p-cost", "p-stock", "p-min"].forEach((i) => ($(i).value = ""));
    $("p-type").value = "unit";
    $("box-stock").style.display = "block";
    $("box-min").style.display = "block";
    $("lbl-price").textContent = "Precio venta x Un.";
    $("lbl-cost").textContent = "Costo x Un.";
    loadData();
  }

  async function addExpense() {
    const desc = $("e-desc").value.trim();
    const amount = parseFloat($("e-amount").value);
    if (!desc || isNaN(amount)) { alert("Poné descripción y monto."); return; }

    const newExp = { id: uid(), date: todayKey(), description: desc, amount: amount };

    const { error } = await _supabase.from('expenses').insert([newExp]);
    if (error) return alert("Error al agregar gasto.");

    $("e-desc").value = ""; $("e-amount").value = "";
    loadData();
  }

  async function updateStock(id, newStock) {
    const { error } = await _supabase.from('products').update({ stock: newStock }).eq('id', id);
    if (!error) loadData();
  }

  // ==========================================
  // 5. EVENTOS DEL DOM (LISTENERS)
  // ==========================================
  // Cambio de tipo de producto en el formulario
  $("p-type").addEventListener("change", (e) => {
    const isW = e.target.value === "weight";
    $("box-stock").style.display = isW ? "none" : "block";
    $("box-min").style.display = isW ? "none" : "block";
    $("lbl-price").textContent = isW ? "Precio x Kg" : "Precio venta x Un.";
    $("lbl-cost").textContent = isW ? "Costo x Kg" : "Costo x Un.";
  });

  document.querySelectorAll("nav .tab").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("nav .tab").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll("main > section").forEach((s) => s.classList.add("hidden"));
    $("tab-" + b.dataset.tab).classList.remove("hidden");
    if (b.dataset.tab === "resumen") renderSummary();
  }));

  $("search-vender").addEventListener("input", renderProducts);
  $("clear-search-vender").addEventListener("click", () => { $("search-vender").value = ""; renderProducts(); });
  $("search-stock").addEventListener("input", renderStock);
  $("clear-search-stock").addEventListener("click", () => { $("search-stock").value = ""; renderStock(); });
  $("pay").addEventListener("change", updatePaySelection);
  $("account-select").addEventListener("change", () => {});
  $("apply-summary").addEventListener("click", applySummaryFilter);
  $("export-csv").addEventListener("click", exportCsv);

  $("product-grid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-id]"); if (!b) return;
    const p = getProductById(b.dataset.id);
    if (!p) return;

    if (p.isWeight) {
      const inputVal = prompt(`Ingresá el peso para ${p.name} (en Kilos, ej: 0.5 para 500g):`, "1");
      if (!inputVal) return;
      const w = parseFloat(inputVal.replace(',', '.'));
      if (isNaN(w) || w <= 0) return alert("Peso inválido.");
      cart[p.id] = safeQty(cart[p.id]) + w;
    } else {
      const inCart = Math.floor(safeQty(cart[p.id]));
      if (inCart < (p.stock || 0)) cart[p.id] = inCart + 1;
    }
    renderCart();
  });

  $("cart").addEventListener("click", (e) => {
    const inc = e.target.dataset.inc, dec = e.target.dataset.dec;

    if (inc) {
      const p = getProductById(inc);
      if (!p) return;

      if (p.isWeight) {
        const inputVal = prompt(`Sumar peso a ${p.name} (en Kilos, ej: 0.250 para 250g):`, "0.5");
        if (inputVal) {
          const w = parseFloat(inputVal.replace(',', '.'));
          if (!isNaN(w) && w > 0) cart[inc] = safeQty(cart[inc]) + w;
        }
      } else {
        const current = Math.floor(safeQty(cart[inc]));
        if (current < (p.stock || 0)) cart[inc] = current + 1;
      }
    }

    if (dec) {
      const p = getProductById(dec);
      if (!p) return;

      if (p.isWeight) {
        delete cart[dec];
      } else {
        const current = Math.floor(safeQty(cart[dec]));
        cart[dec] = current - 1;
        if (cart[dec] <= 0) delete cart[dec];
      }
    }
    renderCart();
  });

  $("clear-cart").addEventListener("click", () => { cart = {}; renderCart(); });
  $("charge").addEventListener("click", charge);
  $("add-product").addEventListener("click", addProduct);
  $("add-expense").addEventListener("click", addExpense);

  $("stock-body").addEventListener("click", async (e) => {
    const t = e.target;
    const p = (id) => data.products.find((x) => x.id === id);

    if (t.dataset.plus) {
      const item = p(t.dataset.plus);
      if (!item.isWeight) await updateStock(item.id, item.stock + 1);
    }
    if (t.dataset.minus) {
      const item = p(t.dataset.minus);
      if (!item.isWeight && item.stock > 0) await updateStock(item.id, item.stock - 1);
    }
    if (t.dataset.del && confirm("¿Borrar este producto?")) {
      const { error } = await _supabase.from('products').delete().eq('id', t.dataset.del);
      if (!error) loadData();
    }
  });

  $("expense-body").addEventListener("click", async (e) => {
    const id = e.target.dataset.edel;
    if (id && confirm("¿Borrar este gasto?")) {
      const { error } = await _supabase.from('expenses').delete().eq('id', id);
      if (!error) loadData();
    }
  });

  $("reset").addEventListener("click", async () => {
    if (confirm("Se borran productos, ventas y gastos de la base de datos. ¿Seguro?")) {
      await _supabase.from('products').delete().neq('id', '');
      await _supabase.from('sales').delete().neq('id', '');
      await _supabase.from('expenses').delete().neq('id', '');
      cart = {};
      loadData();
    }
  });

  // ==========================================
  // 6. INICIALIZACIÓN
  // ==========================================
  $("today").textContent = new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  setRangeInputs(summaryRange);
  updatePaySelection();
  loadData();
})();

(function () {
  // ==========================================
  // 1. CONFIGURACIÓN Y UTILIDADES
  // ==========================================
  const SUPABASE_URL = "https://ykjwzapdioyfpevxzzqy.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlrand6YXBkaW95ZnBldnh6enF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1OTA1OTIsImV4cCI6MjEwNzE2NjU5Mn0.KeHBe4Vev_QEW7sXQEdKv4kIpnbWocpZMPRFX7ccx_k";
  const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const PAY = { efectivo: "Efectivo", transferencia: "Transferencia", modo: "MODO", tarjeta: "Tarjeta", otro: "Otro" };
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-AR");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const todayKey = () => new Date().toLocaleDateString("sv-SE");
  const uid = () => Math.random().toString(36).slice(2, 10);

  // ESTADO GLOBAL
  let data = { products: [], sales: [], expenses: [] };
  let cart = {};

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

      data.products = (resProd.data || []).map(p => ({
        id: p.id, name: p.name, price: Number(p.price),
        cost: Number(p.cost), stock: Number(p.stock), min: Number(p.min_stock ?? 3)
      }));

      data.sales = (resSales.data || []).map(s => ({
        id: s.id, at: s.created_at, date: s.date,
        items: s.items, total: Number(s.total), profit: Number(s.profit), pay: s.pay
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
      const out = p.stock <= 0;
      return `<button class="prod ${out ? "out" : ""}" data-id="${p.id}" ${out ? "disabled" : ""}>
        <span>${esc(p.name)}</span>
        <span class="price">${fmt(p.price)}</span>
        <span class="stock ${p.stock <= p.min ? "low" : ""}">Stock: ${p.stock}</span>
      </button>`;
    }).join("") || `<p class="muted">${data.products.length ? "No se encontraron productos." : "Cargá productos en la pestaña Stock."}</p>`;
  }

  function renderCart() {
    const lines = Object.entries(cart).filter(([, q]) => q > 0);
    $("cart").innerHTML = lines.length ? lines.map(([id, q]) => {
      const p = data.products.find((x) => x.id === id);
      if (!p) return "";
      return `<div class="cart-line">
        <span>${esc(p.name)}</span>
        <span class="qty">
          <button data-dec="${id}">−</button><span>${q}</span><button data-inc="${id}">+</button>
          <span style="min-width:70px;text-align:right">${fmt(p.price * q)}</span>
        </span></div>`;
    }).join("") : `<p class="muted">Carrito vacío.</p>`;
    
    $("cart-total").textContent = fmt(cartTotal());
    $("charge").disabled = !lines.length;
  }

  function renderStock() {
    const query = ($("search-stock").value || "").trim().toLowerCase();
    const filtered = data.products.filter(p => p.name.toLowerCase().includes(query));

    $("stock-body").innerHTML = filtered.map((p) => `<tr>
      <td>${esc(p.name)}</td>
      <td class="num">${fmt(p.price)}</td>
      <td class="num">${fmt(p.cost)}</td>
      <td class="num ${p.stock <= p.min ? "low" : ""}">
        <button data-minus="${p.id}">−</button> ${p.stock} <button data-plus="${p.id}">+</button>
      </td>
      <td class="num"><button class="danger" data-del="${p.id}">✕</button></td>
    </tr>`).join("");
    
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

  function renderSummary() {
    const t = todayKey();
    const sales = data.sales.filter((s) => s.date === t);
    const exps = data.expenses.filter((e) => e.date === t);
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
      || `<tr><td class="muted">Sin ventas hoy.</td></tr>`;

    const low = data.products.filter((p) => p.stock <= p.min);
    $("low-list").innerHTML = low.length
      ? low.map((p) => `${esc(p.name)} (${p.stock})`).join(" · ")
      : "Todo en orden.";

    $("sales-body").innerHTML = [...data.sales].reverse().slice(0, 20).map((s) => {
      const d = new Date(s.at);
      const hora = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
      const items = (s.items || []).map((i) => `${i.qty}× ${esc(i.name)}`).join(", ");
      return `<tr><td>${s.date.slice(5)} ${hora}</td><td>${items}</td><td>${PAY[s.pay]}</td><td class="num">${fmt(s.total)}</td></tr>`;
    }).join("") || `<tr><td class="muted">Sin ventas todavía.</td></tr>`;
  }

  // ==========================================
  // 4. LÓGICA DE NEGOCIO (ACCIONES)
  // ==========================================
  function cartTotal() {
    return Object.entries(cart).reduce((t, [id, q]) => {
      const p = data.products.find((x) => x.id === id);
      return t + (p ? p.price * q : 0);
    }, 0);
  }

  async function charge() {
    const items = [];
    let total = 0, profit = 0;
    const stockUpdates = [];

    for (const [id, q] of Object.entries(cart)) {
      const p = data.products.find((x) => x.id === id);
      if (!p || q <= 0) continue;
      const qty = Math.min(q, p.stock);
      if (qty <= 0) continue;
      
      p.stock -= qty;
      stockUpdates.push(_supabase.from('products').update({ stock: p.stock }).eq('id', p.id));
      
      items.push({ name: p.name, qty, price: p.price });
      total += p.price * qty;
      profit += (p.price - p.cost) * qty;
    }
    if (!items.length) return;

    const saleRecord = {
      id: uid(),
      date: todayKey(),
      items: items,
      total: total,
      profit: profit,
      pay: $("pay").value
    };

    const resSale = await _supabase.from('sales').insert([saleRecord]);
    if (resSale.error) {
      alert("Error guardando venta.");
      return;
    }

    await Promise.all(stockUpdates);
    cart = {};
    loadData();
  }

  async function addProduct() {
    const name = $("p-name").value.trim();
    const price = parseFloat($("p-price").value);
    if (!name || isNaN(price)) { alert("Poné al menos nombre y precio."); return; }

    const newProd = {
      id: uid(),
      name: name,
      price: price,
      cost: parseFloat($("p-cost").value) || 0,
      stock: parseInt($("p-stock").value, 10) || 0,
      min_stock: parseInt($("p-min").value, 10) || 0
    };

    const { error } = await _supabase.from('products').insert([newProd]);
    if (error) return alert("Error al agregar producto.");

    ["p-name", "p-price", "p-cost", "p-stock"].forEach((i) => ($(i).value = ""));
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

  $("product-grid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-id]"); if (!b) return;
    const p = data.products.find((x) => x.id === b.dataset.id);
    const inCart = cart[p.id] || 0;
    if (inCart < p.stock) cart[p.id] = inCart + 1;
    renderCart();
  });

  $("cart").addEventListener("click", (e) => {
    const inc = e.target.dataset.inc, dec = e.target.dataset.dec;
    if (inc) { const p = data.products.find((x) => x.id === inc); if ((cart[inc] || 0) < p.stock) cart[inc]++; }
    if (dec) { cart[dec] = (cart[dec] || 0) - 1; if (cart[dec] <= 0) delete cart[dec]; }
    renderCart();
  });

  $("clear-cart").addEventListener("click", () => { cart = {}; renderCart(); });
  $("charge").addEventListener("click", charge);
  $("add-product").addEventListener("click", addProduct);
  $("add-expense").addEventListener("click", addExpense);

  $("stock-body").addEventListener("click", async (e) => {
    const t = e.target;
    const p = (id) => data.products.find((x) => x.id === id);

    if (t.dataset.plus) await updateStock(p(t.dataset.plus).id, p(t.dataset.plus).stock + 1);
    if (t.dataset.minus && p(t.dataset.minus).stock > 0) await updateStock(p(t.dataset.minus).id, p(t.dataset.minus).stock - 1);
    if (t.dataset.del && confirm("¿Borrar este producto?")) {
      await _supabase.from('products').delete().eq('id', t.dataset.del);
      loadData();
    }
  });

  $("expense-body").addEventListener("click", async (e) => {
    const id = e.target.dataset.edel;
    if (id && confirm("¿Borrar este gasto?")) {
      await _supabase.from('expenses').delete().eq('id', id);
      loadData();
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
  loadData();
})();

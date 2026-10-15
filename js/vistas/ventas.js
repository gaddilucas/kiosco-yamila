import { buscarProductos } from '../buscador.js';
import * as store from '../store.js';
import { pesos, esc } from '../utils.js';

const CANTIDAD_BARRA = 4;
const KILOS_RAPIDOS = [0.1, 0.25, 0.5, 1];
const MEDIOS = [
  { id: 'efectivo', texto: 'Efectivo' },
  { id: 'transferencia', texto: 'Transferencia' },
  { id: 'cc', texto: 'Cuenta corriente' },
];

let raiz;
let textoBusqueda = '';      // búsqueda de productos
let productoKg = null;       // producto por kilo abierto en el diálogo
let medioPago = 'efectivo';
let clienteId = null;        // cuenta corriente elegida (solo si medioPago es 'cc')
let textoBusquedaCC = '';    // búsqueda de cuentas corrientes

export function iniciarVentas(contenedor) {
  raiz = contenedor;
  raiz.innerHTML = `
    <div class="buscador">
      <input id="v-buscar" type="search" placeholder="Buscar producto..." autocomplete="off">
    </div>

    <p id="v-etiqueta" class="etiqueta"></p>
    <div id="v-barra" class="barra-productos"></div>

    <details class="todos-productos">
      <summary>Ver todos los productos</summary>
      <div id="v-grilla" class="grilla"></div>
    </details>

    <div class="ticket">
      <ul id="v-ticket" class="ticket-lista"></ul>
      <div class="ticket-total">Total <strong id="v-total">$ 0</strong></div>

      <p class="etiqueta">Medio de pago</p>
      <div id="v-medios" class="medios"></div>

      <div id="v-cc" class="cc-bloque" hidden>
        <div id="v-cc-elegido"></div>
        <input id="v-cc-buscar" type="search" placeholder="Buscar cuenta corriente..." autocomplete="off">
        <div id="v-cc-resultados" class="barra-clientes"></div>
      </div>

      <p id="v-error" class="deuda"></p>

      <div class="ticket-acciones">
        <button id="v-cobrar" class="btn-primario">Cobrar</button>
        <button id="v-vaciar" class="btn-secundario">Vaciar</button>
      </div>
    </div>

    <dialog id="v-kg" class="dialogo">
      <h3 id="v-kg-titulo"></h3>
      <p id="v-kg-precio" class="vacio"></p>
      <div class="rapidos">
        ${KILOS_RAPIDOS.map(k => `<button class="btn-secundario" data-kg="${k}">${formatoKg(k)} kg</button>`).join('')}
      </div>
      <      <div class="cantidad-kg">
        <label>
          <input id="v-kg-cant-kg" type="number" min="0" step="1" value="0" inputmode="numeric">
          kg
        </label>
        <label>
          <input id="v-kg-cant-g" type="number" min="0" max="999" step="50" value="0" inputmode="numeric">
          gramos
        </label>
      </div>
      <div class="fila">
        <button id="v-kg-agregar" class="btn-primario">Agregar</button>
      </div>

          <p id="v-kg-subtotal" class="ok"></p>
      <p id="v-kg-error" class="deuda"></p>
      <button id="v-kg-cerrar" class="btn-secundario">Cancelar</button>
    </dialog>
  `;


  raiz.addEventListener('click', onClick);

  raiz.querySelector('#v-buscar').addEventListener('input', e => {
    textoBusqueda = e.target.value;
    renderVentas();
  });

  raiz.querySelector('#v-cc-buscar').addEventListener('input', e => {
    textoBusquedaCC = e.target.value;
    renderCC();
  });

  raiz.querySelector('#v-cobrar').addEventListener('click', cobrar);
  raiz.querySelector('#v-vaciar').addEventListener('click', () => store.vaciarCarrito());

  // Diálogo de productos por kilo
  const dialogo = raiz.querySelector('#v-kg');
  dialogo.querySelectorAll('[data-kg]').forEach(b =>
    b.addEventListener('click', () => sumarKg(Number(b.dataset.kg)))
  );
  raiz.querySelector('#v-kg-cant-kg').addEventListener('input', actualizarSubtotalKg);
  raiz.querySelector('#v-kg-cant-g').addEventListener('input', actualizarSubtotalKg);
  [raiz.querySelector('#v-kg-cant-kg'), raiz.querySelector('#v-kg-cant-g')].forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') sumarKgEscrito();
    });
  });
  raiz.querySelector('#v-kg-agregar').addEventListener('click', sumarKgEscrito);
  raiz.querySelector('#v-kg-cerrar').addEventListener('click', () => dialogo.close());
  dialogo.addEventListener('close', () => { productoKg = null; });

    store.suscribir(renderVentas);
  renderVentas();
}
function onClick(e) {
  const btnProducto = e.target.closest('[data-producto]');
  if (btnProducto) {
    const producto = store.getProductos().find(p => p.id === btnProducto.dataset.producto);
    if (!producto) return;
    limpiarBusqueda();
    if (producto.tipo === 'kg') abrirKg(producto);
    else store.agregarAlCarrito(producto, 1);
    return;
  }
  const btnMas = e.target.closest('[data-mas]');
  if (btnMas) {
    store.cambiarCantidad(Number(btnMas.dataset.mas), 1);
    return;
  }

  const btnMenos = e.target.closest('[data-menos]');
  if (btnMenos) {
    store.cambiarCantidad(Number(btnMenos.dataset.menos), -1);
    return;
  }

  const btnQuitar = e.target.closest('[data-quitar]');
  if (btnQuitar) {
    store.quitarDelCarrito(Number(btnQuitar.dataset.quitar));
    return;
  }

  const btnPago = e.target.closest('[data-pago]');
  if (btnPago) {
    elegirMedio(btnPago.dataset.pago);
    return;
  }

  const btnCliente = e.target.closest('[data-cliente-id]');
  if (btnCliente) {
    elegirCliente(btnCliente.dataset.clienteId);
    return;
  }

  if (e.target.closest('#v-cc-quitar')) {
    clienteId = null;
    renderVentas();
  }
}

function limpiarBusqueda() {
  textoBusqueda = '';
  raiz.querySelector('#v-buscar').value = '';
  renderVentas();
}

// ---------- Medio de pago y cuenta corriente ----------
function elegirMedio(id) {
  medioPago = id;
  if (id !== 'cc') clienteId = null;
  textoBusquedaCC = '';
  raiz.querySelector('#v-cc-buscar').value = '';
  renderVentas();
}

function elegirCliente(id) {
  clienteId = id;
  textoBusquedaCC = '';
  raiz.querySelector('#v-cc-buscar').value = '';
  renderVentas();
}

function reiniciarPago() {
  medioPago = 'efectivo';
  clienteId = null;
  textoBusquedaCC = '';
  raiz.querySelector('#v-cc-buscar').value = '';
}

async function cobrar() {
  const venta = await store.cobrarVenta({
    medioPago,
    clienteId: medioPago === 'cc' ? clienteId : null,
  });
  if (venta) {
    reiniciarPago();
    renderVentas();
  }
}

// ---------- Productos por kilo ----------
function leerKgDesdeInputs() {
  const kg = Math.max(0, parseInt(raiz.querySelector('#v-kg-cant-kg').value, 10) || 0);
  const g  = Math.min(999, Math.max(0, parseInt(raiz.querySelector('#v-kg-cant-g').value, 10) || 0));
  return Number((kg + g / 1000).toFixed(3));
}

function abrirKg(producto) {
  productoKg = producto;
  raiz.querySelector('#v-kg-titulo').textContent = producto.nombre;
  raiz.querySelector('#v-kg-precio').textContent = `${pesos(producto.precio)} por kilo`;
  raiz.querySelector('#v-kg-cant-kg').value = 0;
  raiz.querySelector('#v-kg-cant-g').value = 0;
  raiz.querySelector('#v-kg-subtotal').textContent = '';
  raiz.querySelector('#v-kg-error').textContent = '';
  raiz.querySelector('#v-kg').showModal();
}

function sumarKg(kilos) {
  if (!productoKg) return;
  store.agregarAlCarrito(productoKg, kilos);
  raiz.querySelector('#v-kg').close();
}

function sumarKgEscrito() {
  const kilos = leerKgDesdeInputs();
  if (kilos <= 0) {
    raiz.querySelector('#v-kg-error').textContent = 'Ingresá al menos 1 g';
    return;
  }
  sumarKg(kilos);
}

function actualizarSubtotalKg() {
  const kilos = leerKgDesdeInputs();
  raiz.querySelector('#v-kg-error').textContent = '';
  raiz.querySelector('#v-kg-subtotal').textContent = kilos > 0 && productoKg
    ? `${formatoKg(kilos)} kg = ${pesos(Math.round(productoKg.precio * kilos))}`
    : '';
}

// Acepta "0,35" y "0.35". Devuelve null si no es un peso válido
function leerKilos(texto) {
  const n = Number(String(texto).trim().replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const kilos = Math.round(n * 1000) / 1000;  // hasta gramos
  return kilos > 0 ? kilos : null;
}

// ---------- Render ----------
function renderVentas() {
  if (!raiz) return;

  const consulta = textoBusqueda.trim();
  const catalogo = store.getProductos();
  const barra = consulta
    ? buscarProductos(consulta, catalogo, CANTIDAD_BARRA)
    : store.masVendidos(CANTIDAD_BARRA);

  raiz.querySelector('#v-etiqueta').textContent = consulta ? 'Resultados' : 'Más vendidos';
  raiz.querySelector('#v-barra').innerHTML = barra.length
    ? barra.map(tarjetaProducto).join('')
    : '<p class="vacio">Sin coincidencias</p>';

  raiz.querySelector('#v-grilla').innerHTML = catalogo.map(tarjetaProducto).join('');
  raiz.querySelector('#v-ticket').innerHTML =
    store.getCarrito().map(filaTicket).join('') || '<li class="vacio">Ticket vacío</li>';
  raiz.querySelector('#v-total').textContent = pesos(store.totalCarrito());

  renderMedios();
  renderCC();
  renderCobro();
}

function renderMedios() {
  raiz.querySelector('#v-medios').innerHTML = MEDIOS.map(m => `
    <button class="btn-medio ${m.id === medioPago ? 'activo' : ''}" data-pago="${m.id}">${m.texto}</button>`
  ).join('');
  raiz.querySelector('#v-cc').hidden = medioPago !== 'cc';
}

function renderCC() {
  if (medioPago !== 'cc') return;

  const clientes = store.getClientes();
  const elegido = clientes.find(c => c.id === clienteId);
  const elegidoEl = raiz.querySelector('#v-cc-elegido');
  const buscar = raiz.querySelector('#v-cc-buscar');
  const resultados = raiz.querySelector('#v-cc-resultados');

  // Ya hay cuenta elegida: muestra el chip y oculta la búsqueda
  if (elegido) {
    const saldo = store.saldoCliente(elegido);
    elegidoEl.innerHTML = `
      <div class="cc-chip">
        <span>${esc(elegido.nombre)} · debe <strong class="${saldo > 0 ? 'deuda' : ''}">${pesos(saldo)}</strong></span>
        <button id="v-cc-quitar" class="quitar" aria-label="Quitar cuenta">✕</button>
      </div>`;
    buscar.hidden = true;
    resultados.innerHTML = '';
    return;
  }

  elegidoEl.innerHTML = '';
  buscar.hidden = false;

  if (!clientes.length) {
    resultados.innerHTML = '<p class="vacio">Todavía no hay cuentas corrientes. Creá una en la pestaña CC.</p>';
    return;
  }

  const consulta = textoBusquedaCC.trim();
  const lista = consulta
    ? buscarProductos(consulta, clientes, CANTIDAD_BARRA)
    : [...clientes].sort((a, b) => a.nombre.localeCompare(b.nombre)).slice(0, CANTIDAD_BARRA);

  resultados.innerHTML = lista.length
    ? lista.map(c => `<button class="tarjeta-cliente" data-cliente-id="${c.id}">${esc(c.nombre)}</button>`).join('')
    : '<p class="vacio">Sin coincidencias</p>';
}

// Cobrar queda apagado si no hay productos o si es cuenta corriente sin cliente elegido
function renderCobro() {
  const error = raiz.querySelector('#v-error');
  const boton = raiz.querySelector('#v-cobrar');
  const hayVenta = store.getCarrito().length > 0;
  const faltaCliente = medioPago === 'cc' && !clienteId;

  error.textContent = hayVenta && faltaCliente ? 'Elegí una cuenta corriente para cobrar' : '';
  boton.disabled = !hayVenta || faltaCliente;
}

function tarjetaProducto(p) {
  const sufijo = p.tipo === 'kg' ? '/kg' : '';
  return `
    <button class="tarjeta" data-producto="${p.id}">
      <span class="nombre">${esc(p.nombre)}</span>
      <span class="precio">${pesos(p.precio)}${sufijo}</span>
    </button>`;
}

// Línea del ticket. Si es por kilo, muestra cuántos kilos y el precio por kilo
function filaTicket(i) {
  const detalle = i.tipo === 'kg'
    ? `<small>${formatoKg(i.cantidad)} kg × ${pesos(i.precio)}</small>`
    : '';
  const cantidadTexto = i.tipo === 'kg' ? `${formatoKg(i.cantidad)} kg` : i.cantidad;
  return `
    <li>
      <span>${esc(i.nombre)} ${detalle}</span>
      <span class="ajuste">
        <button class="btn-mini" data-menos="${i.uid}" aria-label="Restar">−</button>
        <span class="cantidad-ticket">${cantidadTexto}</span>
        <button class="btn-mini" data-mas="${i.uid}" aria-label="Sumar">+</button>
      </span>
      <span>${pesos(i.subtotal)}</span>
      <button class="quitar" data-quitar="${i.uid}" aria-label="Quitar">✕</button>
    </li>`;
}

// 0.5 -> "0,5"; 0.25 -> "0,25"
function formatoKg(n) {
  return Number(n).toLocaleString('es-AR', { maximumFractionDigits: 3 });
}
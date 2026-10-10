import { buscarProductos } from '../buscador.js';
import * as store from '../store.js';
import { pesos, esc } from '../utils.js';

const CANTIDAD_BARRA = 4;
const KILOS_RAPIDOS = [0.1, 0.25, 0.5, 1];

let raiz;
let textoBusqueda = '';
let productoKg = null;  // producto por kilo abierto en el diálogo

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
      <div class="ticket-acciones">
        <select id="v-cliente"></select>
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
      <div class="fila">
        <input id="v-kg-cant" type="text" inputmode="decimal" placeholder="Otro peso, ej. 0,35">
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
  raiz.querySelector('#v-cobrar').addEventListener('click', cobrar);
  raiz.querySelector('#v-vaciar').addEventListener('click', () => store.vaciarCarrito());

  // Diálogo de productos por kilo
  const dialogo = raiz.querySelector('#v-kg');
  dialogo.querySelectorAll('[data-kg]').forEach(b =>
    b.addEventListener('click', () => sumarKg(Number(b.dataset.kg)))
  );
  raiz.querySelector('#v-kg-cant').addEventListener('input', actualizarSubtotalKg);
  raiz.querySelector('#v-kg-cant').addEventListener('keydown', e => {
    if (e.key === 'Enter') sumarKgEscrito();
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

  const btnQuitar = e.target.closest('[data-quitar]');
  if (btnQuitar) store.quitarDelCarrito(Number(btnQuitar.dataset.quitar));
}

function limpiarBusqueda() {
  textoBusqueda = '';
  raiz.querySelector('#v-buscar').value = '';
  renderVentas();
}

// ---------- Productos por kilo ----------
function abrirKg(producto) {
  productoKg = producto;
  raiz.querySelector('#v-kg-titulo').textContent = producto.nombre;
  raiz.querySelector('#v-kg-precio').textContent = `${pesos(producto.precio)} por kilo`;
  raiz.querySelector('#v-kg-cant').value = '';
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
  const kilos = leerKilos(raiz.querySelector('#v-kg-cant').value);
  if (!kilos) {
    raiz.querySelector('#v-kg-error').textContent = 'Ingresá un peso válido, ej. 0,35';
    return;
  }
  sumarKg(kilos);
}

function actualizarSubtotalKg() {
  const kilos = leerKilos(raiz.querySelector('#v-kg-cant').value);
  raiz.querySelector('#v-kg-error').textContent = '';
  raiz.querySelector('#v-kg-subtotal').textContent = kilos && productoKg
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

// ---------- Cobro ----------
function cobrar() {
  if (!store.getCarrito().length) return;
  const clienteId = raiz.querySelector('#v-cliente').value || null;
  store.cobrarVenta({ clienteId });
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
  renderSelectorClientes();
}

function renderSelectorClientes() {
  const sel = raiz.querySelector('#v-cliente');
  const valorActual = sel.value;
  sel.innerHTML = '<option value="">Cobro en mostrador</option>' +
    store.getClientes()
      .map(c => `<option value="${c.id}">Fiar a: ${esc(c.nombre)}</option>`)
      .join('');
  sel.value = valorActual;
}

// Tarjeta solo con nombre y precio (por kilo agrega "/kg")
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
  return `
    <li>
      <span>${esc(i.nombre)} ${detalle}</span>
      <span>${pesos(i.subtotal)}</span>
      <button class="quitar" data-quitar="${i.uid}" aria-label="Quitar">✕</button>
    </li>`;
}

// 0.5 -> "0,5"; 0.25 -> "0,25"
function formatoKg(n) {
  return Number(n).toLocaleString('es-AR', { maximumFractionDigits: 3 });
}
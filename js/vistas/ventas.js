import { PRODUCTOS } from '../datos/productos.js';
import { buscarProductos } from '../buscador.js';
import * as store from '../store.js';
import { pesos, esc } from '../utils.js';

const CANTIDAD_BARRA = 4;
let raiz;
let textoBusqueda = '';

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
  `;

  raiz.addEventListener('click', onClick);

  raiz.querySelector('#v-buscar').addEventListener('input', e => {
    textoBusqueda = e.target.value;
    renderVentas();
  });
  raiz.querySelector('#v-cobrar').addEventListener('click', cobrar);
  raiz.querySelector('#v-vaciar').addEventListener('click', () => store.vaciarCarrito());

  store.suscribir(renderVentas);
  renderVentas();
}

function onClick(e) {
  const btnProducto = e.target.closest('[data-producto]');
  if (btnProducto) {
    const producto = PRODUCTOS.find(p => p.id === btnProducto.dataset.producto);
    limpiarBusqueda();
    if (producto) store.agregarAlCarrito(producto);
    return;
  }

  const btnQuitar = e.target.closest('[data-quitar]');
  if (btnQuitar) store.quitarDelCarrito(Number(btnQuitar.dataset.quitar));
}

function limpiarBusqueda() {
  textoBusqueda = '';
  raiz.querySelector('#v-buscar').value = '';
}

function cobrar() {
  if (!store.getCarrito().length) return;
  const clienteId = raiz.querySelector('#v-cliente').value || null;
  store.cobrarVenta({ clienteId });
}

function renderVentas() {
  if (!raiz) return;

  const consulta = textoBusqueda.trim();
  const barra = consulta
    ? buscarProductos(consulta, PRODUCTOS, CANTIDAD_BARRA)
    : store.masVendidos(CANTIDAD_BARRA);

  raiz.querySelector('#v-etiqueta').textContent = consulta ? 'Resultados' : 'Más vendidos';
  raiz.querySelector('#v-barra').innerHTML = barra.length
    ? barra.map(tarjetaProducto).join('')
    : '<p class="vacio">Sin coincidencias</p>';

  raiz.querySelector('#v-grilla').innerHTML = PRODUCTOS.map(tarjetaProducto).join('');

  raiz.querySelector('#v-ticket').innerHTML = store.getCarrito().map(i => `
    <li>
      <span>${esc(i.nombre)}</span>
      <span>${pesos(i.precio)}</span>
      <button class="quitar" data-quitar="${i.uid}" aria-label="Quitar">✕</button>
    </li>`).join('') || '<li class="vacio">Ticket vacío</li>';

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

// Tarjeta solo con nombre y precio
function tarjetaProducto(p) {
  return `
    <button class="tarjeta" data-producto="${p.id}">
      <span class="nombre">${esc(p.nombre)}</span>
      <span class="precio">${pesos(p.precio)}</span>
    </button>`;
}
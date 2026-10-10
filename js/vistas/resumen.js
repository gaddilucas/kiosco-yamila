import * as store from '../store.js';
import { pesos, esc } from '../utils.js';

let raiz;

export function iniciarResumen(contenedor) {
  raiz = contenedor;

  // El formulario se dibuja una sola vez, así no se borra lo que estás escribiendo
  raiz.innerHTML = `
    <div id="r-stats"></div>

    <div class="card">
      <h3>Productos más vendidos</h3>
      <ol id="r-ranking"></ol>
    </div>

    <div class="card">
      <h3>Agregar producto</h3>
      <form id="form-producto" class="columna">
        <input name="nombre" placeholder="Nombre, ej. Banana" required>
        <div class="fila">
          <input name="precio" type="text" inputmode="decimal" placeholder="Precio, ej. 4500" required>
          <select name="tipo">
            <option value="unidad">Por unidad</option>
            <option value="kg">Por kilo (verdura o fruta)</option>
          </select>
        </div>
        <button class="btn-primario">Guardar producto</button>
        <p id="r-error" class="deuda"></p>
        <p id="r-ok" class="ok"></p>
      </form>
    </div>
  `;

  raiz.querySelector('#form-producto').addEventListener('submit', guardarProducto);
  store.suscribir(renderResumen);
  renderResumen();
}

function renderResumen() {
  if (!raiz) return;
  const r = store.resumen();

  raiz.querySelector('#r-stats').innerHTML = `
    <div class="cards">
      <div class="card-stat"><span>Vendido hoy</span><strong>${pesos(r.totalHoy)}</strong></div>
      <div class="card-stat"><span>Ventas hoy</span><strong>${r.cantidadHoy}</strong></div>
      <div class="card-stat"><span>Ticket promedio</span><strong>${pesos(r.ticketPromedio)}</strong></div>
      <div class="card-stat"><span>Fiado hoy (CC)</span><strong>${pesos(r.fiadoHoy)}</strong></div>
      <div class="card-stat"><span>Deuda total CC</span><strong class="deuda">${pesos(r.deudaCC)}</strong></div>
      <div class="card-stat"><span>Histórico</span><strong>${pesos(r.totalHistorico)}</strong></div>
    </div>`;

  const filas = r.ranking.map(x => `<li>${esc(x.nombre)} · × ${x.cantidad} · ${pesos(x.total)}</li>`);
  raiz.querySelector('#r-ranking').innerHTML = filas.join('') || '<li class="vacio">Sin ventas todavía</li>';
}

async function guardarProducto(e) {
  e.preventDefault();
  const form = e.target;
  const error = raiz.querySelector('#r-error');
  const ok = raiz.querySelector('#r-ok');
  error.textContent = '';
  ok.textContent = '';

  const nombre = form.nombre.value.trim();
  const precio = leerPrecio(form.precio.value);
  const tipo = form.tipo.value;

  if (!nombre) {
    error.textContent = 'Poné un nombre';
    return;
  }
  if (precio === null) {
    error.textContent = 'Poné un precio válido, mayor a 0';
    return;
  }
  const repetido = store.getProductos().some(p => p.nombre.toLowerCase() === nombre.toLowerCase());
  if (repetido) {
    error.textContent = 'Ya existe un producto con ese nombre';
    return;
  }

  try {
    await store.agregarProducto({ nombre, precio, tipo });
    form.reset();
    ok.textContent = `"${nombre}" guardado`;
  } catch (err) {
    console.error(err);
    error.textContent = 'No se pudo guardar. Revisá la conexión.';
  }
}

// Acepta "4500" o "4.500" (el punto es separador de miles). Devuelve null si no es válido
function leerPrecio(texto) {
  const n = Number(String(texto).trim().replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}
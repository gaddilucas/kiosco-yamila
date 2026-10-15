import * as store from '../store.js';
import { pesos, esc } from '../utils.js';

const VENTAS_VISIBLES = 30;  // cuántas ventas recientes muestra la lista
const PAGO = { efectivo: 'Efectivo', transferencia: 'Transferencia', cc: 'Cuenta corriente' };

let raiz;
let filtroProductos = '';    // texto del buscador de la lista de productos

export function iniciarResumen(contenedor) {
  raiz = contenedor;

  // El formulario se dibuja una sola vez, así no se borra lo que estás escribiendo
  raiz.innerHTML = `
    <div id="r-stats"></div>

    <div class="card">
      <h3>Últimas ventas</h3>
      <ul id="r-ventas" class="lista lista-ventas"></ul>
    </div>

    <div class="card">
      <h3>Productos más vendidos</h3>
      <ol id="r-ranking"></ol>
    </div>

    <div class="card">
      <h3>Agregar o cambiar precio</h3>
      <form id="form-producto" class="columna">
        <input name="nombre" placeholder="Nombre, ej. Banana" required>
        <div class="fila">
          <input name="precio" type="text" inputmode="decimal" placeholder="Precio, ej. 4500" required>
          <select name="tipo">
            <option value="unidad">Por unidad</option>
            <option value="kg">Por kilo (verdura o fruta)</option>
          </select>
        </div>
        <p class="ayuda">Si el nombre ya existe, se cambia su precio.</p>
        <button class="btn-primario">Guardar producto</button>
        <p id="r-form-error" class="deuda"></p>
        <p id="r-form-ok" class="ok"></p>
      </form>
    </div>

    <div class="card">
      <h3>Productos cargados</h3>
      <input id="r-filtro" type="search" placeholder="Buscar para quitar..." autocomplete="off">
      <ul id="r-lista-productos" class="lista"></ul>
      <p id="r-lista-error" class="deuda"></p>
      <p id="r-lista-ok" class="ok"></p>
    </div>

    <div class="card">
      <h3>Reporte del día (PDF)</h3>
      <div class="fila">
        <input id="r-dia" type="date">
        <button id="r-pdf" class="btn-primario">Descargar PDF</button>
      </div>
      <p id="r-pdf-error" class="deuda"></p>
    </div>
  `;

  raiz.querySelector('#r-dia').value = store.diaLocal(new Date());
  raiz.querySelector('#form-producto').addEventListener('submit', guardarProducto);
  raiz.querySelector('#r-filtro').addEventListener('input', e => {
    filtroProductos = e.target.value;
    renderListaProductos();
  });
  raiz.addEventListener('click', onClick);
  store.suscribir(renderResumen);
  renderResumen();
}

function onClick(e) {
  const btnQuitar = e.target.closest('[data-quitar-producto]');
  if (btnQuitar) {
    pedirQuitar(btnQuitar.dataset.quitarProducto);
    return;
  }
  if (e.target.closest('#r-pdf')) descargarPDF();
}

function renderResumen() {
  if (!raiz) return;
  const r = store.resumen();
  const mes = store.resumenMes();

  raiz.querySelector('#r-stats').innerHTML = `
    <div class="cards">
      <div class="card-stat"><span>Cobrado hoy</span><strong>${pesos(r.totalHoy)}</strong></div>
      <div class="card-stat"><span>Ventas hoy</span><strong>${r.cantidadHoy}</strong></div>
      <div class="card-stat"><span>Ticket promedio</span><strong>${pesos(r.ticketPromedio)}</strong></div>
      <div class="card-stat"><span>Fiado hoy (CC)</span><strong>${pesos(r.fiadoHoy)}</strong></div>
      <div class="card-stat"><span>Deuda total CC</span><strong class="deuda">${pesos(r.deudaCC)}</strong></div>
      <div class="card-stat"><span>Mes ${nombreMes(mes.mes)}</span><strong>${pesos(mes.totalCobrado)}</strong></div>
    </div>`;

  raiz.querySelector('#r-ventas').innerHTML =
    store.ultimasVentas(VENTAS_VISIBLES).map(filaVenta).join('') || '<li class="vacio">Sin ventas todavía</li>';

  raiz.querySelector('#r-ranking').innerHTML =
    r.ranking.map(x => `<li>${esc(x.nombre)} · × ${x.cantidad} · ${pesos(x.total)}</li>`).join('')
    || '<li class="vacio">Sin ventas todavía</li>';

  renderListaProductos();
}

// Una venta: monto, medio de pago (con el cliente si es cuenta corriente) y fecha y hora
function filaVenta(v) {
  const pago = PAGO[v.medioPago] ?? PAGO.efectivo;
  const cliente = v.medioPago === 'cc' ? nombreCliente(v.clienteId) : '';
  const detalle = cliente ? `${pago} · ${esc(cliente)}` : pago;

  return `
    <li>
      <span><strong>${pesos(v.total)}</strong> <span class="pago">${detalle}</span></span>
      <small>${fechaHora(v.fecha)}</small>
    </li>`;
}
// "2026-10" -> "octubre 2026"
function nombreMes(mes) {
  const [anio, numero] = mes.split('-');
  return new Date(Number(anio), Number(numero) - 1, 1)
    .toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
}

function nombreCliente(id) {
  return store.getClientes().find(c => c.id === id)?.nombre ?? '';
}

function fechaHora(iso) {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ---------- Mensajes ----------
// zona: 'form' (alta de productos) o 'lista' (quitar productos)
function mostrar(zona, tipo, texto) {
  raiz.querySelector(`#r-${zona}-ok`).textContent = tipo === 'ok' ? texto : '';
  raiz.querySelector(`#r-${zona}-error`).textContent = tipo === 'error' ? texto : '';
}

// ---------- Alta y cambio de precio ----------
async function guardarProducto(e) {
  e.preventDefault();
  const form = e.target;
  mostrar('form', '', '');

  const nombre = form.nombre.value.trim();
  const precio = leerPrecio(form.precio.value);
  const tipo = form.tipo.value;

  if (!nombre) return mostrar('form', 'error', 'Poné un nombre');
  if (precio === null) return mostrar('form', 'error', 'Poné un precio válido, mayor a 0');

  const existente = store.buscarProductoPorNombre(nombre);
  try {
    if (existente) {
      const anterior = existente.precio;
      await store.actualizarProducto(existente.id, { precio, tipo });
      form.reset();
      mostrar('form', 'ok', `"${existente.nombre}" actualizado: ${pesos(anterior)} → ${pesos(precio)}`);
    } else {
      await store.agregarProducto({ nombre, precio, tipo });
      form.reset();
      mostrar('form', 'ok', `"${nombre}" guardado`);
    }
  } catch (err) {
    console.error(err);
    mostrar('form', 'error', 'No se pudo guardar. Revisá la conexión.');
  }
}

// ---------- Lista de productos para quitar ----------
const normalizar = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

function renderListaProductos() {
  const cont = raiz.querySelector('#r-lista-productos');
  const consulta = normalizar(filtroProductos);
  const productos = store.getProductos().filter(p => normalizar(p.nombre).includes(consulta));

  cont.innerHTML = productos.length
    ? productos.map(filaProducto).join('')
    : '<li class="vacio">No hay productos para mostrar</li>';
}

function filaProducto(p) {
  const tipo = p.tipo === 'kg' ? 'por kilo' : 'por unidad';
  const sufijo = p.tipo === 'kg' ? '/kg' : '';
  return `
    <li>
      <span>${esc(p.nombre)} <small>${tipo}</small></span>
      <span>${pesos(p.precio)}${sufijo}</span>
      <button class="btn-peligro" data-quitar-producto="${p.id}" aria-label="Quitar ${esc(p.nombre)}">Quitar</button>
    </li>`;
}

async function pedirQuitar(id) {
  const producto = store.getProductos().find(p => p.id === id);
  if (!producto) return;
  if (!confirm(`¿Quitar "${producto.nombre}" de la lista?\nLas ventas anteriores se conservan.`)) return;

  try {
    await store.eliminarProducto(id);
    mostrar('lista', 'ok', `"${producto.nombre}" quitado`);
  } catch (err) {
    console.error(err);
    mostrar('lista', 'error', 'No se pudo quitar. Revisá la conexión.');
  }
}

// Acepta "4500" o "4.500" (el punto es separador de miles). Devuelve null si no es válido
function leerPrecio(texto) {
  const n = Number(String(texto).trim().replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

// ---------- Reporte PDF del día ----------
const hora = iso => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

// "2026-10-10" -> "10/10/2026"
const formatoFecha = dia => dia.split('-').reverse().join('/');

function formatoKg(n) {
  return Number(n).toLocaleString('es-AR', { maximumFractionDigits: 3 });
}

// Productos de una venta: "Coca Cola, Banana 0,5 kg"
function detalleProductos(v) {
  return v.items
    .map(i => (i.cantidad === 1 ? i.nombre : `${i.nombre} ${formatoKg(i.cantidad)} kg`))
    .join(', ');
}

function descargarPDF() {
  const dia = raiz.querySelector('#r-dia').value;
  const errorPDF = raiz.querySelector('#r-pdf-error');
  errorPDF.textContent = '';

  if (!dia) {
    errorPDF.textContent = 'Elegí un día';
    return;
  }
  if (!window.jspdf?.jsPDF) {
    errorPDF.textContent = 'No se cargó el generador de PDF. Revisá la conexión y recargá la página.';
    return;
  }

  try {
    armarPDF(dia).save(`kiosco-${dia}.pdf`);
  } catch (err) {
    console.error(err);
    errorPDF.textContent = 'No se pudo generar el PDF';
  }
}

function armarPDF(dia) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const ventas = store.ventasDelDia(dia);
  const movs = store.movimientosCCDelDia(dia);

  const suma = valores => valores.reduce((s, x) => s + x, 0);
  const montoDe = medio => suma(ventas.filter(v => v.medioPago === medio).map(v => v.total));
  const efectivo = montoDe('efectivo');
  const transferencia = montoDe('transferencia');
  const fiado = montoDe('cc');
  const pagosCC = suma(movs.filter(m => m.tipo === 'pago').map(m => m.monto));
  const cobradas = ventas.filter(v => v.medioPago !== 'cc').length;

  doc.setFontSize(16);
  doc.text('Kiosco Yamila', 14, 18);
  doc.setFontSize(11);
  doc.text(`Movimientos del ${formatoFecha(dia)}`, 14, 25);

  let y = tabla(doc, 'Resumen del día', ['Concepto', 'Monto'], [
    ['Ventas cobradas', String(cobradas)],
    ['Efectivo', pesos(efectivo)],
    ['Transferencia', pesos(transferencia)],
    ['Total cobrado (efectivo + transferencia)', pesos(efectivo + transferencia)],
    ['Fiado en cuenta corriente (no suma al total)', pesos(fiado)],
    ['Pagos de cuenta corriente recibidos', pesos(pagosCC)],
  ], 33);

  y = tabla(doc, 'Ventas', ['Hora', 'Productos', 'Medio de pago', 'Cliente', 'Total'],
    ventas.map(v => [
      hora(v.fecha),
      detalleProductos(v),
      PAGO[v.medioPago] ?? PAGO.efectivo,
      v.medioPago === 'cc' ? nombreCliente(v.clienteId) : '',
      pesos(v.total),
    ]), y);

  tabla(doc, 'Movimientos de cuenta corriente', ['Hora', 'Cliente', 'Tipo', 'Detalle', 'Monto'],
    movs.map(m => [
      hora(m.fecha),
      m.cliente,
      m.tipo === 'cargo' ? 'Cargo' : 'Pago',
      m.nota || '',
      pesos(m.monto),
    ]), y);

  return doc;
}

// Dibuja un título y una tabla. Devuelve la posición Y para la siguiente sección
function tabla(doc, titulo, cabecera, filas, y) {
  doc.setFontSize(12);
  doc.text(titulo, 14, y);
  doc.autoTable({
    startY: y + 3,
    head: [cabecera],
    body: filas.length ? filas : [['Sin movimientos', ...Array(cabecera.length - 1).fill('')]],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [31, 122, 77] },
    margin: { left: 14, right: 14 },
  });
  return doc.lastAutoTable.finalY + 10;
}
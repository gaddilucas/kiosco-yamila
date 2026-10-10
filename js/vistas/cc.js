import * as store from '../store.js';
import { pesos, esc } from '../utils.js';

let raiz;
let clienteActivo = null;

export function iniciarCC(contenedor) {
  raiz = contenedor;
  raiz.innerHTML = `
    <form id="cc-nuevo" class="card">
      <h3>Nuevo cliente</h3>
      <div class="fila">
        <input name="nombre" placeholder="Nombre del cliente" required>
        <button class="btn-primario">Agregar</button>
      </div>
    </form>

    <div class="card">
      <h3>Clientes</h3>
      <ul id="cc-lista" class="lista"></ul>
    </div>

    <div id="cc-detalle" class="card"></div>
  `;

  raiz.addEventListener('click', e => {
    const item = e.target.closest('[data-cliente]');
    if (item) {
      clienteActivo = item.dataset.cliente;
      renderCC();
    }
  });

  raiz.addEventListener('submit', e => {
    e.preventDefault();
    const form = e.target;

    if (form.id === 'cc-nuevo') {
      const nombre = form.nombre.value.trim();
      if (!nombre) return;
      store.agregarCliente(nombre);
      form.reset();
    }

    if (form.id === 'cc-mov' && clienteActivo) {
      store.registrarMovimiento(
        clienteActivo,
        form.tipo.value,
        Number(form.monto.value),
        form.nota.value.trim()
      );
      form.reset();
    }
  });

  store.suscribir(renderCC);
  renderCC();
}

function renderCC() {
  if (!raiz) return;

  const clientes = store.getClientes();
  raiz.querySelector('#cc-lista').innerHTML = clientes.length
    ? clientes.map(c => {
        const saldo = store.saldoCliente(c);
        return `
          <li class="item-cliente ${c.id === clienteActivo ? 'activo' : ''}" data-cliente="${c.id}">
            <span>${esc(c.nombre)}</span>
            <strong class="${saldo > 0 ? 'deuda' : ''}">${pesos(saldo)}</strong>
          </li>`;
      }).join('')
    : '<li class="vacio">Todavía no hay clientes</li>';

  const cliente = clientes.find(c => c.id === clienteActivo);
  raiz.querySelector('#cc-detalle').innerHTML = cliente
    ? detalleHTML(cliente)
    : '<p class="vacio">Seleccioná un cliente para ver su cuenta</p>';
}

function detalleHTML(c) {
  const saldo = store.saldoCliente(c);
  const movimientos = [...c.movimientos].reverse().slice(0, 20);

  return `
    <h3>${esc(c.nombre)}</h3>
    <p class="saldo">Saldo: <strong class="${saldo > 0 ? 'deuda' : ''}">${pesos(saldo)}</strong></p>

    <form id="cc-mov" class="fila">
      <select name="tipo">
        <option value="cargo">Cargo (fió)</option>
        <option value="pago">Pago</option>
      </select>
      <input name="monto" type="number" min="1" step="1" placeholder="Monto" required>
      <input name="nota" placeholder="Nota (opcional)">
      <button class="btn-primario">Registrar</button>
    </form>

    <h4>Movimientos</h4>
    <ul class="lista">
      ${movimientos.map(m => `
        <li>
          <span>
            ${new Date(m.fecha).toLocaleDateString('es-AR')} · ${m.tipo === 'cargo' ? 'Cargo' : 'Pago'}
            ${m.nota ? '· ' + esc(m.nota) : ''}
          </span>
          <strong class="${m.tipo === 'cargo' ? 'deuda' : 'ok'}">
            ${m.tipo === 'cargo' ? '+' : '−'} ${pesos(m.monto)}
          </strong>
        </li>`).join('') || '<li class="vacio">Sin movimientos</li>'}
    </ul>
  `;
}
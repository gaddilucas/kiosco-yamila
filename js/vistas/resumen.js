import * as store from '../store.js';
import { pesos, esc } from '../utils.js';

let raiz;

export function iniciarResumen(contenedor) {
  raiz = contenedor;
  store.suscribir(renderResumen);
  renderResumen();
}

function renderResumen() {
  if (!raiz) return;
  const r = store.resumen();

  raiz.innerHTML = `
    <div class="cards">
      <div class="card-stat"><span>Vendido hoy</span><strong>${pesos(r.totalHoy)}</strong></div>
      <div class="card-stat"><span>Ventas hoy</span><strong>${r.cantidadHoy}</strong></div>
      <div class="card-stat"><span>Ticket promedio</span><strong>${pesos(r.ticketPromedio)}</strong></div>
      <div class="card-stat"><span>Fiado hoy (CC)</span><strong>${pesos(r.fiadoHoy)}</strong></div>
      <div class="card-stat"><span>Deuda total CC</span><strong class="deuda">${pesos(r.deudaCC)}</strong></div>
      <div class="card-stat"><span>Histórico</span><strong>${pesos(r.totalHistorico)}</strong></div>
    </div>

    <div class="card">
      <h3>Productos más vendidos</h3>
      <ol>
        ${r.ranking.map(x => `
          <li>${esc(x.nombre)} · × ${x.cantidad} · ${pesos(x.total)}</li>`).join('')
          || '<li class="vacio">Sin ventas todavía</li>'}
      </ol>
    </div>
  `;
}
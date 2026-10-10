// Estado en memoria. Al iniciar sesión carga los datos de Supabase y cada cambio se guarda ahí.
import * as db from './almacenamiento.js';

const datos = { productos: [], ventas: [], clientesCC: [] };  // espejo local de la base
const carrito = [];                                           // venta en curso (solo en memoria)
const oyentes = new Set();
let siguienteUid = 1;
let cobrando = false;

// ---------- Suscripción ----------
export function suscribir(fn) { oyentes.add(fn); }
function notificar() { oyentes.forEach(fn => fn()); }

function avisarError(error) {
  console.error(error);
  alert('No se pudo guardar. Revisá la conexión e intentá de nuevo.');
}

const redondear = n => Math.round(n);

// ---------- Carga desde Supabase ----------
export async function cargarDatos() {
  const { productos, clientes, ventas } = await db.cargarTodo();

  datos.productos = productos.map(p => ({
    id: p.id,
    nombre: p.nombre,
    precio: Number(p.precio),
    tipo: p.tipo,
  }));

  datos.clientesCC = clientes.map(c => ({
    id: c.id,
    nombre: c.nombre,
    movimientos: [...(c.movimientos || [])]
      .map(m => ({ ...m, monto: Number(m.monto) }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha)),
  }));

  datos.ventas = ventas.map(v => ({
    id: v.id,
    fecha: v.fecha,
    total: Number(v.total),
    medioPago: v.medio_pago,
    clienteId: v.cliente_id,
    items: (v.venta_items || []).map(i => ({
      id: i.producto_id,
      nombre: i.nombre,
      precio: Number(i.precio),
      cantidad: Number(i.cantidad),
      subtotal: Number(i.subtotal),
    })),
  }));

  notificar();
}

// ---------- Productos ----------
export const getProductos = () => datos.productos;

export async function agregarProducto({ nombre, precio, tipo }) {
  const producto = { id: crypto.randomUUID(), nombre, precio, tipo };
  await db.insertarProducto(producto);
  datos.productos.push(producto);
  datos.productos.sort((a, b) => a.nombre.localeCompare(b.nombre));
  notificar();
}

// ---------- Carrito (solo en memoria) ----------
export const getCarrito = () => carrito;
export const totalCarrito = () => carrito.reduce((s, i) => s + i.subtotal, 0);

// cantidad: 1 para unidades, o kilos (ej. 0.25) para productos por kilo
export function agregarAlCarrito(producto, cantidad = 1) {
  carrito.push({
    uid: siguienteUid++,
    id: producto.id,
    nombre: producto.nombre,
    tipo: producto.tipo,
    precio: producto.precio,
    cantidad,
    subtotal: redondear(producto.precio * cantidad),
  });
  notificar();
}

export function quitarDelCarrito(uid) {
  const i = carrito.findIndex(item => item.uid === uid);
  if (i !== -1) carrito.splice(i, 1);
  notificar();
}

export function vaciarCarrito() {
  carrito.length = 0;
  notificar();
}

// ---------- Ventas ----------
// medioPago: 'efectivo' | 'transferencia' | 'cc'. Si es 'cc' hace falta clienteId.
// Devuelve la venta guardada, o null si no se pudo cobrar.
export async function cobrarVenta({ medioPago = 'efectivo', clienteId = null } = {}) {
  if (!carrito.length || cobrando) return null;
  if (medioPago === 'cc' && !clienteId) return null;
  cobrando = true;

  const venta = {
    id: crypto.randomUUID(),
    fecha: new Date().toISOString(),
    total: totalCarrito(),
    medio_pago: medioPago,
    cliente_id: medioPago === 'cc' ? clienteId : null,
  };
  const items = carrito.map(i => ({
    producto_id: i.id,
    nombre: i.nombre,
    precio: i.precio,
    cantidad: i.cantidad,
    subtotal: i.subtotal,
  }));

  try {
    await db.insertarVenta(venta, items);

    if (venta.cliente_id) {
      await db.insertarMovimiento({
        cliente_id: venta.cliente_id, tipo: 'cargo', monto: venta.total, nota: 'Venta', fecha: venta.fecha,
      });
    }

    // Reflejar en memoria lo que ya quedó guardado
    datos.ventas.push({
      id: venta.id,
      fecha: venta.fecha,
      total: venta.total,
      medioPago,
      clienteId: venta.cliente_id,
      items: items.map(i => ({
        id: i.producto_id,
        nombre: i.nombre,
        precio: i.precio,
        cantidad: i.cantidad,
        subtotal: i.subtotal,
      })),
    });
    if (venta.cliente_id) {
      datos.clientesCC.find(c => c.id === venta.cliente_id)?.movimientos.push({
        tipo: 'cargo', monto: venta.total, nota: 'Venta', fecha: venta.fecha,
      });
    }
    carrito.length = 0;
    return venta;
  } catch (e) {
    avisarError(e);
    return null;
  } finally {
    cobrando = false;
    notificar();
  }
}

// Ventas más recientes primero
export function ultimasVentas(n) {
  return [...datos.ventas]
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .slice(0, n);
}

// Ranking de productos vendidos (para la barra por defecto y el resumen)
export function rankingProductos() {
  const mapa = new Map();
  datos.ventas.forEach(v => v.items.forEach(i => {
    const r = mapa.get(i.id) || { id: i.id, nombre: i.nombre, cantidad: 0, total: 0 };
    r.cantidad++;
    r.total += i.subtotal;
    mapa.set(i.id, r);
  }));
  return [...mapa.values()].sort((a, b) => b.cantidad - a.cantidad || b.total - a.total);
}

// Los n más vendidos; si hay menos, completa con productos del catálogo
export function masVendidos(n) {
  const catalogo = datos.productos;
  const vendidos = rankingProductos()
    .map(r => catalogo.find(p => p.id === r.id))
    .filter(Boolean);
  const resto = catalogo.filter(p => !vendidos.includes(p));
  return [...vendidos, ...resto].slice(0, n);
}

// ---------- Cuentas corrientes ----------
export const getClientes = () => datos.clientesCC;

export async function agregarCliente(nombre) {
  const cliente = { id: crypto.randomUUID(), nombre: nombre.trim() };
  try {
    await db.insertarCliente(cliente);
    datos.clientesCC.push({ ...cliente, movimientos: [] });
  } catch (e) {
    avisarError(e);
  }
  notificar();
}

export async function registrarMovimiento(clienteId, tipo, monto, nota = '') {
  if (!(monto > 0)) return;
  const fecha = new Date().toISOString();
  try {
    await db.insertarMovimiento({ cliente_id: clienteId, tipo, monto, nota, fecha });
    datos.clientesCC.find(c => c.id === clienteId)?.movimientos.push({ tipo, monto, nota, fecha });
  } catch (e) {
    avisarError(e);
  }
  notificar();
}

// Positivo = el cliente debe plata
export function saldoCliente(cliente) {
  return cliente.movimientos.reduce((s, m) => s + (m.tipo === 'cargo' ? m.monto : -m.monto), 0);
}

// ---------- Resumen ----------
export function resumen() {
  const hoy = new Date().toDateString();
  const ventasHoy = datos.ventas.filter(v => new Date(v.fecha).toDateString() === hoy);
  const totalHoy = ventasHoy.reduce((s, v) => s + v.total, 0);

  return {
    totalHoy,
    cantidadHoy: ventasHoy.length,
    ticketPromedio: ventasHoy.length ? Math.round(totalHoy / ventasHoy.length) : 0,
    fiadoHoy: ventasHoy.filter(v => v.medioPago === 'cc').reduce((s, v) => s + v.total, 0),
    totalHistorico: datos.ventas.reduce((s, v) => s + v.total, 0),
    deudaCC: datos.clientesCC.reduce((s, c) => s + Math.max(saldoCliente(c), 0), 0),
    ranking: rankingProductos().slice(0, 5),
  };
}
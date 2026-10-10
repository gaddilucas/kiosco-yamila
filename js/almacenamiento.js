// Acceso a Supabase: login y lectura/escritura de datos.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- Sesión ----------
export async function iniciarSesion(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function cerrarSesion() {
  await sb.auth.signOut();
}

export const alCambiarSesion = fn => sb.auth.onAuthStateChange(fn);

// ---------- Lectura ----------
export async function cargarTodo() {
  const [clientes, ventas] = await Promise.all([
    sb.from('clientes').select('id, nombre, movimientos(tipo, monto, nota, fecha)').order('creado_en'),
    sb.from('ventas').select('id, fecha, total, cliente_id, venta_items(producto_id, nombre, precio)').order('fecha'),
  ]);
  if (clientes.error) throw clientes.error;
  if (ventas.error) throw ventas.error;
  return { clientes: clientes.data, ventas: ventas.data };
}

// ---------- Escritura ----------
export async function insertarCliente(cliente) {
  const { error } = await sb.from('clientes').insert(cliente);
  if (error) throw error;
}

export async function insertarVenta(venta, items) {
  const { error: errVenta } = await sb.from('ventas').insert(venta);
  if (errVenta) throw errVenta;

  const { error: errItems } = await sb.from('venta_items').insert(
    items.map(i => ({ venta_id: venta.id, ...i }))
  );
  if (errItems) {
    // Si fallan los items, borra la venta para no dejarla incompleta
    await sb.from('ventas').delete().eq('id', venta.id);
    throw errItems;
  }
}

export async function insertarMovimiento(movimiento) {
  const { error } = await sb.from('movimientos').insert(movimiento);
  if (error) throw error;
}
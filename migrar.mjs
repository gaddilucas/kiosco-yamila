// migrar.mjs: copia datos.json a Supabase usando el login de un usuario
import { readFile } from 'node:fs/promises';

const BASE = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const EMAIL = process.env.SUPABASE_EMAIL;
const PASSWORD = process.env.SUPABASE_PASSWORD;

if (!BASE || !ANON || !EMAIL || !PASSWORD) {
  console.error('Faltan variables: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_EMAIL, SUPABASE_PASSWORD');
  process.exit(1);
}

// 1. Login: las políticas RLS solo permiten escribir a usuarios autenticados
const login = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!login.ok) {
  console.error('Login fallido:', await login.text());
  process.exit(1);
}
const { access_token } = await login.json();

const cabeceras = {
  apikey: ANON,
  Authorization: `Bearer ${access_token}`,
  'Content-Type': 'application/json',
};

async function insertar(tabla, filas, upsert = false) {
  if (!filas.length) {
    console.log(`- ${tabla}: sin filas`);
    return;
  }
  for (let i = 0; i < filas.length; i += 500) {
    const lote = filas.slice(i, i + 500);
    const url = `${BASE}/rest/v1/${tabla}` + (upsert ? '?on_conflict=id' : '');
    const prefer = upsert ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal';
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...cabeceras, Prefer: prefer },
      body: JSON.stringify(lote),
    });
    if (!res.ok) throw new Error(`${tabla}: ${res.status} ${await res.text()}`);
  }
  console.log(`✔ ${tabla}: ${filas.length} filas`);
}

// 2. Leer datos locales
const datos = JSON.parse(await readFile('datos.json', 'utf8'));
const listaClientes = datos.clientesCC ?? [];
const listaVentas = datos.ventas ?? [];

// 3. Productos que existen en la base (evita romper la clave foránea)
const resProd = await fetch(`${BASE}/rest/v1/productos?select=id`, { headers: cabeceras });
if (!resProd.ok) throw new Error(`productos: ${resProd.status} ${await resProd.text()}`);
const idsProductos = new Set((await resProd.json()).map(p => p.id));

// 4. Transformar al formato de las tablas
const clientes = listaClientes.map(c => ({ id: String(c.id), nombre: c.nombre }));

const ventas = listaVentas.map(v => ({
  id: String(v.id),
  fecha: v.fecha,
  total: v.total,
  cliente_id: v.clienteId ? String(v.clienteId) : null,
}));

const ventaItems = listaVentas.flatMap(v =>
  v.items.map(i => ({
    venta_id: String(v.id),
    producto_id: idsProductos.has(i.id) ? i.id : null,
    nombre: i.nombre,
    precio: i.precio,
  }))
);

const movimientos = listaClientes.flatMap(c =>
  c.movimientos.map(m => ({
    cliente_id: String(c.id),
    tipo: m.tipo,
    monto: m.monto,
    nota: m.nota || '',
    fecha: m.fecha,
  }))
);

// 5. Insertar en orden: cada tabla referencia a las anteriores
await insertar('clientes', clientes, true);
await insertar('ventas', ventas, true);
await insertar('venta_items', ventaItems);
await insertar('movimientos', movimientos);

console.log('Migración terminada');

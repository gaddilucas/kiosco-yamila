// Devuelve las mejores coincidencias (por defecto 4).
// Ignora mayúsculas y tildes, y todas las palabras buscadas deben aparecer en el nombre.

const normalizar = texto =>
  texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

function puntuar(nombre, consulta) {
  const palabrasNombre = nombre.split(/\s+/);
  let puntos = nombre.startsWith(consulta) ? 5 : 0;

  for (const palabra of consulta.split(/\s+/)) {
    if (palabrasNombre.some(w => w.startsWith(palabra))) puntos += 3;
    else if (nombre.includes(palabra)) puntos += 1;
    else return 0;
  }
  return puntos;
}

export function buscarProductos(texto, productos, limite = 4) {
  const consulta = normalizar(texto);
  if (!consulta) return [];

  return productos
    .map(producto => ({ producto, puntos: puntuar(normalizar(producto.nombre), consulta) }))
    .filter(r => r.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos || a.producto.nombre.localeCompare(b.producto.nombre))
    .slice(0, limite)
    .map(r => r.producto);
}
// Arranque: muestra el login o la app según la sesión, y conecta las vistas.
import { iniciarVentas } from './vistas/ventas.js';
import { iniciarCC } from './vistas/cc.js';
import { iniciarResumen } from './vistas/resumen.js';
import * as db from './almacenamiento.js';
import * as store from './store.js';

const pantallaLogin = document.getElementById('login');
const app = document.getElementById('app');
const formLogin = document.getElementById('form-login');
const errorLogin = document.getElementById('error-login');
const botones = document.querySelectorAll('.tab');
const secciones = document.querySelectorAll('.seccion');

let vistasIniciadas = false;

// ---------- Navegación entre secciones ----------
function mostrarSeccion(nombre) {
  botones.forEach(b => b.classList.toggle('activa', b.dataset.seccion === nombre));
  secciones.forEach(s => s.classList.toggle('activa', s.id === nombre));
}
botones.forEach(b => b.addEventListener('click', () => mostrarSeccion(b.dataset.seccion)));

// ---------- Login ----------
formLogin.addEventListener('submit', async e => {
  e.preventDefault();
  errorLogin.textContent = '';
  const { email, password } = Object.fromEntries(new FormData(formLogin));
  try {
    await db.iniciarSesion(email.trim(), password);
  } catch {
    errorLogin.textContent = 'Email o contraseña incorrectos';
  }
});

document.getElementById('btn-salir').addEventListener('click', () => db.cerrarSesion());

// ---------- Arranque según sesión ----------
async function iniciarTodo() {
  try {
    await store.cargarDatos();
  } catch (e) {
    console.error(e);
    alert('No se pudieron cargar los datos. Revisá la conexión.');
  }
  if (!vistasIniciadas) {
    iniciarVentas(document.getElementById('ventas'));
    iniciarCC(document.getElementById('cc'));
    iniciarResumen(document.getElementById('resumen'));
    vistasIniciadas = true;
  }
}

db.alCambiarSesion((evento, sesion) => {
  // Fuera del callback de Supabase para evitar bloqueos
  setTimeout(async () => {
    if (!sesion) {
      app.hidden = true;
      pantallaLogin.hidden = false;
      return;
    }
    pantallaLogin.hidden = true;
    app.hidden = false;
    if (evento === 'INITIAL_SESSION' || evento === 'SIGNED_IN') await iniciarTodo();
  }, 0);
});

// Al volver a la pestaña se recargan los datos, así se ven las ventas hechas desde otro celular
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !app.hidden) {
    store.cargarDatos().catch(console.error);
  }
});
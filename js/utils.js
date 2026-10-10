export const pesos = monto =>
  '$ ' + Number(monto).toLocaleString('es-AR', { maximumFractionDigits: 0 });

export const esc = texto =>
  String(texto).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
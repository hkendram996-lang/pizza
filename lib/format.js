export const bs = n => 'Bs ' + Math.round(Number(n) || 0).toLocaleString('es-BO');

export const hhmm = t =>
  t ? new Date(t).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) : '';

export function since(t) {
  if (!t) return '';
  const s = Math.max(0, Math.floor((Date.now() - new Date(t).getTime()) / 1000));
  const m = Math.floor(s / 60);
  if (m >= 60) return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
  return m + ':' + String(s % 60).padStart(2, '0');
}

export const minutos = (a, b) =>
  a && b ? Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000) : null;

export function inicioDelDia(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Texto de los modificadores de una línea: "Borde relleno de queso, Sin cebolla"
export const extrasTxt = i => (Array.isArray(i && i.extras) ? i.extras : []).map(e => e.nombre).join(', ');

export const itemsTxt = o =>
  (o.order_items || []).map(i => i.cantidad + '× ' + i.nombre + (extrasTxt(i) ? ' (' + extrasTxt(i) + ')' : '')).join(', ');

// Orígenes de venta dentro del local (los demás llegan solos: WhatsApp, PedidosYa, etc.)
export const ORIGENES_LOCAL = ['Mostrador', 'Salón', 'Para llevar'];

// Nombre de canal apto para una clase CSS: "Para llevar" -> "Para-llevar", "Salón" -> "Salon"
export const claseCanal = c => String(c || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');

export const ESTADOS = [
  ['nuevo', 'Nuevos'],
  ['cocina', 'En cocina'],
  ['listo', 'Listos'],
  ['camino', 'En camino'],
  ['entregado', 'Entregados']
];

export function distanciaKm(a, b) {
  const R = 6371, rad = x => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Minutos estimados de llegada (moto en ciudad ~ 22 km/h)
export function etaMin(desde, hasta) {
  if (!desde || !hasta || desde.lat == null || hasta.lat == null) return null;
  return Math.max(1, Math.round((distanciaKm(desde, hasta) / 22) * 60));
}

// Lee coordenadas de "lat, lng" o de un link de Google Maps
export function leerUbicacion(txt) {
  if (!txt) return null;
  const m = txt.match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  return m ? { lat: parseFloat(m[1]), lng: parseFloat(m[2]) } : null;
}

// Minutos que le faltan al repartidor para llegar al local (null si no hay GPS reciente)
export function etaLocal(r, local, kmh = 22) {
  if (!r || r.lat == null || !local || !r.ubicado_at) return null;
  if (Date.now() - new Date(r.ubicado_at).getTime() > 10 * 60000) return null;
  return Math.max(0, Math.round(((distanciaKm(r, local) * 1.3) / Math.max(5, kmh)) * 60));
}
export const enLocal = (r, local) =>
  !!(r && r.lat != null && local && distanciaKm(r, local) <= 0.15);

// Minutos que faltan para que salga del horno (negativo = atrasado)
export const faltaMin = o =>
  o && o.listo_estimado ? Math.round((new Date(o.listo_estimado).getTime() - Date.now()) / 60000) : null;

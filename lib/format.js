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

export const itemsTxt = o =>
  (o.order_items || []).map(i => i.cantidad + '× ' + i.nombre).join(', ');

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

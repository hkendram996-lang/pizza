'use client';
import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

// Estilo del mapa: CARTO Voyager si hay clave (más limpio), si no OpenStreetMap estándar
const CARTO_KEY = process.env.NEXT_PUBLIC_CARTO_KEY;
const CAPA = CARTO_KEY
  ? {
      url: `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`,
      opts: {
        maxZoom: 20, maxNativeZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attribution/">CARTO</a>'
      }
    }
  : {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      opts: { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }
    };

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Íconos (estilos en línea para no depender de otros archivos)
const htmlLocal = () =>
  `<div style="width:46px;height:46px;border-radius:50%;background:#fbf8f3 var(--logo, none) center/cover no-repeat;border:3px solid #1f2b21;box-shadow:0 4px 14px rgba(0,0,0,.35);display:grid;place-items:center;font-size:20px"></div>`;

const htmlRider = (r) =>
  `<div style="position:relative;width:34px;height:34px">
     <div style="position:absolute;inset:-6px;border-radius:50%;background:${r.color};opacity:.22"></div>
     <div style="position:absolute;inset:0;border-radius:50%;background:${r.color};border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.35);display:grid;place-items:center;color:#fff;font:700 14px Outfit,system-ui,sans-serif">${esc((r.nombre || '?')[0])}</div>
   </div>`;

const htmlDestino = (d) =>
  `<div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-14px)">
     <div style="background:${d.color || '#7d7166'};color:#fff;font:700 11px Outfit,system-ui,sans-serif;padding:3px 7px;border-radius:999px;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);white-space:nowrap;display:flex;align-items:center;gap:3px">
       <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff"><path d="M12 3 2 12h3v8h5v-6h4v6h5v-8h3z"/></svg>${d.id ? '#' + esc(d.id) : ''}
     </div>
     <div style="width:2px;height:8px;background:${d.color || '#7d7166'}"></div>
     <div style="width:7px;height:7px;border-radius:50%;background:${d.color || '#7d7166'};border:2px solid #fff"></div>
   </div>`;

/**
 * Mapa real con el local, los repartidores y los destinos.
 * props: local {lat,lng}, zonas [{radio_km, nombre, tarifa}], repartidores [{id,nombre,color,lat,lng}],
 *        destinos [{id,lat,lng,color,etiqueta}], rutas [{desde,hasta,color}], alto, encuadrar
 */
export default function Mapa({ local, zonas = [], repartidores = [], destinos = [], rutas = [], alto = 520, encuadrar = false }) {
  const div = useRef(null);
  const ref = useRef({ map: null, L: null, capa: null, centrado: false });

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelado || !div.current || ref.current.map) return;
      const map = L.map(div.current, { zoomControl: true, attributionControl: true })
        .setView([local?.lat || -17.7838, local?.lng || -63.1812], 14);
      L.tileLayer(CAPA.url, CAPA.opts).addTo(map);
      map.attributionControl.setPrefix(false);
      ref.current = { map, L, capa: L.layerGroup().addTo(map), centrado: false };
      dibujar();
    })();
    return () => {
      cancelado = true;
      if (ref.current.map) {
        ref.current.map.remove();
        ref.current = { map: null, L: null, capa: null, centrado: false };
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { dibujar(); });

  function dibujar() {
    const { map, L, capa } = ref.current;
    if (!map || !L) return;
    capa.clearLayers();
    const icono = (html, w, h, ax, ay) => L.divIcon({ html, className: '', iconSize: [w, h], iconAnchor: [ax ?? w / 2, ay ?? h / 2] });
    const puntos = [];

    if (local && local.lat != null) {
      // Zonas de envío: anillos suaves en verde/terracota de la marca
      [...zonas].filter(z => z.activo !== false).sort((a, b) => b.radio_km - a.radio_km).forEach((z, i, arr) => {
        L.circle([local.lat, local.lng], {
          radius: Number(z.radio_km) * 1000,
          color: '#355038', weight: 1.2, opacity: 0.45, dashArray: '2 6',
          fillColor: '#a8532f', fillOpacity: 0.025 + (arr.length - i) * 0.012
        }).bindTooltip(`${esc(z.nombre)}${z.tarifa != null ? ' · Bs ' + Number(z.tarifa) : ''}`, { sticky: true }).addTo(capa);
      });
      L.marker([local.lat, local.lng], { icon: icono(htmlLocal(), 46, 46), zIndexOffset: 500 })
        .bindTooltip('Manechi · local', { direction: 'top', offset: [0, -24] }).addTo(capa);
      puntos.push([local.lat, local.lng]);
    }
    for (const r of rutas) {
      if (r.desde?.lat == null || r.hasta?.lat == null) continue;
      L.polyline([[r.desde.lat, r.desde.lng], [r.hasta.lat, r.hasta.lng]], {
        color: r.color || '#a8532f', weight: 4, opacity: 0.75, dashArray: '1 9', lineCap: 'round'
      }).addTo(capa);
    }
    for (const d of destinos) {
      if (d.lat == null) continue;
      L.marker([d.lat, d.lng], { icon: icono(htmlDestino(d), 70, 40, 35, 34), zIndexOffset: 200 })
        .bindTooltip(esc(d.etiqueta || '#' + d.id), { direction: 'top', offset: [0, -30] }).addTo(capa);
      puntos.push([d.lat, d.lng]);
    }
    for (const r of repartidores) {
      if (r.lat == null) continue;
      L.marker([r.lat, r.lng], { icon: icono(htmlRider(r), 34, 34), zIndexOffset: 1000 })
        .bindTooltip(esc(r.nombre), { direction: 'top', offset: [0, -18] }).addTo(capa);
      puntos.push([r.lat, r.lng]);
    }
    if (encuadrar && !ref.current.centrado && puntos.length > 1) {
      map.fitBounds(puntos, { padding: [50, 50], maxZoom: 15 });
      ref.current.centrado = true;
    }
  }

  return <div ref={div} className="mapa" style={{ height: alto }} />;
}

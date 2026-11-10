'use client';
import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

/**
 * Mapa real (OpenStreetMap) con el local, los repartidores y los destinos.
 * props:
 *  local: {lat, lng}
 *  zonas: [{radio_km}]
 *  repartidores: [{id, nombre, color, lat, lng}]
 *  destinos: [{id, lat, lng, color, etiqueta}]
 *  rutas: [{desde:{lat,lng}, hasta:{lat,lng}, color}]
 *  alto: número de píxeles
 */
export default function Mapa({ local, zonas = [], repartidores = [], destinos = [], rutas = [], alto = 520, encuadrar = false }) {
  const div = useRef(null);
  const ref = useRef({ map: null, L: null, capa: null, centrado: false });

  // Crear el mapa una sola vez
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelado || !div.current || ref.current.map) return;
      const map = L.map(div.current, { zoomControl: true }).setView([local?.lat || -17.7838, local?.lng || -63.1812], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);
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

  // Redibujar cuando cambian los datos
  useEffect(() => { dibujar(); });

  function dibujar() {
    const { map, L, capa } = ref.current;
    if (!map || !L) return;
    capa.clearLayers();
    const icono = (html, cls, size) => L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
    const puntos = [];

    if (local && local.lat != null) {
      [...zonas].sort((a, b) => b.radio_km - a.radio_km).forEach((z, i) => {
        L.circle([local.lat, local.lng], {
          radius: Number(z.radio_km) * 1000, color: '#d6402b', weight: 1, opacity: 0.35,
          fillOpacity: 0.04 + i * 0.015, dashArray: '4 6'
        }).addTo(capa);
      });
      L.marker([local.lat, local.lng], { icon: icono('<div class="pin local">🍕</div>', '', 32), zIndexOffset: 500 })
        .bindTooltip('Local').addTo(capa);
      puntos.push([local.lat, local.lng]);
    }
    for (const r of rutas) {
      if (r.desde?.lat == null || r.hasta?.lat == null) continue;
      L.polyline([[r.desde.lat, r.desde.lng], [r.hasta.lat, r.hasta.lng]], { color: r.color || '#d6402b', weight: 3, opacity: 0.7, dashArray: '7 8' }).addTo(capa);
    }
    for (const d of destinos) {
      if (d.lat == null) continue;
      L.marker([d.lat, d.lng], { icon: icono(`<div class="pin dest" style="background:${d.color || '#a39686'}"></div>`, '', 14) })
        .bindTooltip(d.etiqueta || '#' + d.id).addTo(capa);
      puntos.push([d.lat, d.lng]);
    }
    for (const r of repartidores) {
      if (r.lat == null) continue;
      L.marker([r.lat, r.lng], { icon: icono(`<div class="pin" style="background:${r.color}">${(r.nombre || '?')[0]}</div>`, '', 26), zIndexOffset: 1000 })
        .bindTooltip(r.nombre).addTo(capa);
      puntos.push([r.lat, r.lng]);
    }
    if (encuadrar && !ref.current.centrado && puntos.length > 1) {
      map.fitBounds(puntos, { padding: [40, 40], maxZoom: 15 });
      ref.current.centrado = true;
    }
  }

  return <div ref={div} className="mapa" style={{ height: alto }} />;
}

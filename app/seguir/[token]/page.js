'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { etaMin, hhmm } from '@/lib/format';

const Mapa = dynamic(() => import('@/components/Mapa'), { ssr: false });

const PASOS = [
  ['creado', 'Recibido'],
  ['cocina', 'En preparación'],
  ['camino', 'En camino'],
  ['entregado', 'Entregado']
];

// Página pública que recibe el cliente para seguir su pedido
export default function Seguir({ params }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      const res = await fetch('/api/seguir/' + params.token, { cache: 'no-store' });
      if (!vivo) return;
      if (!res.ok) { setError('No encontramos este pedido'); return; }
      setD(await res.json());
    };
    cargar();
    const iv = setInterval(cargar, 8000);
    return () => { vivo = false; clearInterval(iv); };
  }, [params.token]);

  if (error) return <div className="center"><div className="authbox"><h1>😕</h1><p>{error}</p></div></div>;
  if (!d) return <div className="center mute">Cargando tu pedido…</div>;
  const { pedido: p, repartidor: r, local } = d;
  const eta = r && p.destino ? etaMin(r, p.destino) : null;

  return (
    <div className="rider-app">
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="logo">🍕</div>
        <div><b style={{ fontSize: 18 }}>{local ? local.nombre : 'Tu pizzería'}</b><div className="mute">Pedido #{p.id}</div></div>
      </div>
      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 19 }}>
          {p.estado === 'entregado' ? '¡Pedido entregado! Buen provecho 🍕'
            : p.estado === 'camino' ? (eta ? `Llega en ~${eta} min 🛵` : 'Tu pedido va en camino 🛵')
            : p.estado === 'cancelado' ? 'Pedido cancelado'
            : `Hola ${p.nombre}, estamos preparando tu pedido`}
        </h3>
        {PASOS.map(([k, l]) => (
          <div key={k} className="sumrow">
            <span style={{ opacity: p[k] ? 1 : 0.4 }}>{p[k] ? '✅' : '⚪'} {l}</span>
            <span className="mute">{hhmm(p[k])}</span>
          </div>
        ))}
        {r && <div className="mute" style={{ marginTop: 8 }}>Te lo lleva <b style={{ color: 'var(--ink)' }}>{r.nombre}</b></div>}
      </div>
      {local && p.tipo === 'delivery' && p.estado !== 'entregado' && (
        <Mapa local={local} alto={360} encuadrar
          repartidores={r && r.lat != null ? [r] : []}
          destinos={p.destino ? [{ id: p.id, ...p.destino, color: '#2f8a58', etiqueta: 'Tu ubicación' }] : []}
        />
      )}
      <div className="card" style={{ marginTop: 12 }}>
        <h3>Tu pedido</h3>
        {(p.items || []).map((i, n) => <div key={n} className="sumrow"><span>{i.cantidad}× {i.nombre}</span></div>)}
      </div>
    </div>
  );
}

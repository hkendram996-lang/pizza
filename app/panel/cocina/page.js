'use client';
import { useEffect, useRef } from 'react';
import { useDatos, useReloj, useToast } from '@/components/Datos';
import { Header } from '@/components/UI';
import { accion } from '@/lib/supabaseClient';
import { since, minutos } from '@/lib/format';

export default function Cocina() {
  useReloj();
  const { orders } = useDatos();
  const { toast, Toasts } = useToast();
  const lista = orders.filter(o => o.estado === 'cocina').sort((a, b) => new Date(a.cocina_at) - new Date(b.cocina_at));

  // Sonido cuando entra un pedido nuevo a cocina
  const vistos = useRef(null);
  useEffect(() => {
    const ids = new Set(lista.map(o => o.id));
    if (vistos.current && [...ids].some(id => !vistos.current.has(id))) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination); osc.frequency.value = 880; g.gain.value = 0.15;
        osc.start(); osc.stop(ctx.currentTime + 0.35);
      } catch { /* el navegador puede bloquear el audio hasta el primer clic */ }
    }
    vistos.current = ids;
  }, [lista]);

  async function listo(id) {
    try {
      const r = await accion('listo', { orderId: id });
      toast(r.asignados && r.asignados.length ? '🛵 Repartidor asignado' : '✓ Pedido #' + id + ' listo');
    } catch (e) { toast('⚠️ ' + e.message); }
  }

  return (
    <>
      <Header titulo="Cocina" sub={'Pantalla de comandas · ' + lista.length + ' en preparación'} />
      {lista.length ? (
        <div className="kds">
          {lista.map(o => {
            const m = minutos(o.cocina_at, Date.now());
            return (
              <div key={o.id} className={'tk ' + (m > 15 ? 'late' : m > 10 ? 'warn' : '')}>
                <div className="th"><b>#{o.id}</b><span className="tm mono">{since(o.cocina_at)}</span></div>
                <ul>
                  {(o.order_items || []).map(i => (
                    <li key={i.id}><b>{i.cantidad}×</b> {i.nombre}{i.nota && <div style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {i.nota}</div>}</li>
                  ))}
                  {o.nota && <li style={{ color: 'var(--amber)', fontSize: 13 }}>📝 {o.nota}</li>}
                </ul>
                <div className="tf">
                  <span className="mute">{o.tipo === 'delivery' ? '🛵 Delivery' : '🏠 Mostrador'} · {o.canal}</span>
                  <button className="btn ok" onClick={() => listo(o.id)}>✓ Listo</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : <div className="card empty">No hay pedidos en cocina 🎉</div>}
      <div className="legend" style={{ marginTop: 16 }}>
        <span><i style={{ background: 'var(--green2)', border: '1px solid var(--green)' }} />Menos de 10 min</span>
        <span><i style={{ background: 'var(--amber2)', border: '1px solid var(--amber)' }} />10 a 15 min</span>
        <span><i style={{ background: 'var(--red2)', border: '1px solid var(--red)' }} />Más de 15 min</span>
      </div>
      <Toasts />
    </>
  );
}

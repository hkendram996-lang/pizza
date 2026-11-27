'use client';
import { useEffect, useRef } from 'react';
import { useDatos, useReloj, useToast } from '@/components/Datos';
import { Header } from '@/components/UI';
import { accion } from '@/lib/supabaseClient';
import { since, minutos, etaLocal, enLocal, faltaMin, extrasTxt } from '@/lib/format';
import { alerta, desbloquear } from '@/lib/sonido';

export default function Cocina() {
  useReloj();
  const { orders, riders, settings } = useDatos();
  const { toast, Toasts } = useToast();
  const lista = orders.filter(o => o.estado === 'cocina').sort((a, b) => new Date(a.cocina_at) - new Date(b.cocina_at));
  const local = settings ? { lat: settings.local_lat, lng: settings.local_lng } : null;
  const kmh = settings ? Number(settings.velocidad_kmh) || 22 : 22;

  // Sonido cuando entra un pedido nuevo a cocina
  const vistos = useRef(null);
  useEffect(() => {
    const ids = new Set(lista.map(o => o.id));
    if (vistos.current && [...ids].some(id => !vistos.current.has(id))) alerta('suave');
    vistos.current = ids;
  }, [lista]);

  // Cada 30 s revisa si ya es hora de llamar a un repartidor
  useEffect(() => {
    const iv = setInterval(() => { accion('asignar').catch(() => {}); }, 30000);
    return () => clearInterval(iv);
  }, []);

  async function listo(o) {
    try {
      await accion('listo', { orderId: o.id });
      const r = riders.find(x => x.id === o.rider_id);
      toast(o.tipo !== 'delivery' ? '✓ Pedido #' + o.id + ' listo'
        : r ? (enLocal(r, local) ? '🛵 ' + r.nombre + ' ya está esperando' : '🛵 ' + r.nombre + ' está llegando')
        : '✓ Listo · buscando repartidor');
    } catch (e) { toast('⚠️ ' + e.message); }
  }
  async function demora(id) {
    try { await accion('demora', { orderId: id, minutos: 5 }); toast('⏱ +5 min · el repartidor se ajusta solo'); }
    catch (e) { toast('⚠️ ' + e.message); }
  }

  function lineaRider(o) {
    if (o.tipo !== 'delivery') return null;
    const r = riders.find(x => x.id === o.rider_id);
    if (!r) return <div className="mute" style={{ fontSize: 13 }}>🛵 Se llamará al repartidor a tiempo</div>;
    if (enLocal(r, local)) return <div style={{ fontSize: 13, color: 'var(--green)' }}><b>✅ {r.nombre} ya está en el local</b></div>;
    const eta = etaLocal(r, local, kmh);
    return <div style={{ fontSize: 13 }}>🛵 <b>{r.nombre}</b> viene al local{eta != null ? ' · llega en ~' + eta + ' min' : ''}</div>;
  }

  return (
    <div onClick={desbloquear}>
      <Header titulo="Cocina" sub={'Pantalla de comandas · ' + lista.length + ' en preparación'} />
      {lista.length ? (
        <div className="kds">
          {lista.map(o => {
            const m = minutos(o.cocina_at, Date.now());
            const f = faltaMin(o);
            return (
              <div key={o.id} className={'tk ' + (m > 15 ? 'late' : m > 10 ? 'warn' : '')}>
                <div className="th"><b>#{o.id}</b><span className="tm mono">{since(o.cocina_at)}</span></div>
                {f != null && (
                  <div style={{ fontSize: 13, padding: '2px 0 6px', fontWeight: 600, color: f < 0 ? 'var(--red)' : 'inherit' }}>
                    {f > 0 ? '⏳ Debe salir en ~' + f + ' min' : f === 0 ? '⏳ Debe salir ahora' : '⚠ Atrasado ' + -f + ' min'}
                  </div>
                )}
                <ul>
                  {(o.order_items || []).map(i => (
                    <li key={i.id}><b>{i.cantidad}×</b> {i.nombre}{extrasTxt(i) && <span className="ext">+ {extrasTxt(i)}</span>}{i.nota && <div style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {i.nota}</div>}</li>
                  ))}
                  {o.nota && <li style={{ color: 'var(--amber)', fontSize: 13 }}>📝 {o.nota}</li>}
                </ul>
                {lineaRider(o)}
                <div className="tf">
                  <span className="mute">{o.tipo === 'delivery' ? '🛵 Delivery' : o.mesa ? '🌿 Mesa ' + o.mesa + (o.canal !== 'Salón' ? ' · ' + o.canal : '') : o.canal === 'Para llevar' ? '🥡 Para llevar' : '🏠 ' + o.canal}{o.tipo === 'delivery' ? ' · ' + o.canal : ''}</span>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn sm" title="Avisar que tarda 5 minutos más" onClick={() => demora(o.id)}>+5 min</button>
                    <button className="btn ok" onClick={() => listo(o)}>✓ Listo</button>
                  </div>
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
        <span>“+5 min” avisa una demora: el repartidor se llama más tarde</span>
      </div>
      <Toasts />
    </div>
  );
}

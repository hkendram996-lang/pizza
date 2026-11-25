'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useDatos, useReloj } from '@/components/Datos';
import { Header } from '@/components/UI';
import { accion } from '@/lib/supabaseClient';
import { bs, etaMin, since, etaLocal, enLocal, faltaMin } from '@/lib/format';

const Mapa = dynamic(() => import('@/components/Mapa'), { ssr: false });
const ESTADO = { libre: 'Libre', ocupado: 'Ocupado', desconectado: 'Desconectado' };
const CLS = { libre: 'st-libre', ocupado: 'st-yendo', desconectado: 'st-volviendo' };

export default function Delivery() {
  useReloj(5000);
  const { orders, riders, zones, settings } = useDatos();
  const [msg, setMsg] = useState('');
  // Cada 30 s revisa si ya es hora de llamar a un repartidor
  useEffect(() => {
    const iv = setInterval(() => { accion('asignar').catch(() => {}); }, 30000);
    return () => clearInterval(iv);
  }, []);
  if (!settings) return null;
  const local = { lat: settings.local_lat, lng: settings.local_lng };
  const kmh = Number(settings.velocidad_kmh) || 22;
  const enRuta = orders.filter(o => o.estado === 'camino');
  const espera = orders.filter(o => o.estado === 'listo' && o.tipo === 'delivery');
  const prep = orders.filter(o => ['nuevo', 'cocina'].includes(o.estado) && o.tipo === 'delivery');
  const pendientes = [...espera, ...prep];
  const color = id => (riders.find(r => r.id === id) || {}).color;
  const conectados = riders.filter(r => r.activo && r.estado !== 'desconectado' && !enRuta.some(o => o.rider_id === r.id));

  async function hacer(nombre, datos) {
    setMsg('');
    try { await accion(nombre, datos); } catch (e) { setMsg(e.message); }
  }

  // Qué está haciendo cada repartidor ahora
  function fase(r) {
    const mios = orders.filter(o => o.rider_id === r.id && ['nuevo', 'cocina', 'listo', 'camino'].includes(o.estado));
    const calle = mios.filter(o => o.estado === 'camino');
    const porRecoger = mios.filter(o => o.estado !== 'camino');
    if (calle.length) {
      const o = calle[0]; const eta = etaMin(r, o);
      return { txt: 'En camino: ' + calle.map(x => '#' + x.id).join(' + ') + (eta ? ' · ~' + eta + ' min al cliente' : ''), cls: 'st-yendo', st: 'En camino' };
    }
    if (porRecoger.length) {
      const listos = porRecoger.filter(o => o.estado === 'listo').length;
      const ped = porRecoger.map(x => '#' + x.id).join(' + ');
      if (enLocal(r, local)) return { txt: 'En el local esperando ' + ped + (listos ? ' · ' + listos + ' lista(s)' : ''), cls: 'st-libre', st: 'En el local', salir: listos > 0 };
      const eta = etaLocal(r, local, kmh);
      return { txt: 'Viene al local por ' + ped + (eta != null ? ' · llega en ~' + eta + ' min' : ''), cls: 'st-volviendo', st: 'Llamado', salir: listos > 0 };
    }
    return { txt: r.estado === 'libre' ? 'Disponible' : '—', cls: CLS[r.estado], st: ESTADO[r.estado] };
  }

  return (
    <>
      <Header titulo="Delivery y mapa" sub="Ubicación de los repartidores en tiempo real" />
      <div className="split" style={{ gridTemplateColumns: 'minmax(0,1fr) 330px' }}>
        <div className="card" style={{ padding: 10 }}>
          <Mapa
            local={local} zonas={zones} alto={600} encuadrar
            repartidores={riders.filter(r => r.estado !== 'desconectado')}
            destinos={[
              ...enRuta.map(o => ({ id: o.id, lat: o.lat, lng: o.lng, color: color(o.rider_id), etiqueta: '#' + o.id + ' · ' + o.cliente_nombre })),
              ...[...espera, ...prep].map(o => ({ id: o.id, lat: o.lat, lng: o.lng, color: '#a39686', etiqueta: '#' + o.id + ' (en preparación)' }))
            ]}
            rutas={enRuta.map(o => {
              const r = riders.find(x => x.id === o.rider_id);
              return { desde: r && r.lat != null ? r : local, hasta: o, color: color(o.rider_id) };
            })}
          />
          <div className="legend">
            <span>🍕 Local</span><span><i style={{ background: '#a39686' }} />Pedido en preparación</span>
            <span>Punto de color = pedido en camino (color del repartidor)</span><span>Círculos = zonas de envío</span>
          </div>
        </div>
        <div className="grid">
          <div className="card rider-list">
            <h3>Repartidores</h3>
            {riders.filter(r => r.activo).map(r => {
              const f = fase(r);
              return (
                <div key={r.id} className="rr">
                  <div className="av" style={{ background: r.color }}>{r.nombre[0]}</div>
                  <div style={{ flex: 1 }}>
                    <b>{r.nombre}</b>
                    <div className="mute" style={{ fontSize: 12 }}>
                      {f.txt}
                      {r.ubicado_at && <> · GPS hace {since(r.ubicado_at)}</>}
                    </div>
                    {f.salir && <button className="btn sm ok" style={{ marginTop: 4 }} onClick={() => hacer('salir', { riderId: r.id })}>Marcar que salió</button>}
                  </div>
                  <span className={'st ' + f.cls}>{f.st}</span>
                </div>
              );
            })}
            {!riders.length && <div className="empty">Agrega repartidores en Ajustes</div>}
          </div>
          <div className="card">
            <h3>Cola de despacho</h3>
            {msg && <div className="error">{msg}</div>}
            {pendientes.map(o => {
              const f = faltaMin(o);
              const r = riders.find(x => x.id === o.rider_id);
              const estado = o.estado === 'listo' ? <b style={{ color: r ? 'var(--green)' : 'var(--red)' }}>✅ Lista{r ? '' : ' · sin repartidor'}</b>
                : o.estado === 'nuevo' ? <span className="mute">Sin confirmar</span>
                : <span className="mute">Horno{f != null ? (f >= 0 ? ' · sale en ~' + f + ' min' : ' · atrasada ' + -f + ' min') : ''}</span>;
              return (
                <div key={o.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line, #eee)' }}>
                  <div className="sumrow" style={{ border: 0, padding: 0 }}><span>#{o.id} · {o.cliente_nombre}</span>{estado}</div>
                  <div className="row" style={{ gap: 6, marginTop: 4, fontSize: 12.5 }}>
                    <span style={{ flex: 1 }}>{r ? <>🛵 <b>{r.nombre}</b>{o.asignacion === 'agrupado' ? ' (mismo viaje)' : o.asignacion === 'manual' ? ' (a mano)' : ''}</> : <span className="mute">Se asigna solo a tiempo</span>}</span>
                    <select className="input" style={{ width: 'auto', padding: '3px 6px', fontSize: 12.5 }} value=""
                      onChange={e => e.target.value === 'quitar' ? hacer('desasignar', { orderId: o.id }) : e.target.value && hacer('asignar_a', { orderId: o.id, riderId: Number(e.target.value) })}>
                      <option value="">Asignar a…</option>
                      {conectados.filter(x => x.id !== o.rider_id).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                      {r && <option value="quitar">Quitar a {r.nombre}</option>}
                    </select>
                  </div>
                </div>
              );
            })}
            {!pendientes.length && <div className="empty">Sin envíos pendientes</div>}
          </div>
          <div className="card">
            <h3>Tarifas por zona</h3>
            {zones.filter(z => z.activo).map(z => <div key={z.id} className="sumrow"><span>{z.nombre}</span><b>{bs(z.tarifa)}</b></div>)}
          </div>
        </div>
      </div>
    </>
  );
}

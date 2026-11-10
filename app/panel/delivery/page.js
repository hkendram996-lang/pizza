'use client';
import dynamic from 'next/dynamic';
import { useDatos, useReloj } from '@/components/Datos';
import { Header } from '@/components/UI';
import { bs, etaMin, since } from '@/lib/format';

const Mapa = dynamic(() => import('@/components/Mapa'), { ssr: false });
const ESTADO = { libre: 'Libre', ocupado: 'Entregando', desconectado: 'Desconectado' };
const CLS = { libre: 'st-libre', ocupado: 'st-yendo', desconectado: 'st-volviendo' };

export default function Delivery() {
  useReloj(5000);
  const { orders, riders, zones, settings } = useDatos();
  if (!settings) return null;
  const local = { lat: settings.local_lat, lng: settings.local_lng };
  const enRuta = orders.filter(o => o.estado === 'camino');
  const espera = orders.filter(o => o.estado === 'listo' && o.tipo === 'delivery');
  const prep = orders.filter(o => ['nuevo', 'cocina'].includes(o.estado) && o.tipo === 'delivery');
  const color = id => (riders.find(r => r.id === id) || {}).color;

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
              const o = enRuta.find(x => x.rider_id === r.id);
              const eta = o ? etaMin(r, o) : null;
              return (
                <div key={r.id} className="rr">
                  <div className="av" style={{ background: r.color }}>{r.nombre[0]}</div>
                  <div style={{ flex: 1 }}>
                    <b>{r.nombre}</b>
                    <div className="mute" style={{ fontSize: 12 }}>
                      {o ? '#' + o.id + ' · ' + o.cliente_nombre + (eta ? ' · ~' + eta + ' min' : '') : r.estado === 'libre' ? 'Disponible' : '—'}
                      {r.ubicado_at && <> · GPS hace {since(r.ubicado_at)}</>}
                    </div>
                  </div>
                  <span className={'st ' + CLS[r.estado]}>{ESTADO[r.estado]}</span>
                </div>
              );
            })}
            {!riders.length && <div className="empty">Agrega repartidores en Ajustes</div>}
          </div>
          <div className="card">
            <h3>Cola de despacho</h3>
            {espera.map(o => <div key={o.id} className="sumrow"><span>#{o.id} · {o.cliente_nombre}</span><b style={{ color: 'var(--red)' }}>Esperando</b></div>)}
            {prep.map(o => <div key={o.id} className="sumrow"><span>#{o.id} · {o.cliente_nombre}</span><span className="mute">En cocina</span></div>)}
            {!espera.length && !prep.length && <div className="empty">Sin envíos pendientes</div>}
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

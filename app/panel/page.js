'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useDatos } from '@/components/Datos';
import { Header, Kpi } from '@/components/UI';
import { bs, minutos } from '@/lib/format';

const Mapa = dynamic(() => import('@/components/Mapa'), { ssr: false });

export default function Inicio() {
  const { orders, riders, zones, settings, products, escalados, caja, perfil } = useDatos();
  const hoy = orders.filter(o => new Date(o.created_at) >= new Date(new Date().setHours(0, 0, 0, 0)) && o.estado !== 'cancelado');
  const pagados = hoy.filter(o => o.pagado);
  const ventas = pagados.reduce((s, o) => s + Number(o.total), 0);
  const activos = orders.filter(o => ['nuevo', 'cocina', 'listo', 'camino'].includes(o.estado));
  const entregas = hoy.filter(o => o.tipo === 'delivery' && o.entregado_at);
  const tEnt = entregas.length ? entregas.reduce((s, o) => s + minutos(o.created_at, o.entregado_at), 0) / entregas.length : 0;
  const ia = hoy.filter(o => o.ia).length;

  const horas = {};
  pagados.forEach(o => { const h = new Date(o.created_at).getHours(); horas[h] = (horas[h] || 0) + Number(o.total); });
  const hs = Object.keys(horas).map(Number).sort((a, b) => a - b);
  const hmax = Math.max(1, ...Object.values(horas));

  const alertas = [];
  if (!caja) alertas.push(['var(--red)', <>La caja está cerrada. <Link href="/panel/caja">Abrir caja</Link></>]);
  escalados.forEach(c => alertas.push(['var(--red)', <>{c.nombre || c.telefono} necesita atención humana: {c.escalado_motivo} · <Link href={'/panel/pedidos?tel=' + c.telefono}>Ver chat</Link></>]));
  orders.filter(o => o.estado === 'cocina' && minutos(o.cocina_at, Date.now()) > 15)
    .forEach(o => alertas.push(['var(--amber)', 'Pedido #' + o.id + ' lleva más de 15 min en cocina']));
  orders.filter(o => o.estado === 'nuevo' && minutos(o.created_at, Date.now()) > 5)
    .forEach(o => alertas.push(['var(--amber)', 'Pedido #' + o.id + ' espera confirmación hace más de 5 min']));
  if (!riders.some(r => r.estado === 'libre')) alertas.push(['var(--amber)', 'No hay repartidores libres en este momento']);
  const off = products.filter(p => !p.activo).length;
  if (off) alertas.push(['var(--mute)', off + ' producto(s) desactivado(s): el agente no los ofrece']);
  if (hoy.length) alertas.push(['var(--green)', 'El agente IA tomó ' + Math.round((ia / hoy.length) * 100) + '% de los pedidos de hoy']);

  const local = settings ? { lat: settings.local_lat, lng: settings.local_lng } : null;
  const enRuta = orders.filter(o => o.estado === 'camino');

  return (
    <>
      <Header titulo={'Hola, ' + (perfil.nombre || '') + ' 👋'} sub={'Resumen del día · ' + new Date().toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' })} />
      <div className="kpis">
        <Kpi l="Ventas de hoy" v={bs(ventas)} d={pagados.length + ' pedidos cobrados'} />
        <Kpi l="Pedidos de hoy" v={hoy.length} d={activos.length + ' activos ahora'} />
        <Kpi l="Ticket promedio" v={bs(pagados.length ? ventas / pagados.length : 0)} />
        <Kpi l="Tiempo prom. de entrega" v={tEnt ? Math.round(tEnt) + ' min' : '—'} d={<span className={tEnt && tEnt > 40 ? 'down' : 'up'}>Meta: menos de 40 min</span>} />
        <Kpi l="Tomados por el agente IA" v={hoy.length ? Math.round((ia / hoy.length) * 100) + '%' : '—'} d="WhatsApp" />
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.25fr) minmax(0,1fr)' }}>
        <div className="card">
          <h3>Envíos en tiempo real <Link href="/panel/delivery" className="mute" style={{ marginLeft: 'auto', fontSize: 13 }}>Abrir mapa →</Link></h3>
          {local && (
            <Mapa local={local} zonas={zones} alto={380}
              repartidores={riders.filter(r => r.estado !== 'desconectado')}
              destinos={enRuta.map(o => ({ id: o.id, lat: o.lat, lng: o.lng, color: (riders.find(r => r.id === o.rider_id) || {}).color }))}
            />
          )}
        </div>
        <div className="grid">
          <div className="card">
            <h3>Ventas por hora</h3>
            {hs.length ? (
              <div className="bars" style={{ height: 150 }}>
                {hs.map(h => (
                  <div key={h} className={'bar' + (h === new Date().getHours() ? ' today' : '')}>
                    <span className="lab">{(Math.round(horas[h] / 100) / 10) + 'k'}</span>
                    <div className="bv" style={{ height: (horas[h] / hmax) * 100 + '%' }} />
                    <small>{h}h</small>
                  </div>
                ))}
              </div>
            ) : <div className="empty">Todavía no hay ventas hoy</div>}
          </div>
          <div className="card">
            <h3>Alertas</h3>
            {alertas.length ? alertas.map((a, i) => (
              <div key={i} className="alert"><i style={{ background: a[0] }} /><div>{a[1]}</div></div>
            )) : <div className="empty">Todo en orden ✅</div>}
          </div>
        </div>
      </div>
    </>
  );
}

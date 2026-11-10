'use client';
import { useEffect, useState } from 'react';
import { useDatos, useReloj, useToast } from '@/components/Datos';
import { Header, Canal, Modal } from '@/components/UI';
import Chat from '@/components/Chat';
import { accion, supabase } from '@/lib/supabaseClient';
import { bs, since, itemsTxt, ESTADOS, minutos, etaMin, leerUbicacion } from '@/lib/format';

export default function Pedidos() {
  useReloj();
  const { orders, riders, escalados, products } = useDatos();
  const [sel, setSel] = useState(null);
  const [telChat, setTelChat] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const { toast, Toasts } = useToast();

  useEffect(() => {
    const tel = new URLSearchParams(window.location.search).get('tel');
    if (tel) setTelChat(tel);
  }, []);

  const pedido = orders.find(o => o.id === sel);
  const [cliente, setCliente] = useState(null);
  const tel = pedido ? pedido.telefono : telChat;
  useEffect(() => {
    if (!tel) { setCliente(null); return; }
    supabase.from('customers').select('*').eq('telefono', tel).maybeSingle().then(({ data }) => setCliente(data));
  }, [tel, escalados]);

  async function hacer(nombre, orderId, extra) {
    try {
      const r = await accion(nombre, { orderId, ...extra });
      if (nombre === 'listo' && r.asignados && r.asignados.length) toast('🛵 Repartidor asignado al pedido #' + r.asignados.join(', #'));
      else if (nombre === 'listo') toast('Listo. Se asignará cuando haya un repartidor libre');
    } catch (e) { toast('⚠️ ' + e.message); }
  }

  function Tarjeta({ o }) {
    const r = riders.find(x => x.id === o.rider_id);
    let act = null;
    if (o.estado === 'nuevo') act = (
      <button className="btn sm pri" onClick={e => {
        e.stopPropagation();
        const pagado = o.metodo_pago !== 'Efectivo' && o.tipo === 'delivery' ? window.confirm('¿Ya verificaste el pago por ' + o.metodo_pago + '? (Aceptar = sí, cobrado)') : o.tipo === 'mostrador';
        hacer('cocina', o.id, { pagado });
      }}>A cocina</button>
    );
    else if (o.estado === 'cocina') act = <button className="btn sm" onClick={e => { e.stopPropagation(); hacer('listo', o.id); }}>Listo</button>;
    else if (o.estado === 'listo' && o.tipo === 'mostrador') act = <button className="btn sm ok" onClick={e => { e.stopPropagation(); hacer('entregar', o.id); }}>Entregar</button>;
    else if (o.estado === 'listo') act = <span className="since">Esperando repartidor</span>;
    else if (o.estado === 'camino') act = <span className="since">🛵 {r ? r.nombre : ''}{r && etaMin(r, o) ? ' · ~' + etaMin(r, o) + ' min' : ''}</span>;
    else if (o.estado === 'entregado') act = <span className="since">{o.tipo === 'delivery' ? minutos(o.created_at, o.entregado_at) + ' min' : ''}</span>;
    return (
      <div className={'oc' + (sel === o.id ? ' sel' : '')} onClick={() => { setSel(o.id); setTelChat(null); }}>
        <div className="h"><b>#{o.id}</b><span className="since">{since(o.created_at)}</span></div>
        <div className="chips">
          <Canal c={o.canal} />
          {o.ia && <span className="chip ia">IA</span>}
          <span className="chip pay">{o.metodo_pago}{o.pagado ? ' ✓' : ''}</span>
        </div>
        <div className="who">{o.cliente_nombre}</div>
        <div className="it">{itemsTxt(o)}{o.nota && <><br /><b style={{ color: 'var(--amber)' }}>{o.nota}</b></>}</div>
        <div className="f"><span className="tot">{bs(o.total)}</span>{act}</div>
      </div>
    );
  }

  return (
    <>
      <Header titulo="Pedidos" sub="Todos los canales en una sola bandeja">
        <button className="btn pri" onClick={() => setNuevo(true)}>+ Pedido manual</button>
      </Header>
      {escalados.length > 0 && (
        <div className="card" style={{ marginBottom: 14, borderColor: 'var(--red)' }}>
          <h3>🙋 Clientes esperando a una persona</h3>
          <div className="row">
            {escalados.map(c => (
              <button key={c.id} className="btn sm" onClick={() => { setTelChat(c.telefono); setSel(null); }}>
                {c.nombre || c.telefono} — {c.escalado_motivo}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="split">
        <div className="kanban">
          {ESTADOS.map(([e, l]) => {
            let lista = orders.filter(o => o.estado === e);
            const total = lista.length;
            if (e === 'entregado') lista = lista.slice(-8).reverse();
            return (
              <div key={e} className="col">
                <h4>{l}<span>{total}</span></h4>
                {lista.length ? lista.map(o => <Tarjeta key={o.id} o={o} />) : <div className="empty">Sin pedidos</div>}
              </div>
            );
          })}
        </div>
        <div className="card" style={{ position: 'sticky', top: 16 }}>
          {pedido ? <Detalle o={pedido} hacer={hacer} /> : telChat ? <h3>Conversación · {telChat}</h3> : <div className="empty">Selecciona un pedido para ver el detalle y la conversación</div>}
          {tel && <><h3 style={{ marginTop: 18 }}>💬 WhatsApp</h3><Chat telefono={tel} cliente={cliente} /></>}
        </div>
      </div>
      {nuevo && <NuevoPedido productos={products.filter(p => p.activo)} cerrar={() => setNuevo(false)} toast={toast} />}
      <Toasts />
    </>
  );
}

function Detalle({ o, hacer }) {
  return (
    <>
      <h3>Pedido #{o.id} <Canal c={o.canal} /></h3>
      <div className="sumrow"><span className="mute">Cliente</span><b>{o.cliente_nombre}</b></div>
      {o.telefono && <div className="sumrow"><span className="mute">Teléfono</span><span>+{o.telefono}</span></div>}
      {o.direccion && <div className="sumrow"><span className="mute">Dirección</span><span style={{ textAlign: 'right' }}>{o.direccion}</span></div>}
      {o.lat != null && <div className="sumrow"><span className="mute">Mapa</span><a href={`https://www.google.com/maps?q=${o.lat},${o.lng}`} target="_blank" rel="noreferrer">Ver ubicación ↗</a></div>}
      {(o.order_items || []).map(i => (
        <div key={i.id} className="sumrow"><span>{i.cantidad}× {i.nombre}{i.nota ? <em className="mute"> ({i.nota})</em> : null}</span><span>{bs(i.precio * i.cantidad)}</span></div>
      ))}
      {Number(o.envio) > 0 && <div className="sumrow"><span>Envío</span><span>{bs(o.envio)}</span></div>}
      <div className="bigtot" style={{ fontSize: 17 }}><span>Total</span><span>{bs(o.total)}</span></div>
      <div className="row" style={{ marginTop: 12 }}>
        {!o.pagado && o.estado !== 'cancelado' && <button className="btn sm" onClick={() => hacer('cobrar', o.id)}>Marcar cobrado ({o.metodo_pago})</button>}
        {!['entregado', 'cancelado'].includes(o.estado) && (
          <button className="btn sm" style={{ color: 'var(--red)' }} onClick={() => window.confirm('¿Cancelar el pedido #' + o.id + '?') && hacer('cancelar', o.id)}>Cancelar pedido</button>
        )}
      </div>
    </>
  );
}

function NuevoPedido({ productos, cerrar, toast }) {
  const [f, setF] = useState({ canal: 'Teléfono', tipo: 'delivery', cliente_nombre: '', telefono: '', direccion: '', ubic: '', metodo_pago: 'Efectivo', nota: '' });
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const sub = items.reduce((s, i) => s + productos.find(p => p.id === i.producto_id).precio * i.cantidad, 0);
  const add = id => setItems(l => l.find(i => i.producto_id === id) ? l.map(i => i.producto_id === id ? { ...i, cantidad: i.cantidad + 1 } : i) : [...l, { producto_id: id, cantidad: 1 }]);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));

  async function guardar() {
    setError('');
    const u = leerUbicacion(f.ubic);
    if (!f.cliente_nombre) return setError('Escribe el nombre del cliente');
    if (!items.length) return setError('Agrega al menos un producto');
    if (f.tipo === 'delivery' && !u) return setError('Para delivery pega la ubicación (link de Google Maps o "lat, lng")');
    try {
      const r = await accion('crear_manual', { ...f, ...(u || {}), metodo_pago: f.canal === 'PedidosYa' ? 'App' : f.metodo_pago, items });
      toast('Pedido #' + r.pedido.id + ' creado');
      cerrar();
    } catch (e) { setError(e.message); }
  }

  return (
    <Modal titulo="Pedido manual" onClose={cerrar}>
      {error && <div className="error">{error}</div>}
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <select className="inp" value={f.canal} onChange={e => set('canal', e.target.value)}>
          {['Teléfono', 'PedidosYa', 'Instagram', 'Web'].map(c => <option key={c}>{c}</option>)}
        </select>
        <select className="inp" value={f.tipo} onChange={e => set('tipo', e.target.value)}>
          <option value="delivery">Delivery</option><option value="mostrador">Recoge en local</option>
        </select>
        <input className="inp" placeholder="Nombre del cliente" value={f.cliente_nombre} onChange={e => set('cliente_nombre', e.target.value)} />
        <input className="inp" placeholder="WhatsApp (ej. 59170000000)" value={f.telefono} onChange={e => set('telefono', e.target.value.replace(/\D/g, ''))} />
      </div>
      {f.tipo === 'delivery' && <>
        <input className="inp" style={{ marginTop: 8 }} placeholder="Dirección y referencias" value={f.direccion} onChange={e => set('direccion', e.target.value)} />
        <input className="inp" style={{ marginTop: 8 }} placeholder="Ubicación: link de Google Maps o -17.78, -63.18" value={f.ubic} onChange={e => set('ubic', e.target.value)} />
      </>}
      <select className="inp" style={{ marginTop: 8 }} value="" onChange={e => e.target.value && add(+e.target.value)}>
        <option value="">+ Agregar producto…</option>
        {productos.map(p => <option key={p.id} value={p.id}>{p.nombre} — {bs(p.precio)}</option>)}
      </select>
      <div style={{ margin: '8px 0' }}>
        {items.map(i => {
          const p = productos.find(x => x.id === i.producto_id);
          return <div key={i.producto_id} className="sumrow"><span>{i.cantidad}× {p.nombre}</span><span>{bs(p.precio * i.cantidad)} <button className="btn sm" onClick={() => setItems(l => l.filter(x => x !== i))}>✕</button></span></div>;
        })}
      </div>
      {f.canal !== 'PedidosYa' && (
        <div className="methods">{['Efectivo', 'QR', 'Tarjeta'].map(m => <button key={m} className={f.metodo_pago === m ? 'on' : ''} onClick={() => set('metodo_pago', m)}>{m}</button>)}</div>
      )}
      <input className="inp" placeholder="Nota (opcional)" value={f.nota} onChange={e => set('nota', e.target.value)} />
      <div className="bigtot" style={{ fontSize: 16 }}><span>Subtotal</span><span>{bs(sub)}</span></div>
      <div className="mute" style={{ fontSize: 12 }}>El envío se calcula automáticamente según la zona.</div>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="btn" onClick={cerrar}>Cancelar</button>
        <button className="btn pri" onClick={guardar}>Crear pedido</button>
      </div>
    </Modal>
  );
}

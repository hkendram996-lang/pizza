'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, accion } from '@/lib/supabaseClient';
import { bs, since, extrasTxt } from '@/lib/format';
import { alerta, desbloquear, pantallaEncendida } from '@/lib/sonido';
import { ElegirExtras, extrasPara, claveLinea, precioLinea, nombresExtras } from '@/components/Extras';

// App del mozo: se abre en el celular. Toma pedidos por mesa, los manda a cocina,
// avisa cuando están listos para servir y cobra la cuenta de la mesa al final.
export default function Mozo() {
  const router = useRouter();
  const [perfil, setPerfil] = useState(null);
  const [products, setProducts] = useState([]);
  const [modifiers, setModifiers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [mesa, setMesa] = useState(null);           // mesa abierta en pantalla
  const [nueva, setNueva] = useState('');
  const [aviso, setAviso] = useState('');
  const [, setTic] = useState(0);
  const listos = useRef(null);

  const avisar = m => { setAviso(m); setTimeout(() => setAviso(''), 3500); };

  const cargar = useCallback(async () => {
    const desde = new Date(); desde.setHours(0, 0, 0, 0);
    const [{ data: o }, { data: p }, { data: m }] = await Promise.all([
      supabase.from('orders').select('*, order_items(*)').eq('canal', 'Salón').neq('estado', 'cancelado')
        .or(`pagado.eq.false,created_at.gte."${desde.toISOString()}"`).order('created_at').limit(300),
      supabase.from('products').select('*').eq('activo', true).order('orden').order('id'),
      supabase.from('modifiers').select('*').eq('activo', true).order('orden').order('id')
    ]);
    setOrders(o || []); setProducts(p || []); setModifiers(m || []);
  }, []);

  useEffect(() => {
    let canal = null, vivo = true, lock = null;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/login'); return; }
      const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      if (!vivo) return;
      if (!p || !['mozo', 'admin', 'cajero'].includes(p.rol)) { router.replace('/login'); return; }
      setPerfil(p);
      await cargar();
      canal = supabase.channel('mozo')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => cargar())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => cargar())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => cargar())
        .subscribe();
      lock = await pantallaEncendida();
    })();
    const iv = setInterval(() => { setTic(t => t + 1); cargar(); }, 30000);
    return () => { vivo = false; clearInterval(iv); if (canal) supabase.removeChannel(canal); try { lock && lock.release(); } catch { } };
  }, [router, cargar]);

  // Mesas con cuenta abierta (pedidos del salón sin cobrar)
  const abiertos = orders.filter(o => !o.pagado);
  const mesas = {};
  abiertos.forEach(o => {
    const k = o.mesa || '?';
    mesas[k] = mesas[k] || { mesa: k, pedidos: [], total: 0, listos: 0, cocina: 0, desde: o.created_at };
    mesas[k].pedidos.push(o); mesas[k].total += Number(o.total);
    if (o.estado === 'listo') mesas[k].listos++;
    if (o.estado === 'cocina' || o.estado === 'nuevo') mesas[k].cocina++;
  });
  const lista = Object.values(mesas).sort((a, b) => String(a.mesa).localeCompare(String(b.mesa), 'es', { numeric: true }));

  // Sonido y vibración cuando un pedido del salón sale de cocina
  useEffect(() => {
    const ids = new Set(orders.filter(o => o.estado === 'listo').map(o => o.id));
    if (listos.current && [...ids].some(id => !listos.current.has(id))) { alerta('listo'); avisar('🍕 Hay un pedido listo para servir'); }
    listos.current = ids;
  }, [orders]);

  if (!perfil) return <div className="center mute">Cargando…</div>;

  if (mesa !== null) {
    return <Mesa numero={mesa} info={mesas[mesa]} products={products} modifiers={modifiers} perfil={perfil}
      volver={() => setMesa(null)} avisar={avisar} aviso={aviso} />;
  }

  function abrir() {
    const n = nueva.trim();
    if (!n) return;
    setNueva(''); setMesa(n);
  }

  return (
    <div className="mozo" onClick={desbloquear}>
      <header className="mz-top">
        <div><b>Mesas</b><small>{perfil.nombre} · mozo</small></div>
        <button className="btn sm" onClick={() => supabase.auth.signOut().then(() => router.replace('/login'))}>Salir</button>
      </header>
      {aviso && <div className="mz-aviso">{aviso}</div>}

      <div className="mz-nueva">
        <input className="inp" inputMode="numeric" placeholder="N° de mesa" value={nueva}
          onChange={e => setNueva(e.target.value)} onKeyDown={e => e.key === 'Enter' && abrir()} />
        <button className="btn pri" onClick={abrir}>Abrir mesa</button>
      </div>

      {lista.length ? (
        <div className="mz-mesas">
          {lista.map(m => (
            <button key={m.mesa} className={'mz-mesa' + (m.listos ? ' listo' : '')} onClick={() => setMesa(m.mesa)}>
              <b>Mesa {m.mesa}</b>
              <span>{bs(m.total)}</span>
              <small>
                {m.listos ? '🍕 ' + m.listos + ' para servir' : m.cocina ? '🔥 ' + m.cocina + ' en cocina' : '✓ Servida'}
                {' · '}{since(m.desde)}
              </small>
            </button>
          ))}
        </div>
      ) : <div className="empty" style={{ padding: 30 }}>No hay mesas abiertas. Escribe el número de mesa para tomar un pedido.</div>}
    </div>
  );
}

function Mesa({ numero, info, products, modifiers, perfil, volver, avisar, aviso }) {
  const [vista, setVista] = useState(info ? 'cuenta' : 'pedir');
  const [cat, setCat] = useState('Todos');
  const [buscar, setBuscar] = useState('');
  const [cart, setCart] = useState([]);
  const [nota, setNota] = useState('');
  const [elegir, setElegir] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [pago, setPago] = useState('Efectivo');

  const pedidos = info ? info.pedidos : [];
  const total = info ? info.total : 0;
  const prod = id => products.find(p => p.id === id);
  const unit = l => precioLinea(prod(l.id), l.extras, modifiers);
  const sub = cart.reduce((s, l) => s + unit(l) * l.q, 0);
  const cats = ['Todos', ...new Set(products.map(p => p.categoria))];
  const q = buscar.trim().toLowerCase();
  const visibles = products.filter(p => (cat === 'Todos' || p.categoria === cat) && (!q || p.nombre.toLowerCase().includes(q)));

  function agregar(id, extras = [], n = '') {
    const k = claveLinea(id, extras, n);
    setCart(c => c.find(l => l.k === k) ? c.map(l => l.k === k ? { ...l, q: l.q + 1 } : l) : [...c, { k, id, extras, nota: n, q: 1 }]);
  }
  const tocar = p => (extrasPara(p, modifiers).length ? setElegir(p) : agregar(p.id));
  const cambiar = (k, d) => setCart(c => c.map(l => l.k === k ? { ...l, q: l.q + d } : l).filter(l => l.q > 0));

  async function enviar() {
    setEnviando(true);
    try {
      const r = await accion('crear_mesa', {
        mesa: numero, nota: nota.trim() || null,
        items: cart.map(l => ({ producto_id: l.id, cantidad: l.q, extras: l.extras, nota: l.nota }))
      });
      avisar('✓ Pedido #' + r.pedido.id + ' enviado a cocina');
      setCart([]); setNota(''); setVista('cuenta');
    } catch (e) { avisar('⚠️ ' + e.message); }
    setEnviando(false);
  }
  async function servir(id) {
    try { await accion('servir', { orderId: id }); } catch (e) { avisar('⚠️ ' + e.message); }
  }
  async function cobrar() {
    if (!window.confirm('¿Cobrar ' + bs(total) + ' de la mesa ' + numero + ' con ' + pago + '?')) return;
    try {
      await accion('cobrar_mesa', { mesa: numero, metodo: pago });
      avisar('💵 Mesa ' + numero + ' cobrada');
      volver();
    } catch (e) { avisar('⚠️ ' + e.message); }
  }

  return (
    <div className="mozo" onClick={desbloquear}>
      <header className="mz-top">
        <button className="btn sm" onClick={volver}>← Mesas</button>
        <div style={{ textAlign: 'center' }}><b>Mesa {numero}</b><small>{pedidos.length ? bs(total) + ' en cuenta' : 'Nueva'}</small></div>
        <span style={{ width: 70 }} />
      </header>
      {aviso && <div className="mz-aviso">{aviso}</div>}
      <div className="cats" style={{ padding: '0 12px' }}>
        <button className={vista === 'pedir' ? 'on' : ''} onClick={() => setVista('pedir')}>+ Pedir{cart.length ? ' (' + cart.reduce((s, l) => s + l.q, 0) + ')' : ''}</button>
        <button className={vista === 'cuenta' ? 'on' : ''} onClick={() => setVista('cuenta')}>Cuenta</button>
      </div>

      {vista === 'pedir' && (
        <div style={{ padding: '0 12px 130px' }}>
          <input className="inp" placeholder="Buscar producto…" value={buscar} onChange={e => setBuscar(e.target.value)} style={{ marginBottom: 8 }} />
          <div className="cats">{cats.map(k => <button key={k} className={cat === k ? 'on' : ''} onClick={() => setCat(k)}>{k}</button>)}</div>
          <div className="pgrid">
            {visibles.map(p => (
              <button key={p.id} className="pb" onClick={() => tocar(p)}>
                <b>{p.nombre}</b><span>{bs(p.precio)}{extrasPara(p, modifiers).length ? <small className="mute" style={{ fontWeight: 400 }}> · opciones</small> : null}</span>
              </button>
            ))}
          </div>
          {cart.length > 0 && (
            <div className="mz-carrito">
              {cart.map(l => (
                <div key={l.k} className="ln">
                  <span className="n">{prod(l.id).nombre}
                    {l.extras.length > 0 && <span className="ext">+ {nombresExtras(l.extras, modifiers)}</span>}
                    {l.nota && <span className="ext">📝 {l.nota}</span>}
                  </span>
                  <div className="qty"><button onClick={() => cambiar(l.k, -1)}>−</button><b style={{ minWidth: 18, textAlign: 'center' }}>{l.q}</b><button onClick={() => cambiar(l.k, 1)}>+</button></div>
                  <span style={{ minWidth: 58, textAlign: 'right' }}>{bs(unit(l) * l.q)}</span>
                </div>
              ))}
              <input className="inp" placeholder="Nota para cocina (opcional)" value={nota} onChange={e => setNota(e.target.value)} style={{ marginTop: 6 }} />
              <button className="btn pri big" style={{ marginTop: 8 }} disabled={enviando} onClick={enviar}>Enviar a cocina · {bs(sub)}</button>
            </div>
          )}
        </div>
      )}

      {vista === 'cuenta' && (
        <div style={{ padding: '0 12px 30px' }}>
          {pedidos.length ? pedidos.map(o => (
            <div key={o.id} className="card" style={{ marginBottom: 10 }}>
              <h3>
                Pedido #{o.id}
                <span className="mute" style={{ fontSize: 12 }}>{since(o.created_at)}</span>
                <span style={{ marginLeft: 'auto' }}>
                  {o.estado === 'listo' ? <button className="btn sm ok" onClick={() => servir(o.id)}>Servido ✓</button>
                    : o.estado === 'entregado' ? <span className="chip" style={{ background: 'var(--green2)', color: 'var(--green)' }}>Servido</span>
                      : <span className="chip" style={{ background: 'var(--amber2)', color: 'var(--amber)' }}>En cocina</span>}
                </span>
              </h3>
              {(o.order_items || []).map(i => (
                <div key={i.id} className="sumrow">
                  <span>{i.cantidad}× {i.nombre}{extrasTxt(i) && <span className="ext">+ {extrasTxt(i)}</span>}{i.nota && <span className="ext">📝 {i.nota}</span>}</span>
                  <span>{bs(i.precio * i.cantidad)}</span>
                </div>
              ))}
            </div>
          )) : <div className="empty" style={{ padding: 24 }}>Esta mesa todavía no tiene pedidos. Toca "+ Pedir".</div>}

          {pedidos.length > 0 && (
            <div className="card">
              <div className="bigtot"><span>Total mesa {numero}</span><span>{bs(total)}</span></div>
              <div className="methods">{['Efectivo', 'QR', 'Tarjeta'].map(m => <button key={m} className={pago === m ? 'on' : ''} onClick={() => setPago(m)}>{m}</button>)}</div>
              <button className="btn pri big" onClick={cobrar}>Cobrar mesa</button>
              <div className="mute" style={{ fontSize: 12, marginTop: 8 }}>También se puede cobrar desde Caja → "Mesas por cobrar".</div>
            </div>
          )}
        </div>
      )}

      {elegir && (
        <ElegirExtras producto={elegir} modifiers={modifiers} onClose={() => setElegir(null)}
          onOk={({ extras, nota: n }) => { agregar(elegir.id, extras, n); setElegir(null); }} />
      )}
    </div>
  );
}

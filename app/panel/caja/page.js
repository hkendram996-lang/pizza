'use client';
import { useEffect, useState } from 'react';
import { useDatos, useToast } from '@/components/Datos';
import { Header, Modal, Canal } from '@/components/UI';
import { ElegirExtras, extrasPara, claveLinea, precioLinea, nombresExtras } from '@/components/Extras';
import { accion, supabase } from '@/lib/supabaseClient';
import { bs, hhmm, ORIGENES_LOCAL } from '@/lib/format';

const METODOS = ['Efectivo', 'QR', 'Tarjeta', 'App'];
const DENOMINACIONES = [200, 100, 50, 20, 10, 5, 2, 1, 0.5];

export default function Caja() {
  const { products, modifiers, caja, movs, perfil, orders } = useDatos();
  const { toast, Toasts } = useToast();
  const [cat, setCat] = useState('Todos');
  const [cart, setCart] = useState([]);
  const [pago, setPago] = useState('Efectivo');
  const [origen, setOrigen] = useState('Mostrador');
  const [mesa, setMesa] = useState('');
  const [nombre, setNombre] = useState('');
  const [elegir, setElegir] = useState(null);
  const [eg, setEg] = useState({ c: '', m: '' });
  const [ap, setAp] = useState({ c: perfil.nombre || '', m: '300' });
  const [arqueo, setArqueo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const activos = products.filter(p => p.activo);
  const cats = ['Todos', ...new Set(activos.map(p => p.categoria))];
  const lista = activos.filter(p => cat === 'Todos' || p.categoria === cat);
  const prod = id => products.find(p => p.id === id);
  const unit = l => precioLinea(prod(l.id), l.extras, modifiers);
  const sub = cart.reduce((s, l) => s + unit(l) * l.q, 0);

  // ---- Resumen del turno ----
  const t = { Efectivo: 0, QR: 0, Tarjeta: 0, App: 0 };
  const porOrigen = {};
  let egresos = 0, pedidosTurno = 0, devoluciones = 0;
  movs.forEach(m => {
    const monto = Number(m.monto);
    if (m.tipo === 'ingreso') {
      t[m.metodo] = (t[m.metodo] || 0) + monto;
      const o = (m.orders && m.orders.canal) || (m.order_id ? 'Otros' : 'Ingreso manual');
      porOrigen[o] = porOrigen[o] || { n: 0, v: 0 };
      porOrigen[o].v += monto;
      if (m.order_id) { porOrigen[o].n += 1; pedidosTurno += 1; }
    } else {
      if (m.order_id) devoluciones += 1;
      if (m.metodo === 'Efectivo') egresos += monto;
      else t[m.metodo] = (t[m.metodo] || 0) - monto;
    }
  });
  const esperado = caja ? Number(caja.monto_inicial) + t.Efectivo - egresos : 0;
  const totalVentas = METODOS.reduce((s, k) => s + t[k], 0);
  const pendientes = caja ? orders.filter(o => !o.pagado && o.estado !== 'cancelado' && new Date(o.created_at) >= new Date(caja.abierta_at)) : [];

  function agregar(id, extras = [], nota = '') {
    const k = claveLinea(id, extras, nota);
    setCart(c => c.find(l => l.k === k) ? c.map(l => l.k === k ? { ...l, q: l.q + 1 } : l) : [...c, { k, id, extras, nota, q: 1 }]);
  }
  function tocarProducto(p) {
    if (extrasPara(p, modifiers).length) setElegir(p);
    else agregar(p.id);
  }
  const mas = k => setCart(c => c.map(l => l.k === k ? { ...l, q: l.q + 1 } : l));
  const menos = k => setCart(c => c.map(l => l.k === k ? { ...l, q: l.q - 1 } : l).filter(l => l.q > 0));

  async function cobrar() {
    if (origen === 'Salón' && !mesa.trim()) return toast('Escribe el número de mesa');
    setEnviando(true);
    try {
      const r = await accion('crear_mostrador', {
        metodo_pago: pago, canal: origen, mesa: origen === 'Salón' ? mesa.trim() : null,
        cliente_nombre: nombre.trim() || null,
        items: cart.map(l => ({ producto_id: l.id, cantidad: l.q, extras: l.extras, nota: l.nota }))
      });
      toast('💵 Venta #' + r.pedido.id + ' cobrada y enviada a cocina');
      setCart([]); setMesa(''); setNombre('');
    } catch (e) { toast('⚠️ ' + e.message); }
    setEnviando(false);
  }
  async function egreso() {
    const m = Number(eg.m);
    if (!eg.c || !(m > 0)) return toast('Escribe el concepto y el monto');
    await supabase.from('cash_movements').insert({ session_id: caja.id, tipo: 'egreso', concepto: eg.c, monto: m, metodo: 'Efectivo' });
    setEg({ c: '', m: '' });
  }
  async function abrir() {
    const { error } = await supabase.from('cash_sessions').insert({ cajero: ap.c || 'Cajero', monto_inicial: Number(ap.m) || 0 });
    if (error) toast('⚠️ ' + error.message); else toast('Caja abierta');
  }

  return (
    <>
      <Header titulo="Caja" sub="Punto de venta, movimientos y cierre de turno" />
      <div className="pos">
        <div>
          <div className="cats">{cats.map(k => <button key={k} className={cat === k ? 'on' : ''} onClick={() => setCat(k)}>{k}</button>)}</div>
          <div className="pgrid">
            {lista.map(p => (
              <button key={p.id} className="pb" disabled={!caja} onClick={() => tocarProducto(p)}>
                <b>{p.nombre}</b><span>{bs(p.precio)}{extrasPara(p, modifiers).length ? <small className="mute" style={{ fontWeight: 400 }}> · opciones</small> : null}</span>
              </button>
            ))}
          </div>
          {!caja && <div className="error" style={{ marginTop: 12 }}>Abre la caja para poder vender.</div>}
        </div>
        <div className="grid">
          <div className="card cart">
            <h3>Nueva venta</h3>
            <label className="fl">¿Dónde se vende?</label>
            <div className="origen">
              {ORIGENES_LOCAL.map(o => <button key={o} className={origen === o ? 'on' : ''} onClick={() => setOrigen(o)}>{o}</button>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: origen === 'Salón' ? '90px 1fr' : '1fr', gap: 6, marginBottom: 8 }}>
              {origen === 'Salón' && <input className="inp" placeholder="Mesa" value={mesa} onChange={e => setMesa(e.target.value)} />}
              <input className="inp" placeholder="Nombre del cliente (opcional)" value={nombre} onChange={e => setNombre(e.target.value)} />
            </div>
            {cart.length ? cart.map(l => (
              <div key={l.k} className="ln">
                <span className="n">
                  {prod(l.id).nombre}
                  {l.extras.length > 0 && <span className="ext">+ {nombresExtras(l.extras, modifiers)}</span>}
                  {l.nota && <span className="ext">📝 {l.nota}</span>}
                </span>
                <div className="qty"><button onClick={() => menos(l.k)}>−</button><b style={{ minWidth: 18, textAlign: 'center' }}>{l.q}</b><button onClick={() => mas(l.k)}>+</button></div>
                <span style={{ minWidth: 62, textAlign: 'right' }}>{bs(unit(l) * l.q)}</span>
              </div>
            )) : <div className="empty">Toca un producto para agregarlo</div>}
            <div className="methods">{['Efectivo', 'QR', 'Tarjeta'].map(m => <button key={m} className={pago === m ? 'on' : ''} onClick={() => setPago(m)}>{m}</button>)}</div>
            <div className="bigtot"><span>Total</span><span>{bs(sub)}</span></div>
            <button className="btn pri big" style={{ marginTop: 12 }} disabled={!cart.length || !caja || enviando} onClick={cobrar}>Cobrar y enviar a cocina</button>
          </div>

          <div className="card">
            <h3>Caja {caja ? <span className="st st-libre">Abierta</span> : <span className="st st-yendo">Cerrada</span>}</h3>
            {caja ? (
              <>
                <div className="sumrow"><span className="mute">Cajero/a</span><span>{caja.cajero} · desde {hhmm(caja.abierta_at)}</span></div>
                <div className="sumrow"><span className="mute">Monto inicial</span><span>{bs(caja.monto_inicial)}</span></div>
                {METODOS.map(m => <div key={m} className="sumrow"><span>{m === 'App' ? 'Apps de delivery' : m}</span><span>{bs(t[m])}</span></div>)}
                <div className="sumrow"><span>Egresos en efectivo</span><span className="down">−{bs(egresos)}</span></div>
                <div className="bigtot" style={{ fontSize: 16 }}><span>Efectivo esperado</span><span>{bs(esperado)}</span></div>
                {pendientes.length > 0 && <div className="mute" style={{ fontSize: 12.5, marginTop: 6 }}>⚠️ {pendientes.length} pedido(s) del turno todavía sin cobrar</div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px auto', gap: 6, marginTop: 14 }}>
                  <input className="inp" placeholder="Egreso: concepto" value={eg.c} onChange={e => setEg({ ...eg, c: e.target.value })} />
                  <input className="inp" type="number" min="0" placeholder="Bs" value={eg.m} onChange={e => setEg({ ...eg, m: e.target.value })} />
                  <button className="btn sm" onClick={egreso}>Registrar</button>
                </div>
                <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} onClick={() => setArqueo(true)}>Cerrar caja y hacer arqueo</button>
              </>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px auto', gap: 6 }}>
                <input className="inp" placeholder="Cajero/a" value={ap.c} onChange={e => setAp({ ...ap, c: e.target.value })} />
                <input className="inp" type="number" placeholder="Inicial" value={ap.m} onChange={e => setAp({ ...ap, m: e.target.value })} />
                <button className="btn ok sm" onClick={abrir}>Abrir caja</button>
              </div>
            )}
          </div>

          {caja && Object.keys(porOrigen).length > 0 && (
            <div className="card">
              <h3>Ventas del turno por origen</h3>
              {Object.entries(porOrigen).sort((a, b) => b[1].v - a[1].v).map(([k, v]) => (
                <div key={k} className="sumrow"><span><Canal c={k} /> <span className="mute">{v.n} pedido(s)</span></span><span>{bs(v.v)}</span></div>
              ))}
            </div>
          )}

          {caja && (
            <div className="card">
              <h3>Movimientos del turno</h3>
              <table><tbody>
                {movs.slice(0, 30).map(m => (
                  <tr key={m.id}>
                    <td className="mute">{hhmm(m.created_at)}</td>
                    <td>{m.concepto}<div className="mute" style={{ fontSize: 12 }}>{m.metodo}{m.orders && m.orders.canal ? ' · ' + m.orders.canal : ''}</div></td>
                    <td className={'r ' + (m.tipo === 'egreso' ? 'down' : '')}>{m.tipo === 'egreso' ? '−' : ''}{bs(m.monto)}</td>
                  </tr>
                ))}
              </tbody></table>
              {!movs.length && <div className="empty">Sin movimientos todavía</div>}
            </div>
          )}

          <Historial cajaId={caja ? caja.id : null} />
        </div>
      </div>
      {elegir && (
        <ElegirExtras producto={elegir} modifiers={modifiers} onClose={() => setElegir(null)}
          onOk={({ extras, nota }) => { agregar(elegir.id, extras, nota); setElegir(null); }} />
      )}
      {arqueo && caja && (
        <Arqueo caja={caja} t={t} esperado={esperado} total={totalVentas} egresos={egresos} porOrigen={porOrigen}
          pedidos={pedidosTurno} devoluciones={devoluciones} pendientes={pendientes} perfil={perfil}
          cerrar={() => setArqueo(false)} toast={toast} />
      )}
      <Toasts />
    </>
  );
}

function Arqueo({ caja, t, esperado, total, egresos, porOrigen, pedidos, devoluciones, pendientes, perfil, cerrar, toast }) {
  const [billetes, setBilletes] = useState({});
  const [directo, setDirecto] = useState('');
  const [qr, setQr] = useState('');
  const [tarjeta, setTarjeta] = useState('');
  const [obs, setObs] = useState('');
  const [guardando, setGuardando] = useState(false);

  const sumaConteo = DENOMINACIONES.reduce((s, d) => s + d * (Number(billetes[d]) || 0), 0);
  const usaConteo = DENOMINACIONES.some(d => Number(billetes[d]) > 0);
  const contado = usaConteo ? sumaConteo : directo === '' ? null : Number(directo);
  const dif = contado === null ? null : contado - esperado;
  const difDe = (banco, sistema) => banco === '' ? null : Number(banco) - sistema;
  const difQr = difDe(qr, t.QR), difTarj = difDe(tarjeta, t.Tarjeta);
  const ticket = pedidos ? total / pedidos : 0;
  const Dif = ({ v }) => v === null ? <span>—</span> : <span className={v < 0 ? 'down' : v > 0 ? 'up' : ''}>{(v > 0 ? '+' : '') + bs(v)}{v < 0 ? ' faltante' : v > 0 ? ' sobrante' : ' ✓'}</span>;

  async function confirmar() {
    if (contado === null) return toast('Cuenta el efectivo o escribe el total contado');
    if (Math.abs(dif) >= 1 && !obs.trim() && !window.confirm('Hay una diferencia de ' + bs(dif) + '. ¿Cerrar igual sin explicar el motivo?')) return;
    setGuardando(true);
    const base = { cerrada_at: new Date().toISOString(), esperado, monto_contado: contado, diferencia: dif };
    const extra = {
      conteo: usaConteo ? billetes : null,
      qr_banco: qr === '' ? null : Number(qr),
      tarjeta_banco: tarjeta === '' ? null : Number(tarjeta),
      observaciones: obs.trim() || null,
      cerrada_por: perfil.nombre || null,
      resumen: { total, metodos: t, egresos, origenes: porOrigen, pedidos, devoluciones, pendientes: pendientes.map(o => o.id) }
    };
    let { error } = await supabase.from('cash_sessions').update({ ...base, ...extra }).eq('id', caja.id);
    if (error && /column/i.test(error.message)) {
      // La base todavía no tiene las columnas nuevas (falta ejecutar mejoras-01.sql): se guarda lo básico
      ({ error } = await supabase.from('cash_sessions').update(base).eq('id', caja.id));
      if (!error) toast('Caja cerrada. Para guardar el detalle del conteo, ejecuta supabase/mejoras-01.sql');
    }
    setGuardando(false);
    if (error) return toast('⚠️ ' + error.message);
    toast('Caja cerrada · diferencia ' + bs(dif));
    cerrar();
  }

  return (
    <Modal titulo="Cierre de caja y arqueo" onClose={cerrar}>
      <div className="imprimible">
        <div className="mute" style={{ fontSize: 13, marginBottom: 8 }}>
          {caja.cajero} · {new Date(caja.abierta_at).toLocaleDateString('es-BO')} de {hhmm(caja.abierta_at)} a {hhmm(Date.now())}
        </div>
        {pendientes.length > 0 && (
          <div className="error" style={{ marginBottom: 10 }}>
            Hay {pendientes.length} pedido(s) sin cobrar: #{pendientes.map(o => o.id).join(', #')}. Cóbralos o cancélalos antes de cerrar.
          </div>
        )}

        <h4 style={{ margin: '6px 0' }}>Resumen del turno</h4>
        <div className="sumrow"><span>Ventas del turno</span><b>{bs(total)}</b></div>
        <div className="sumrow"><span className="mute">Pedidos cobrados · ticket promedio</span><span>{pedidos} · {bs(ticket)}</span></div>
        {devoluciones > 0 && <div className="sumrow"><span className="mute">Devoluciones</span><span className="down">{devoluciones}</span></div>}
        {Object.entries(porOrigen).sort((a, b) => b[1].v - a[1].v).map(([k, v]) => (
          <div key={k} className="sumrow"><span className="mute">{k} ({v.n})</span><span>{bs(v.v)}</span></div>
        ))}

        <h4 style={{ margin: '14px 0 6px' }}>Efectivo</h4>
        <div className="sumrow"><span className="mute">Monto inicial + ventas en efectivo − egresos</span><span>{bs(caja.monto_inicial)} + {bs(t.Efectivo)} − {bs(egresos)}</span></div>
        <div className="sumrow"><span>Efectivo esperado</span><b>{bs(esperado)}</b></div>
        <div className="conteo" style={{ marginTop: 8 }}>
          <span className="mute">Billete / moneda</span><span className="mute" style={{ textAlign: 'right' }}>Cantidad</span><span className="mute" style={{ textAlign: 'right' }}>Subtotal</span>
          {DENOMINACIONES.map(d => (
            <Fila key={d} d={d} v={billetes[d] || ''} set={v => setBilletes(b => ({ ...b, [d]: v }))} />
          ))}
        </div>
        {!usaConteo && (
          <>
            <label className="fl" style={{ marginTop: 10 }}>…o escribe el total contado (Bs)</label>
            <input className="inp" type="number" value={directo} onChange={e => setDirecto(e.target.value)} placeholder={String(Math.round(esperado))} />
          </>
        )}
        <div className="sumrow" style={{ marginTop: 8 }}><span>Efectivo contado</span><b>{contado === null ? '—' : bs(contado)}</b></div>
        <div className="bigtot" style={{ fontSize: 16 }}><span>Diferencia en efectivo</span><Dif v={dif} /></div>

        <h4 style={{ margin: '14px 0 6px' }}>QR y tarjeta (compara con el banco)</h4>
        <div className="conteo">
          <span>QR · sistema {bs(t.QR)}</span>
          <input className="inp" type="number" placeholder="Banco" value={qr} onChange={e => setQr(e.target.value)} />
          <Dif v={difQr} />
          <span>Tarjeta · sistema {bs(t.Tarjeta)}</span>
          <input className="inp" type="number" placeholder="POS" value={tarjeta} onChange={e => setTarjeta(e.target.value)} />
          <Dif v={difTarj} />
        </div>
        {t.App > 0 && <div className="sumrow"><span className="mute">Apps de delivery (las liquida la app)</span><span>{bs(t.App)}</span></div>}

        <label className="fl" style={{ marginTop: 12 }}>Observaciones</label>
        <textarea className="inp" rows={2} value={obs} onChange={e => setObs(e.target.value)} placeholder="Ej. faltante por cambio mal dado a las 21:30" />
      </div>
      <div className="row no-imprimir" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn" onClick={() => window.print()}>Imprimir</button>
        <button className="btn" onClick={cerrar}>Cancelar</button>
        <button className="btn pri" disabled={guardando} onClick={confirmar}>Confirmar cierre</button>
      </div>
    </Modal>
  );
}

function Fila({ d, v, set }) {
  return (
    <>
      <span>Bs {d < 1 ? '0,50' : d}</span>
      <input className="inp" type="number" min="0" value={v} onChange={e => set(e.target.value)} />
      <span style={{ textAlign: 'right' }}>{bs(d * (Number(v) || 0))}</span>
    </>
  );
}

function Historial({ cajaId }) {
  const [lista, setLista] = useState([]);
  const [abierto, setAbierto] = useState(null);
  useEffect(() => {
    supabase.from('cash_sessions').select('*').not('cerrada_at', 'is', null)
      .order('cerrada_at', { ascending: false }).limit(15)
      .then(({ data }) => setLista(data || []));
  }, [cajaId]);
  if (!lista.length) return null;
  return (
    <div className="card">
      <h3>Cierres anteriores</h3>
      <table>
        <thead><tr><th>Turno</th><th className="r">Ventas</th><th className="r">Diferencia</th></tr></thead>
        <tbody>
          {lista.map(s => {
            const d = Number(s.diferencia) || 0;
            return (
              <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => setAbierto(abierto === s.id ? null : s.id)}>
                <td>
                  {new Date(s.abierta_at).toLocaleDateString('es-BO', { day: 'numeric', month: 'short' })} · {hhmm(s.abierta_at)}–{hhmm(s.cerrada_at)}
                  <div className="mute" style={{ fontSize: 12 }}>{s.cajero}{s.observaciones ? ' · ' + s.observaciones : ''}</div>
                  {abierto === s.id && s.resumen && (
                    <div className="mute" style={{ fontSize: 12, marginTop: 4 }}>
                      {Object.entries(s.resumen.metodos || {}).filter(([, v]) => v).map(([k, v]) => k + ' ' + bs(v)).join(' · ')}
                      {s.qr_banco != null ? ' · QR banco ' + bs(s.qr_banco) : ''}
                    </div>
                  )}
                </td>
                <td className="r">{s.resumen ? bs(s.resumen.total) : '—'}</td>
                <td className={'r ' + (d < 0 ? 'down' : d > 0 ? 'up' : '')}>{Math.abs(d) < 0.5 ? '✓' : (d > 0 ? '+' : '') + bs(d)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

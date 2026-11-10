'use client';
import { useState } from 'react';
import { useDatos, useToast } from '@/components/Datos';
import { Header, Modal } from '@/components/UI';
import { accion, supabase } from '@/lib/supabaseClient';
import { bs, hhmm } from '@/lib/format';

const METODOS = ['Efectivo', 'QR', 'Tarjeta', 'App'];

export default function Caja() {
  const { products, caja, movs, perfil } = useDatos();
  const { toast, Toasts } = useToast();
  const [cat, setCat] = useState('Todos');
  const [cart, setCart] = useState([]);
  const [pago, setPago] = useState('Efectivo');
  const [eg, setEg] = useState({ c: '', m: '' });
  const [ap, setAp] = useState({ c: perfil.nombre || '', m: '300' });
  const [arqueo, setArqueo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const activos = products.filter(p => p.activo);
  const cats = ['Todos', ...new Set(activos.map(p => p.categoria))];
  const lista = activos.filter(p => cat === 'Todos' || p.categoria === cat);
  const prod = id => products.find(p => p.id === id);
  const sub = cart.reduce((s, i) => s + prod(i.id).precio * i.q, 0);

  const t = { Efectivo: 0, QR: 0, Tarjeta: 0, App: 0 };
  let egresos = 0;
  movs.forEach(m => { if (m.tipo === 'ingreso') t[m.metodo] = (t[m.metodo] || 0) + Number(m.monto); else if (m.metodo === 'Efectivo') egresos += Number(m.monto); });
  const esperado = caja ? Number(caja.monto_inicial) + t.Efectivo - egresos : 0;
  const totalVentas = METODOS.reduce((s, k) => s + t[k], 0);

  const add = id => setCart(c => c.find(i => i.id === id) ? c.map(i => i.id === id ? { ...i, q: i.q + 1 } : i) : [...c, { id, q: 1 }]);
  const dec = id => setCart(c => c.map(i => i.id === id ? { ...i, q: i.q - 1 } : i).filter(i => i.q > 0));

  async function cobrar() {
    setEnviando(true);
    try {
      const r = await accion('crear_mostrador', { metodo_pago: pago, items: cart.map(i => ({ producto_id: i.id, cantidad: i.q })) });
      toast('💵 Venta #' + r.pedido.id + ' cobrada y enviada a cocina');
      setCart([]);
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
      <Header titulo="Caja" sub="Punto de venta, movimientos y arqueo" />
      <div className="pos">
        <div>
          <div className="cats">{cats.map(k => <button key={k} className={cat === k ? 'on' : ''} onClick={() => setCat(k)}>{k}</button>)}</div>
          <div className="pgrid">
            {lista.map(p => (
              <button key={p.id} className="pb" disabled={!caja} onClick={() => add(p.id)}>
                <b>{p.nombre}</b><span>{bs(p.precio)}</span>
              </button>
            ))}
          </div>
          {!caja && <div className="error" style={{ marginTop: 12 }}>Abre la caja para poder vender.</div>}
        </div>
        <div className="grid">
          <div className="card cart">
            <h3>Venta en mostrador</h3>
            {cart.length ? cart.map(i => (
              <div key={i.id} className="ln">
                <span className="n">{prod(i.id).nombre}</span>
                <div className="qty"><button onClick={() => dec(i.id)}>−</button><b style={{ minWidth: 18, textAlign: 'center' }}>{i.q}</b><button onClick={() => add(i.id)}>+</button></div>
                <span style={{ minWidth: 62, textAlign: 'right' }}>{bs(prod(i.id).precio * i.q)}</span>
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

          {caja && (
            <div className="card">
              <h3>Movimientos del turno</h3>
              <table><tbody>
                {movs.slice(0, 30).map(m => (
                  <tr key={m.id}>
                    <td className="mute">{hhmm(m.created_at)}</td>
                    <td>{m.concepto}<div className="mute" style={{ fontSize: 12 }}>{m.metodo}</div></td>
                    <td className={'r ' + (m.tipo === 'egreso' ? 'down' : '')}>{m.tipo === 'egreso' ? '−' : ''}{bs(m.monto)}</td>
                  </tr>
                ))}
              </tbody></table>
              {!movs.length && <div className="empty">Sin movimientos todavía</div>}
            </div>
          )}
        </div>
      </div>
      {arqueo && caja && <Arqueo caja={caja} t={t} esperado={esperado} total={totalVentas} cerrar={() => setArqueo(false)} toast={toast} />}
      <Toasts />
    </>
  );
}

function Arqueo({ caja, t, esperado, total, cerrar, toast }) {
  const [contado, setContado] = useState('');
  const dif = contado === '' ? null : Number(contado) - esperado;
  async function confirmar() {
    if (contado === '') return;
    const { error } = await supabase.from('cash_sessions').update({
      cerrada_at: new Date().toISOString(), esperado, monto_contado: Number(contado), diferencia: dif
    }).eq('id', caja.id);
    if (error) return toast('⚠️ ' + error.message);
    toast('Caja cerrada · diferencia ' + bs(dif));
    cerrar();
  }
  return (
    <Modal titulo="Cierre de caja y arqueo" onClose={cerrar}>
      <div className="sumrow"><span>Ventas del turno</span><b>{bs(total)}</b></div>
      {METODOS.map(m => <div key={m} className="sumrow"><span className="mute">{m}</span><span>{bs(t[m])}</span></div>)}
      <div className="sumrow"><span>Efectivo esperado en caja</span><b>{bs(esperado)}</b></div>
      <label className="fl" style={{ marginTop: 14 }}>Efectivo contado (Bs)</label>
      <input className="inp" type="number" autoFocus value={contado} onChange={e => setContado(e.target.value)} placeholder={String(Math.round(esperado))} />
      <div className="bigtot" style={{ fontSize: 16 }}>
        <span>Diferencia</span>
        <span className={dif === null ? '' : dif < 0 ? 'down' : 'up'}>
          {dif === null ? '—' : (dif > 0 ? '+' : '') + bs(dif) + (dif < 0 ? ' faltante' : dif > 0 ? ' sobrante' : ' ✓')}
        </span>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn" onClick={cerrar}>Cancelar</button>
        <button className="btn pri" onClick={confirmar}>Confirmar cierre</button>
      </div>
    </Modal>
  );
}

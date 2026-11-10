'use client';
import { useCallback, useEffect, useState } from 'react';
import { useDatos, useToast } from '@/components/Datos';
import { Header, Kpi } from '@/components/UI';
import { supabase } from '@/lib/supabaseClient';
import { bs } from '@/lib/format';

const CATS_GASTO = ['Alquiler', 'Sueldos', 'Servicios (luz, agua, internet)', 'Gas', 'Insumos', 'Publicidad', 'Mantenimiento', 'Sistema y WhatsApp', 'Otros'];

export default function Finanzas() {
  const { settings } = useDatos();
  const { toast, Toasts } = useToast();
  const [ped, setPed] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [g, setG] = useState({ categoria: 'Alquiler', descripcion: '', monto: '', fecha: new Date().toISOString().slice(0, 10) });

  const ini30 = new Date(); ini30.setHours(0, 0, 0, 0); ini30.setDate(ini30.getDate() - 29);
  const iniMes = new Date(); iniMes.setHours(0, 0, 0, 0); iniMes.setDate(1);
  const desde = ini30 < iniMes ? ini30 : iniMes;

  const cargar = useCallback(async () => {
    const [{ data: o }, { data: e }] = await Promise.all([
      supabase.from('orders').select('id,total,envio,canal,created_at,metodo_pago,order_items(nombre,cantidad,precio,costo)')
        .eq('pagado', true).neq('estado', 'cancelado').gte('created_at', desde.toISOString()).limit(5000),
      supabase.from('expenses').select('*').gte('fecha', iniMes.toISOString().slice(0, 10)).order('fecha', { ascending: false })
    ]);
    setPed(o || []); setGastos(e || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { cargar(); const iv = setInterval(cargar, 60000); return () => clearInterval(iv); }, [cargar]);

  const com = Number(settings ? settings.comision_app : 20) / 100;
  const costoDe = o => (o.order_items || []).reduce((s, i) => s + Number(i.costo) * i.cantidad, 0);
  const comDe = o => (o.canal === 'PedidosYa' || o.metodo_pago === 'App' ? Number(o.total) * com : 0);
  const sum = (l, f) => l.reduce((s, x) => s + f(x), 0);

  const hoyIni = new Date(); hoyIni.setHours(0, 0, 0, 0);
  const hoy = ped.filter(o => new Date(o.created_at) >= hoyIni);
  const vHoy = sum(hoy, o => Number(o.total)), cHoy = sum(hoy, costoDe), comHoy = sum(hoy, comDe);

  const dias = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(hoyIni); d.setDate(d.getDate() - i);
    const f = new Date(d); f.setDate(f.getDate() + 1);
    dias.push({ d, hoy: i === 0, v: sum(ped.filter(o => new Date(o.created_at) >= d && new Date(o.created_at) < f), o => Number(o.total)) });
  }
  const dmax = Math.max(1, ...dias.map(x => x.v));

  const canal = {};
  hoy.forEach(o => { canal[o.canal] = (canal[o.canal] || 0) + Number(o.total); });
  const cmax = Math.max(1, ...Object.values(canal));

  const prod = {};
  ped.filter(o => new Date(o.created_at) >= iniMes).forEach(o => (o.order_items || []).forEach(i => {
    prod[i.nombre] = prod[i.nombre] || { n: i.nombre, q: 0, v: 0, g: 0 };
    prod[i.nombre].q += i.cantidad; prod[i.nombre].v += i.precio * i.cantidad; prod[i.nombre].g += (i.precio - i.costo) * i.cantidad;
  }));
  const top = Object.values(prod).sort((a, b) => b.v - a.v);

  const mes = ped.filter(o => new Date(o.created_at) >= iniMes);
  const vMes = sum(mes, o => Number(o.total)), cMes = sum(mes, costoDe), comMes = sum(mes, comDe);
  const gMes = sum(gastos, x => Number(x.monto));
  const util = vMes - cMes - comMes - gMes;
  const ticket = mes.length ? vMes / mes.length : 0;
  const mgUnit = ticket - (mes.length ? (cMes + comMes) / mes.length : 0);
  const pe = mgUnit > 0 ? Math.ceil(gMes / mgUnit) : 0;
  const porCat = {};
  gastos.forEach(x => { porCat[x.categoria] = (porCat[x.categoria] || 0) + Number(x.monto); });

  async function agregarGasto() {
    if (!(Number(g.monto) > 0)) return toast('Escribe el monto');
    const { error } = await supabase.from('expenses').insert({ ...g, monto: Number(g.monto) });
    if (error) return toast('⚠️ ' + error.message);
    setG({ ...g, descripcion: '', monto: '' }); cargar(); toast('Gasto registrado');
  }
  async function borrarGasto(id) {
    if (!window.confirm('¿Borrar este gasto?')) return;
    await supabase.from('expenses').delete().eq('id', id); cargar();
  }

  return (
    <>
      <Header titulo="Finanzas" sub="Ventas, costos y utilidad calculados automáticamente" />
      <div className="kpis">
        <Kpi l="Ventas de hoy" v={bs(vHoy)} d={hoy.length + ' pedidos cobrados'} />
        <Kpi l="Costo de mercadería (hoy)" v={bs(cHoy)} d={vHoy ? Math.round((cHoy / vHoy) * 100) + '% de las ventas' : ''} />
        <Kpi l="Comisiones de apps (hoy)" v={bs(comHoy)} d={Math.round(com * 100) + '% sobre pedidos de apps'} />
        <Kpi l="Margen bruto de hoy" v={bs(vHoy - cHoy - comHoy)} d={vHoy ? <span className="up">{Math.round(((vHoy - cHoy - comHoy) / vHoy) * 100)}% de margen</span> : ''} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', marginBottom: 16 }}>
        <div className="card">
          <h3>Ventas de los últimos 7 días</h3>
          <div className="bars">
            {dias.map(x => (
              <div key={x.d.toISOString()} className={'bar' + (x.hoy ? ' today' : '')}>
                <span className="lab">{(Math.round(x.v / 100) / 10) + 'k'}</span>
                <div className="bv" style={{ height: (x.v / dmax) * 100 + '%' }} />
                <small>{x.hoy ? 'Hoy' : x.d.toLocaleDateString('es-BO', { weekday: 'short' })}</small>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>Ventas por canal (hoy)</h3>
          {Object.keys(canal).length ? Object.entries(canal).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <div key={k} className="hbar"><span>{k}</span><div className="tr"><div style={{ width: (v / cmax) * 100 + '%' }} /></div><span style={{ textAlign: 'right' }}>{bs(v)}</span></div>
          )) : <div className="empty">Sin ventas hoy</div>}
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', marginBottom: 16 }}>
        <div className="card">
          <h3>Productos del mes</h3>
          <table>
            <thead><tr><th>Producto</th><th className="r">Unid.</th><th className="r">Ventas</th><th className="r">Ganancia</th></tr></thead>
            <tbody>
              {top.slice(0, 12).map(p => <tr key={p.n}><td>{p.n}</td><td className="r">{p.q}</td><td className="r">{bs(p.v)}</td><td className="r up">{bs(p.g)}</td></tr>)}
            </tbody>
          </table>
          {top.length > 3 && <div className="mute" style={{ fontSize: 12.5, marginTop: 8 }}>Menos vendido del mes: <b>{top[top.length - 1].n}</b> ({top[top.length - 1].q} unid.)</div>}
          {!top.length && <div className="empty">Sin ventas este mes</div>}
        </div>
        <div className="card">
          <h3>Estado de resultados del mes</h3>
          <div className="sumrow"><b>Ventas</b><b>{bs(vMes)}</b></div>
          <div className="sumrow"><span>− Costo de mercadería</span><span>{bs(cMes)}</span></div>
          <div className="sumrow"><span>− Comisiones de apps</span><span>{bs(comMes)}</span></div>
          {Object.entries(porCat).map(([k, v]) => <div key={k} className="sumrow"><span className="mute">− {k}</span><span className="mute">{bs(v)}</span></div>)}
          <div className="bigtot" style={{ fontSize: 17 }}><span>Utilidad neta</span><span className={util >= 0 ? 'up' : 'down'}>{bs(util)}</span></div>
          {gMes > 0 && pe > 0 && (
            <div className="mute" style={{ fontSize: 12.5, marginTop: 10 }}>
              Punto de equilibrio: <b style={{ color: 'var(--ink)' }}>{pe} pedidos al mes</b> (~{Math.ceil(pe / 30)} por día) para cubrir los gastos registrados. Llevas {mes.length}.
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Gastos del mes</h3>
        <div className="formrow" style={{ gridTemplateColumns: '1.3fr 2fr 1fr 1fr auto' }}>
          <select className="inp" value={g.categoria} onChange={e => setG({ ...g, categoria: e.target.value })}>{CATS_GASTO.map(c => <option key={c}>{c}</option>)}</select>
          <input className="inp" placeholder="Descripción" value={g.descripcion} onChange={e => setG({ ...g, descripcion: e.target.value })} />
          <input className="inp" type="number" placeholder="Monto Bs" value={g.monto} onChange={e => setG({ ...g, monto: e.target.value })} />
          <input className="inp" type="date" value={g.fecha} onChange={e => setG({ ...g, fecha: e.target.value })} />
          <button className="btn pri" onClick={agregarGasto}>Agregar</button>
        </div>
        <table style={{ marginTop: 10 }}>
          <tbody>
            {gastos.map(x => (
              <tr key={x.id}><td className="mute">{x.fecha}</td><td>{x.categoria}</td><td className="mute">{x.descripcion}</td><td className="r">{bs(x.monto)}</td>
                <td className="r"><button className="btn sm" onClick={() => borrarGasto(x.id)}>✕</button></td></tr>
            ))}
          </tbody>
        </table>
        {!gastos.length && <div className="empty">Registra alquiler, sueldos y servicios para ver la utilidad real del mes</div>}
      </div>
      <Toasts />
    </>
  );
}

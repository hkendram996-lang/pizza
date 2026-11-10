'use client';
import { useState } from 'react';
import { useDatos, useToast } from '@/components/Datos';
import { Header } from '@/components/UI';
import { supabase } from '@/lib/supabaseClient';

const CATS = ['Pizzas', 'Combos', 'Bebidas', 'Extras', 'Postres'];

export default function Catalogo() {
  const { products, orders } = useDatos();
  const { toast, Toasts } = useToast();
  const [n, setN] = useState({ nombre: '', categoria: 'Pizzas', descripcion: '', precio: '', costo: '' });

  const vendidos = {};
  orders.forEach(o => { if (o.estado !== 'cancelado') (o.order_items || []).forEach(i => { vendidos[i.product_id] = (vendidos[i.product_id] || 0) + i.cantidad; }); });

  async function actualizar(id, cambios) {
    const { error } = await supabase.from('products').update(cambios).eq('id', id);
    if (error) toast('⚠️ ' + error.message);
  }
  async function agregar() {
    if (!n.nombre || !(Number(n.precio) > 0)) return toast('Completa al menos nombre y precio');
    const { error } = await supabase.from('products').insert({
      nombre: n.nombre, categoria: n.categoria, descripcion: n.descripcion || null,
      precio: Number(n.precio), costo: Number(n.costo) || 0, orden: products.length + 1
    });
    if (error) return toast('⚠️ ' + error.message);
    toast('Producto "' + n.nombre + '" agregado. El agente ya puede ofrecerlo.');
    setN({ nombre: '', categoria: 'Pizzas', descripcion: '', precio: '', costo: '' });
  }
  async function importar(e) {
    const file = e.target.files[0];
    if (!file) return;
    const txt = await file.text();
    const filas = txt.split(/\r?\n/).slice(1).map(l => l.split(/[,;]/).map(s => s && s.trim())).filter(f => f[0] && Number(f[2]) > 0);
    const { error } = await supabase.from('products').insert(filas.map((f, i) => ({
      nombre: f[0], categoria: f[1] || 'Pizzas', precio: Number(f[2]), costo: Number(f[3]) || 0, descripcion: f[4] || null, orden: products.length + i + 1
    })));
    if (error) toast('⚠️ ' + error.message); else toast(filas.length + ' productos importados');
    e.target.value = '';
  }

  return (
    <>
      <Header titulo="Catálogo" sub="Lo que el agente IA puede ofrecer y vender" />
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Agregar producto</h3>
        <div className="formrow">
          <div><label className="fl">Nombre</label><input className="inp" value={n.nombre} onChange={e => setN({ ...n, nombre: e.target.value })} placeholder="Ej. Napolitana familiar" /></div>
          <div><label className="fl">Categoría</label><select className="inp" value={n.categoria} onChange={e => setN({ ...n, categoria: e.target.value })}>{CATS.map(c => <option key={c}>{c}</option>)}</select></div>
          <div><label className="fl">Precio (Bs)</label><input className="inp" type="number" min="0" value={n.precio} onChange={e => setN({ ...n, precio: e.target.value })} /></div>
          <div><label className="fl">Costo (Bs)</label><input className="inp" type="number" min="0" value={n.costo} onChange={e => setN({ ...n, costo: e.target.value })} /></div>
          <div><label className="fl">&nbsp;</label><button className="btn pri" onClick={agregar}>Agregar</button></div>
        </div>
        <input className="inp" style={{ marginTop: 8 }} value={n.descripcion} onChange={e => setN({ ...n, descripcion: e.target.value })} placeholder="Descripción para el agente (ingredientes, tamaño, porciones)" />
        <div className="mute" style={{ fontSize: 12.5, marginTop: 10 }}>
          ¿Tienes el menú en Excel? Guárdalo como CSV con columnas <span className="mono">nombre,categoria,precio,costo,descripcion</span> y súbelo:{' '}
          <input type="file" accept=".csv,text/csv" onChange={importar} style={{ fontSize: 12 }} />
        </div>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Producto</th><th>Categoría</th><th className="r">Precio</th><th className="r">Costo</th><th className="r">Margen</th><th className="r">Vendidos hoy</th><th className="r">Activo</th></tr></thead>
          <tbody>
            {products.map(p => {
              const mg = p.precio > 0 ? ((p.precio - p.costo) / p.precio) * 100 : 0;
              const estilo = mg >= 60 ? { background: 'var(--green2)', color: 'var(--green)' } : mg >= 45 ? { background: 'var(--amber2)', color: 'var(--amber)' } : { background: 'var(--red2)', color: 'var(--red)' };
              return (
                <tr key={p.id} className={p.activo ? '' : 'off'}>
                  <td>
                    <input className="inp" style={{ width: '100%', textAlign: 'left', border: 'none', padding: 0, background: 'none', fontWeight: 500 }} defaultValue={p.nombre}
                      onBlur={e => e.target.value !== p.nombre && actualizar(p.id, { nombre: e.target.value })} />
                    {p.descripcion && <div className="mute" style={{ fontSize: 12 }}>{p.descripcion}</div>}
                  </td>
                  <td>
                    <select className="inp" style={{ width: 110 }} value={p.categoria} onChange={e => actualizar(p.id, { categoria: e.target.value })}>
                      {[...new Set([...CATS, p.categoria])].map(c => <option key={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="r"><input className="inp" type="number" defaultValue={p.precio} key={'p' + p.precio} onBlur={e => Number(e.target.value) !== Number(p.precio) && actualizar(p.id, { precio: Number(e.target.value) || 0 })} /></td>
                  <td className="r"><input className="inp" type="number" defaultValue={p.costo} key={'c' + p.costo} onBlur={e => Number(e.target.value) !== Number(p.costo) && actualizar(p.id, { costo: Number(e.target.value) || 0 })} /></td>
                  <td className="r"><span className="chip" style={estilo}>{Math.round(mg)}%</span></td>
                  <td className="r">{vendidos[p.id] || 0}</td>
                  <td className="r"><button className={'tgl' + (p.activo ? ' on' : '')} aria-label="Activo" onClick={() => actualizar(p.id, { activo: !p.activo })} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Toasts />
    </>
  );
}

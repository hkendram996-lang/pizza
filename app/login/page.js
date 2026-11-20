'use client';
import { useEffect, useState } from 'react';
import { useDatos, useToast } from '@/components/Datos';
import { Header } from '@/components/UI';
import { supabase } from '@/lib/supabaseClient';
import { bs } from '@/lib/format';
import Probador from '@/components/Probador';

const ROLES = ['pendiente', 'admin', 'cajero', 'cocina', 'repartidor'];
const COLORES = ['#d6402b', '#2c66d4', '#6a4fc9', '#b97d0c', '#2f8a58', '#c2306f', '#0f8b8d'];

export default function Ajustes() {
  const { settings, zones, riders } = useDatos();
  const { toast, Toasts } = useToast();
  const [tab, setTab] = useState('negocio');
  const [s, setS] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [z, setZ] = useState({ nombre: '', radio_km: '', tarifa: '', minutos: '35' });
  const [r, setR] = useState({ nombre: '', telefono: '', user_id: '' });

  useEffect(() => { if (settings && !s) setS(settings); }, [settings, s]);
  const cargarUsuarios = async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at');
    setUsuarios(data || []);
  };
  useEffect(() => { cargarUsuarios(); }, []);

  const ok = (error, msg) => (error ? toast('⚠️ ' + error.message) : toast(msg));

  async function guardarNegocio() {
    const { id, ...resto } = s;
    const { error } = await supabase.from('settings').update({
      ...resto, local_lat: Number(resto.local_lat), local_lng: Number(resto.local_lng), comision_app: Number(resto.comision_app)
    }).eq('id', 1);
    ok(error, 'Datos del negocio guardados');
  }
  function miUbicacion() {
    if (!navigator.geolocation) return toast('Tu navegador no permite ubicación');
    navigator.geolocation.getCurrentPosition(
      p => setS({ ...s, local_lat: p.coords.latitude.toFixed(6), local_lng: p.coords.longitude.toFixed(6) }),
      () => toast('No se pudo obtener la ubicación')
    );
  }
  async function agregarZona() {
    if (!z.nombre || !(Number(z.radio_km) > 0)) return toast('Completa nombre y radio');
    const { error } = await supabase.from('zones').insert({ nombre: z.nombre, radio_km: Number(z.radio_km), tarifa: Number(z.tarifa) || 0, minutos: Number(z.minutos) || 35 });
    ok(error, 'Zona agregada'); setZ({ nombre: '', radio_km: '', tarifa: '', minutos: '35' });
  }
  async function agregarRider() {
    if (!r.nombre) return toast('Escribe el nombre');
    const { error } = await supabase.from('riders').insert({
      nombre: r.nombre, telefono: r.telefono || null, user_id: r.user_id || null, color: COLORES[riders.length % COLORES.length]
    });
    ok(error, 'Repartidor agregado'); setR({ nombre: '', telefono: '', user_id: '' });
  }
  async function cambiarRol(id, rol) {
    const { error } = await supabase.from('profiles').update({ rol }).eq('id', id);
    ok(error, 'Rol actualizado'); cargarUsuarios();
  }

  return (
    <>
      <Header titulo="Ajustes" sub="Negocio, zonas de envío, repartidores y usuarios" />
      <div className="tabs">
        {[['negocio', 'Negocio y agente'], ['probar', '🤖 Probar agente'], ['zonas', 'Zonas de envío'], ['repartidores', 'Repartidores'], ['usuarios', 'Usuarios']].map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'negocio' && s && (
        <div className="card" style={{ maxWidth: 760 }}>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label className="fl">Nombre del negocio</label><input className="inp" value={s.nombre_negocio || ''} onChange={e => setS({ ...s, nombre_negocio: e.target.value })} /></div>
            <div><label className="fl">Horario de atención</label><input className="inp" value={s.horario || ''} onChange={e => setS({ ...s, horario: e.target.value })} /></div>
            <div style={{ gridColumn: '1/-1' }}><label className="fl">Dirección del local</label><input className="inp" value={s.direccion_local || ''} onChange={e => setS({ ...s, direccion_local: e.target.value })} /></div>
            <div><label className="fl">Latitud del local</label><input className="inp" value={s.local_lat} onChange={e => setS({ ...s, local_lat: e.target.value })} /></div>
            <div><label className="fl">Longitud del local</label><input className="inp" value={s.local_lng} onChange={e => setS({ ...s, local_lng: e.target.value })} /></div>
            <div style={{ gridColumn: '1/-1' }}><button className="btn sm" onClick={miUbicacion}>📍 Usar mi ubicación actual (estando en el local)</button></div>
            <div><label className="fl">Comisión de apps de delivery (%)</label><input className="inp" type="number" value={s.comision_app} onChange={e => setS({ ...s, comision_app: e.target.value })} /></div>
            <div><label className="fl">Link de la imagen del QR de cobro</label><input className="inp" placeholder="https://…/qr.png" value={s.qr_imagen_url || ''} onChange={e => setS({ ...s, qr_imagen_url: e.target.value })} /></div>
            <div style={{ gridColumn: '1/-1' }}>
              <label className="fl">Instrucciones extra para el agente IA</label>
              <textarea className="inp" rows={5} placeholder="Ej: Los martes 2x1 en pizzas medianas. No hacemos mitades en la Cruceña. Si piden más de 5 pizzas, deriva a una persona."
                value={s.instrucciones_agente || ''} onChange={e => setS({ ...s, instrucciones_agente: e.target.value })} />
            </div>
          </div>
          <button className="btn pri" style={{ marginTop: 14 }} onClick={guardarNegocio}>Guardar</button>
        </div>
      )}

      {tab === 'probar' && <Probador />}

      {tab === 'zonas' && (
        <div className="card" style={{ maxWidth: 760 }}>
          <p className="mute" style={{ marginTop: 0 }}>Cada zona es un círculo alrededor del local. Se usa la zona más pequeña que contiene la ubicación del cliente; fuera de todas, no hay delivery.</p>
          <table>
            <thead><tr><th>Nombre</th><th className="r">Radio (km)</th><th className="r">Tarifa</th><th className="r">Minutos</th><th className="r">Activa</th></tr></thead>
            <tbody>
              {zones.map(x => (
                <tr key={x.id} className={x.activo ? '' : 'off'}>
                  <td>{x.nombre}</td><td className="r">{x.radio_km}</td><td className="r">{bs(x.tarifa)}</td><td className="r">{x.minutos}</td>
                  <td className="r"><button className={'tgl' + (x.activo ? ' on' : '')} aria-label="Activa" onClick={() => supabase.from('zones').update({ activo: !x.activo }).eq('id', x.id).then(({ error }) => error && toast(error.message))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="formrow" style={{ marginTop: 12 }}>
            <input className="inp" placeholder="Nombre" value={z.nombre} onChange={e => setZ({ ...z, nombre: e.target.value })} />
            <input className="inp" type="number" placeholder="Radio km" value={z.radio_km} onChange={e => setZ({ ...z, radio_km: e.target.value })} />
            <input className="inp" type="number" placeholder="Tarifa Bs" value={z.tarifa} onChange={e => setZ({ ...z, tarifa: e.target.value })} />
            <input className="inp" type="number" placeholder="Minutos" value={z.minutos} onChange={e => setZ({ ...z, minutos: e.target.value })} />
            <button className="btn pri" onClick={agregarZona}>Agregar</button>
          </div>
        </div>
      )}

      {tab === 'repartidores' && (
        <div className="card" style={{ maxWidth: 760 }}>
          <p className="mute" style={{ marginTop: 0 }}>Para que un repartidor use la app en su celular: que cree su cuenta en la pantalla de login, dale el rol <b>repartidor</b> en Usuarios y vincúlalo aquí.</p>
          <table>
            <thead><tr><th>Repartidor</th><th>Teléfono</th><th>Usuario vinculado</th><th className="r">Activo</th></tr></thead>
            <tbody>
              {riders.map(x => (
                <tr key={x.id} className={x.activo ? '' : 'off'}>
                  <td><span className="av" style={{ background: x.color, width: 22, height: 22, display: 'inline-grid', fontSize: 11, marginRight: 8 }}>{x.nombre[0]}</span>{x.nombre}</td>
                  <td>{x.telefono}</td>
                  <td>
                    <select className="inp" value={x.user_id || ''} onChange={e => supabase.from('riders').update({ user_id: e.target.value || null }).eq('id', x.id).then(({ error }) => ok(error, 'Vinculado'))}>
                      <option value="">— sin vincular —</option>
                      {usuarios.filter(u => u.rol === 'repartidor').map(u => <option key={u.id} value={u.id}>{u.nombre} ({u.email})</option>)}
                    </select>
                  </td>
                  <td className="r"><button className={'tgl' + (x.activo ? ' on' : '')} aria-label="Activo" onClick={() => supabase.from('riders').update({ activo: !x.activo }).eq('id', x.id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="formrow" style={{ marginTop: 12, gridTemplateColumns: '1.5fr 1fr 1.5fr auto' }}>
            <input className="inp" placeholder="Nombre" value={r.nombre} onChange={e => setR({ ...r, nombre: e.target.value })} />
            <input className="inp" placeholder="Teléfono" value={r.telefono} onChange={e => setR({ ...r, telefono: e.target.value })} />
            <select className="inp" value={r.user_id} onChange={e => setR({ ...r, user_id: e.target.value })}>
              <option value="">Usuario (opcional)</option>
              {usuarios.filter(u => u.rol === 'repartidor').map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
            <button className="btn pri" onClick={agregarRider}>Agregar</button>
          </div>
        </div>
      )}

      {tab === 'usuarios' && (
        <div className="card" style={{ maxWidth: 760 }}>
          <p className="mute" style={{ marginTop: 0 }}>Cada persona crea su cuenta en la pantalla de login y aparece aquí como <b>pendiente</b>. Asígnale su rol: admin (todo), cajero (pedidos y caja), cocina (solo comandas), repartidor (app de entregas).</p>
          <table>
            <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th></tr></thead>
            <tbody>
              {usuarios.map(u => (
                <tr key={u.id}>
                  <td>{u.nombre}</td><td className="mute">{u.email}</td>
                  <td><select className="inp" value={u.rol} onChange={e => cambiarRol(u.id, e.target.value)}>{ROLES.map(x => <option key={x}>{x}</option>)}</select></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Toasts />
    </>
  );
}

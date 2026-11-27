'use client';
import { useEffect, useState } from 'react';
import { useDatos, useToast } from '@/components/Datos';
import { Header } from '@/components/UI';
import { supabase, apiPost } from '@/lib/supabaseClient';
import { bs } from '@/lib/format';
import Probador from '@/components/Probador';

const ROLES = ['pendiente', 'admin', 'cajero', 'cocina', 'repartidor', 'mozo'];
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
  async function equipo(datos, msg) {
    try { await apiPost('/api/equipo', datos); toast(msg); cargarUsuarios(); return true; }
    catch (e) { toast('⚠️ ' + e.message); return false; }
  }
  const cambiarRol = (id, rol) => equipo({ accion: 'rol', id, rol }, 'Rol actualizado');

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
          <p className="mute" style={{ marginTop: 0 }}>Para que un repartidor use la app en su celular, créalo en <b>Usuarios</b> con el rol <b>Repartidor</b>: aparece aquí automáticamente, ya vinculado.</p>
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

      {tab === 'usuarios' && <Equipo usuarios={usuarios} equipo={equipo} cambiarRol={cambiarRol} />}
      <Toasts />
    </>
  );
}

const ETIQUETA = { admin: 'Administrador', cajero: 'Cajero/a', cocina: 'Cocina', repartidor: 'Repartidor', mozo: 'Mozo', pendiente: 'Sin acceso' };
const pinAlAzar = () => String(Math.floor(100000 + Math.random() * 900000));
const telVisible = t => (t ? (t.startsWith('591') ? t.slice(3) : t) : '');

function Equipo({ usuarios, equipo, cambiarRol }) {
  const [n, setN] = useState({ nombre: '', telefono: '', pin: pinAlAzar(), rol: 'cajero' });
  const [creado, setCreado] = useState(null);

  async function crear() {
    const ok = await equipo({ accion: 'crear', ...n }, 'Usuario creado');
    if (ok) { setCreado({ ...n }); setN({ nombre: '', telefono: '', pin: pinAlAzar(), rol: n.rol }); }
  }
  async function nuevoPin(u) {
    const pin = window.prompt('Nuevo PIN de 6 números para ' + u.nombre + ':', pinAlAzar());
    if (pin) equipo({ accion: 'pin', id: u.id, pin }, 'PIN actualizado: ' + pin);
  }

  return (
    <div className="grid" style={{ maxWidth: 820 }}>
      <div className="card">
        <h3>Agregar persona al equipo</h3>
        <p className="mute" style={{ marginTop: 0 }}>Cada persona entra con <b>su celular y un PIN de 6 números</b>. Elige qué puede ver: <b>Cajero/a</b> (pedidos, caja, delivery y catálogo), <b>Cocina</b> (solo comandas), <b>Repartidor</b> (app de entregas) o <b>Administrador</b> (todo).</p>
        <div className="formrow" style={{ gridTemplateColumns: '1.4fr 1.1fr 0.9fr 1fr auto' }}>
          <div><label className="fl">Nombre</label><input className="inp" value={n.nombre} onChange={e => setN({ ...n, nombre: e.target.value })} placeholder="Ej. Carlos" /></div>
          <div><label className="fl">Celular</label><input className="inp" inputMode="tel" value={n.telefono} onChange={e => setN({ ...n, telefono: e.target.value })} placeholder="70012345" /></div>
          <div><label className="fl">PIN</label><input className="inp" inputMode="numeric" maxLength={6} value={n.pin} onChange={e => setN({ ...n, pin: e.target.value.replace(/\D/g, '') })} /></div>
          <div><label className="fl">Rol</label>
            <select className="inp" value={n.rol} onChange={e => setN({ ...n, rol: e.target.value })}>
              {['cajero', 'mozo', 'cocina', 'repartidor', 'admin'].map(r => <option key={r} value={r}>{ETIQUETA[r]}</option>)}
            </select></div>
          <div><label className="fl">&nbsp;</label><button className="btn pri" onClick={crear}>Crear</button></div>
        </div>
        {creado && (
          <div className="ok-msg" style={{ marginTop: 12 }}>
            ✅ Listo. Mándale esto a <b>{creado.nombre}</b>:<br />
            Entra a <b>{typeof window !== 'undefined' ? window.location.origin : ''}</b> con tu celular <b>{creado.telefono}</b> y el PIN <b>{creado.pin}</b>.
          </div>
        )}
      </div>

      <div className="card">
        <h3>Equipo</h3>
        <table>
          <thead><tr><th>Nombre</th><th>Acceso</th><th>Rol</th><th className="r">Activo</th><th></th></tr></thead>
          <tbody>
            {usuarios.map(u => (
              <tr key={u.id} className={u.activo === false ? 'off' : ''}>
                <td>{u.nombre}</td>
                <td className="mute">{u.telefono ? '📱 ' + telVisible(u.telefono) : u.email}</td>
                <td>
                  <select className="inp" style={{ width: 140 }} value={u.rol} onChange={e => cambiarRol(u.id, e.target.value)}>
                    {(u.rol === 'pendiente' ? ['pendiente'] : []).concat(['cajero', 'mozo', 'cocina', 'repartidor', 'admin']).map(r => <option key={r} value={r}>{ETIQUETA[r]}</option>)}
                  </select>
                </td>
                <td className="r"><button className={'tgl' + (u.activo !== false ? ' on' : '')} aria-label="Activo"
                  onClick={() => equipo({ accion: 'activo', id: u.id, activo: u.activo === false }, u.activo === false ? 'Usuario activado' : 'Usuario desactivado')} /></td>
                <td className="r">{u.telefono && <button className="btn sm" onClick={() => nuevoPin(u)}>Cambiar PIN</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

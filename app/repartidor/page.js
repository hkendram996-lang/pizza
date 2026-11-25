'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, accion } from '@/lib/supabaseClient';
import { bs, itemsTxt, distanciaKm, faltaMin } from '@/lib/format';
import { alerta, desbloquear, pantallaEncendida } from '@/lib/sonido';

// App del repartidor: se abre en el celular, comparte el GPS y muestra sus pedidos
export default function Repartidor() {
  const router = useRouter();
  const [perfil, setPerfil] = useState(null);
  const [rider, setRider] = useState(null);
  const [pedidos, setPedidos] = useState([]);
  const [local, setLocal] = useState(null);
  const [error, setError] = useState('');
  const [gps, setGps] = useState('');
  const [, setTic] = useState(0);
  const watch = useRef(null);
  const ultimo = useRef(0);
  const conocidos = useRef(null);
  const lock = useRef(null);

  const cargar = useCallback(async uid => {
    const { data: r } = await supabase.from('riders').select('*').eq('user_id', uid).maybeSingle();
    setRider(r);
    if (r) {
      const { data: o } = await supabase.from('orders').select('*, order_items(*)')
        .eq('rider_id', r.id).in('estado', ['nuevo', 'cocina', 'listo', 'camino'])
        .order('listo_estimado', { ascending: true, nullsFirst: false }).limit(10);
      setPedidos(o || []);
    }
  }, []);

  useEffect(() => {
    let canal = null;
    let vivo = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/login'); return; }
      const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      if (!vivo) return;
      setPerfil(p);
      const { data: s } = await supabase.from('settings').select('local_lat, local_lng').eq('id', 1).maybeSingle();
      if (s) setLocal({ lat: s.local_lat, lng: s.local_lng });
      await cargar(session.user.id);
      canal = supabase.channel('rider')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => cargar(session.user.id))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'riders' }, () => cargar(session.user.id))
        .subscribe();
    })();
    const iv = setInterval(() => setTic(t => t + 1), 20000);
    return () => { vivo = false; clearInterval(iv); if (canal) supabase.removeChannel(canal); };
  }, [router, cargar]);

  // Alerta con sonido y vibración: pedido nuevo para mí o pizza que salió del horno
  useEffect(() => {
    const ahora = new Map(pedidos.map(o => [o.id, o.estado]));
    const antes = conocidos.current;
    if (antes) {
      if (pedidos.some(o => !antes.has(o.id) && o.estado !== 'camino')) alerta('nuevo');
      else if (pedidos.some(o => o.estado === 'listo' && antes.get(o.id) && antes.get(o.id) !== 'listo')) alerta('listo');
    }
    conocidos.current = ahora;
  }, [pedidos]);

  // Pantalla encendida mientras está conectado
  useEffect(() => {
    const on = rider && rider.estado !== 'desconectado';
    if (on && !lock.current) pantallaEncendida().then(l => { lock.current = l; });
    if (!on && lock.current) { try { lock.current.release(); } catch { } lock.current = null; }
  }, [rider]);

  // Enviar ubicación GPS cada ~10 segundos mientras está conectado
  useEffect(() => {
    if (!rider || rider.estado === 'desconectado') {
      if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
      watch.current = null;
      return;
    }
    if (watch.current != null || !navigator.geolocation) return;
    watch.current = navigator.geolocation.watchPosition(
      async pos => {
        setGps('📡 GPS activo');
        if (Date.now() - ultimo.current < 10000) return;
        ultimo.current = Date.now();
        await supabase.from('riders').update({
          lat: pos.coords.latitude, lng: pos.coords.longitude, ubicado_at: new Date().toISOString()
        }).eq('id', rider.id);
      },
      () => setGps('⚠️ Activa la ubicación del celular para recibir pedidos'),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
  }, [rider]);

  async function hacer(nombre, datos) {
    setError('');
    desbloquear();
    try { await accion(nombre, datos); await cargar(perfil.id); }
    catch (e) { setError(e.message); }
  }

  if (!perfil) return <div className="center mute">Cargando…</div>;
  if (perfil.rol !== 'repartidor' && perfil.rol !== 'admin') {
    return <div className="center"><div className="authbox"><h1>Sin acceso</h1><p className="mute">Esta pantalla es para repartidores.</p></div></div>;
  }
  if (!rider) {
    return (
      <div className="center"><div className="authbox">
        <h1>Hola, {perfil.nombre}</h1>
        <p className="mute">Tu usuario todavía no está vinculado a un repartidor. Pide al administrador que lo haga en <b>Ajustes → Repartidores</b>.</p>
        <button className="btn" onClick={() => supabase.auth.signOut().then(() => router.replace('/login'))}>Salir</button>
      </div></div>
    );
  }

  const conectado = rider.estado !== 'desconectado';
  const enCalle = pedidos.filter(o => o.estado === 'camino');
  const porRecoger = pedidos.filter(o => o.estado !== 'camino');
  const listos = porRecoger.filter(o => o.estado === 'listo');
  const kmLocal = local && rider.lat != null ? distanciaKm(rider, local) : null;
  const yaEnLocal = kmLocal != null && kmLocal <= 0.15;
  const rutaLocal = local ? `https://www.google.com/maps/dir/?api=1&destination=${local.lat},${local.lng}&travelmode=driving` : null;

  function salir() {
    const faltan = porRecoger.filter(o => o.estado !== 'listo');
    if (faltan.length && !window.confirm('El pedido ' + faltan.map(o => '#' + o.id).join(', ') + ' sigue en el horno y se lo darán a otro repartidor. ¿Salir igual con ' + listos.map(o => '#' + o.id).join(', ') + '?')) return;
    hacer('salir');
  }

  return (
    <div className="rider-app" onClick={desbloquear}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="row"><div className="av" style={{ background: rider.color }}>{rider.nombre[0]}</div><b style={{ fontSize: 18 }}>{rider.nombre}</b></div>
        <button className="btn sm" onClick={() => supabase.auth.signOut().then(() => router.replace('/login'))}>Salir</button>
      </div>
      {error && <div className="error">{error}</div>}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <b>{enCalle.length ? 'Entregando' : porRecoger.length ? 'Te llamaron al local' : conectado ? 'Disponible' : 'Desconectado'}</b>
            <div className="mute" style={{ fontSize: 12.5 }}>{conectado ? gps || 'Buscando GPS…' : 'No recibirás pedidos'}</div>
          </div>
          {rider.estado !== 'ocupado' && (
            <button className={'btn ' + (conectado ? '' : 'ok')} onClick={() => hacer('disponible', { disponible: !conectado })}>
              {conectado ? 'Desconectarme' : 'Estoy disponible'}
            </button>
          )}
        </div>
        {conectado && <div className="mute" style={{ fontSize: 12, marginTop: 6 }}>🔔 Deja esta pantalla abierta: suena y vibra cuando te toca un pedido.</div>}
      </div>

      {porRecoger.length > 0 && (
        <div className="card" style={{ marginBottom: 14, borderLeft: '5px solid var(--amber)' }}>
          <h3 style={{ fontSize: 20 }}>{yaEnLocal ? '🍕 Estás en el local' : '🏃 Ve al local a recoger'}</h3>
          {!yaEnLocal && kmLocal != null && <div className="mute" style={{ marginBottom: 6 }}>Estás a {kmLocal.toFixed(1)} km</div>}
          {porRecoger.map(o => {
            const f = faltaMin(o);
            return (
              <div key={o.id} className="sumrow">
                <span>#{o.id} · {o.cliente_nombre}</span>
                {o.estado === 'listo' ? <b className="up">✅ Lista</b>
                  : <span className="mute">En horno{f != null ? (f > 0 ? ' · sale en ~' + f + ' min' : ' · ya casi') : ''}</span>}
              </div>
            );
          })}
          {!yaEnLocal && rutaLocal && <a className="btn big" style={{ marginTop: 12, textDecoration: 'none' }} href={rutaLocal} target="_blank" rel="noreferrer">🧭 Ruta al local</a>}
          <button className="btn ok big" style={{ marginTop: 8 }} disabled={!listos.length} onClick={salir}>
            {listos.length ? '🍕 Recogí, salgo (' + listos.length + ')' : 'Esperando que salga del horno…'}
          </button>
        </div>
      )}

      {enCalle.map((pedido, i) => {
        const mapsLink = pedido.lat != null ? `https://www.google.com/maps/dir/?api=1&destination=${pedido.lat},${pedido.lng}&travelmode=driving` : null;
        return (
          <div key={pedido.id} className="card" style={{ marginBottom: 14 }}>
            <h3 style={{ fontSize: 20 }}>{enCalle.length > 1 ? (i + 1) + '.ª entrega · ' : ''}Pedido #{pedido.id}</h3>
            <div className="sumrow"><span className="mute">Cliente</span><b>{pedido.cliente_nombre}</b></div>
            {pedido.telefono && <div className="sumrow"><span className="mute">Teléfono</span><a href={'tel:+' + pedido.telefono}>+{pedido.telefono}</a></div>}
            {pedido.direccion && <div className="sumrow"><span className="mute">Dirección</span><span style={{ textAlign: 'right' }}>{pedido.direccion}</span></div>}
            <div className="sumrow"><span className="mute">Lleva</span><span style={{ textAlign: 'right' }}>{itemsTxt(pedido)}</span></div>
            {pedido.nota && <div className="sumrow"><span className="mute">Nota</span><b style={{ color: 'var(--amber)' }}>{pedido.nota}</b></div>}
            <div className="bigtot">
              <span>{pedido.pagado ? 'Ya pagado' : 'Cobrar (' + pedido.metodo_pago + ')'}</span>
              <span className={pedido.pagado ? 'up' : 'down'}>{bs(pedido.total)}</span>
            </div>
            {mapsLink && <a className="btn big" style={{ marginTop: 14, textDecoration: 'none' }} href={mapsLink} target="_blank" rel="noreferrer">🧭 Abrir ruta en Google Maps</a>}
            {pedido.telefono && <a className="btn big" style={{ marginTop: 8, textDecoration: 'none' }} href={'https://wa.me/' + pedido.telefono} target="_blank" rel="noreferrer">💬 Escribir al cliente</a>}
            <button className="btn ok big" style={{ marginTop: 8 }} onClick={() => window.confirm('¿Confirmas que entregaste el pedido' + (pedido.pagado ? '' : ' y cobraste ' + bs(pedido.total)) + '?') && hacer('entregar', { orderId: pedido.id })}>
              ✓ Entregado
            </button>
          </div>
        );
      })}

      {!pedidos.length && (
        <div className="card empty">{conectado ? 'Sin entregas por ahora. Te sonará el celular cuando te toque 🛵' : 'Ponte disponible para recibir pedidos'}</div>
      )}
    </div>
  );
}

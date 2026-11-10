'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, accion } from '@/lib/supabaseClient';
import { bs, itemsTxt } from '@/lib/format';

// App del repartidor: se abre en el celular, comparte el GPS y muestra la entrega actual
export default function Repartidor() {
  const router = useRouter();
  const [perfil, setPerfil] = useState(null);
  const [rider, setRider] = useState(null);
  const [pedido, setPedido] = useState(null);
  const [error, setError] = useState('');
  const [gps, setGps] = useState('');
  const watch = useRef(null);
  const ultimo = useRef(0);

  const cargar = useCallback(async uid => {
    const { data: r } = await supabase.from('riders').select('*').eq('user_id', uid).maybeSingle();
    setRider(r);
    if (r) {
      const { data: o } = await supabase.from('orders').select('*, order_items(*)')
        .eq('rider_id', r.id).eq('estado', 'camino').order('camino_at').limit(1).maybeSingle();
      setPedido(o);
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
      await cargar(session.user.id);
      canal = supabase.channel('rider')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => cargar(session.user.id))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'riders' }, () => cargar(session.user.id))
        .subscribe();
    })();
    return () => { vivo = false; if (canal) supabase.removeChannel(canal); };
  }, [router, cargar]);

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
  const mapsLink = pedido && pedido.lat != null ? `https://www.google.com/maps/dir/?api=1&destination=${pedido.lat},${pedido.lng}&travelmode=driving` : null;

  return (
    <div className="rider-app">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="row"><div className="av" style={{ background: rider.color }}>{rider.nombre[0]}</div><b style={{ fontSize: 18 }}>{rider.nombre}</b></div>
        <button className="btn sm" onClick={() => supabase.auth.signOut().then(() => router.replace('/login'))}>Salir</button>
      </div>
      {error && <div className="error">{error}</div>}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <b>{rider.estado === 'ocupado' ? 'Entregando' : conectado ? 'Disponible' : 'Desconectado'}</b>
            <div className="mute" style={{ fontSize: 12.5 }}>{conectado ? gps || 'Buscando GPS…' : 'No recibirás pedidos'}</div>
          </div>
          {rider.estado !== 'ocupado' && (
            <button className={'btn ' + (conectado ? '' : 'ok')} onClick={() => hacer('disponible', { disponible: !conectado })}>
              {conectado ? 'Desconectarme' : 'Estoy disponible'}
            </button>
          )}
        </div>
      </div>

      {pedido ? (
        <div className="card">
          <h3 style={{ fontSize: 20 }}>Pedido #{pedido.id}</h3>
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
      ) : (
        <div className="card empty">{conectado ? 'Sin entregas por ahora. Te llegará aquí automáticamente 🛵' : 'Ponte disponible para recibir pedidos'}</div>
      )}
    </div>
  );
}

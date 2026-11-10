'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { DatosProvider, useDatos } from '@/components/Datos';

const ICONOS = {
  '': '<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  pedidos: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  cocina: '<path d="M4 11h16v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z"/><path d="M8 7c0-2 1-2 1-4M12 7c0-2 1-2 1-4M16 7c0-2 1-2 1-4"/>',
  delivery: '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17h4l3-7h3l2 7M13 6h3"/>',
  caja: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M7 7V4h10v3M3 12h18"/>',
  catalogo: '<path d="M4 5h7v14H4zM13 5h7v14h-7z"/>',
  finanzas: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'
};

// Qué pantallas ve cada rol
const MENU = [
  ['', 'Inicio', ['admin', 'cajero']],
  ['pedidos', 'Pedidos', ['admin', 'cajero']],
  ['cocina', 'Cocina', ['admin', 'cajero', 'cocina']],
  ['delivery', 'Delivery y mapa', ['admin', 'cajero']],
  ['caja', 'Caja', ['admin', 'cajero']],
  ['catalogo', 'Catálogo', ['admin', 'cajero']],
  ['finanzas', 'Finanzas', ['admin']],
  ['ajustes', 'Ajustes', ['admin']]
];

export default function PanelLayout({ children }) {
  const router = useRouter();
  const [perfil, setPerfil] = useState(undefined);

  useEffect(() => {
    let activo = true;
    async function revisar() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/login'); return; }
      const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      if (!activo) return;
      if (p && p.rol === 'repartidor') { router.replace('/repartidor'); return; }
      setPerfil(p || null);
    }
    revisar();
    const { data: sub } = supabase.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') router.replace('/login'); });
    return () => { activo = false; sub.subscription.unsubscribe(); };
  }, [router]);

  if (perfil === undefined) return <div className="center mute">Cargando…</div>;
  if (!perfil || perfil.rol === 'pendiente') {
    return (
      <div className="center">
        <div className="authbox">
          <h1>Cuenta pendiente</h1>
          <p className="mute">Tu cuenta ya existe, pero el administrador todavía no te asignó un rol. Pídele que entre a <b>Ajustes → Usuarios</b>.</p>
          <button className="btn" onClick={() => supabase.auth.signOut()}>Salir</button>
        </div>
      </div>
    );
  }
  return (
    <DatosProvider perfil={perfil}>
      <Marco perfil={perfil}>{children}</Marco>
    </DatosProvider>
  );
}

function Marco({ perfil, children }) {
  const path = usePathname();
  const router = useRouter();
  const { orders, settings, escalados } = useDatos();
  const actual = path.replace(/^\/panel\/?/, '').split('/')[0];
  const permitido = MENU.find(m => m[0] === actual);

  useEffect(() => {
    if (permitido && !permitido[2].includes(perfil.rol)) router.replace(perfil.rol === 'cocina' ? '/panel/cocina' : '/panel');
  }, [permitido, perfil.rol, router]);

  const cnt = {
    pedidos: orders.filter(o => o.estado === 'nuevo').length + escalados.length,
    cocina: orders.filter(o => o.estado === 'cocina').length,
    delivery: orders.filter(o => o.estado === 'camino').length
  };

  async function toggleAgente() {
    if (perfil.rol !== 'admin' || !settings) return;
    await supabase.from('settings').update({ agente_activo: !settings.agente_activo }).eq('id', 1);
  }
  const on = settings ? settings.agente_activo : false;

  return (
    <div className="app">
      <aside>
        <div className="brand">
          <div className="logo">🍕</div>
          <div><b>{settings ? settings.nombre_negocio : 'Pizzería'}</b><small>Panel de gestión</small></div>
        </div>
        <nav>
          {MENU.filter(m => m[2].includes(perfil.rol)).map(([k, l]) => (
            <Link key={k} href={'/panel' + (k ? '/' + k : '')} className={actual === k ? 'on' : ''}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: ICONOS[k] }} />
              {l}
              {cnt[k] ? <span className="b">{cnt[k]}</span> : null}
            </Link>
          ))}
        </nav>
        <div className="agentbox">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span><span className={'dot' + (on ? '' : ' off')} />Agente IA</span>
            <button className={'switch' + (on ? ' on' : '')} onClick={toggleAgente} title={perfil.rol === 'admin' ? 'Encender / apagar' : 'Solo el administrador'} aria-label="Agente IA" />
          </div>
          <div>{on ? 'Atendiendo WhatsApp' : 'Pausado: responde una persona'}</div>
          <div className="userbox">
            <span>{perfil.nombre} · {perfil.rol}</span>
            <button onClick={() => supabase.auth.signOut()}>Salir</button>
          </div>
        </div>
      </aside>
      <main>{children}</main>
    </div>
  );
}

'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase, apiPost } from '@/lib/supabaseClient';
import { leerUbicacion } from '@/lib/format';

// Conversa con el agente IA desde el panel, como si fueras un cliente de WhatsApp
export default function Probador() {
  const [msgs, setMsgs] = useState([]);
  const [texto, setTexto] = useState('');
  const [ubic, setUbic] = useState('');
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState('');
  const fin = useRef(null);

  const cargar = async () => {
    const { data } = await supabase.from('messages').select('*').eq('telefono', 'prueba').order('created_at').limit(100);
    setMsgs(data || []);
  };
  useEffect(() => { cargar(); }, []);
  useEffect(() => { if (fin.current) fin.current.scrollIntoView({ block: 'nearest' }); }, [msgs.length, pensando]);

  async function mandar(datos) {
    setError(''); setPensando(true);
    setMsgs(m => [...m, { id: 'tmp', rol: 'cliente', texto: datos.texto || '[Compartí mi ubicación]' }]);
    try { await apiPost('/api/probar', datos); }
    catch (e) { setError(e.message); }
    setPensando(false);
    cargar();
  }
  const cls = { cliente: 'c', agente: 'a', humano: 'a', sistema: 's' };

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <p className="mute" style={{ marginTop: 0 }}>
        Escribe como si fueras un cliente. Las respuestas salen del agente real con tu menú y zonas. Los pedidos que confirme se crean de verdad (con teléfono &quot;prueba&quot;): cancélalos desde Pedidos.
      </p>
      <div className="chat" style={{ maxHeight: 420, minHeight: 200 }}>
        {msgs.map((m, i) => <div key={m.id + '-' + i} className={'msg ' + cls[m.rol]}>{m.rol === 'agente' && <div className="who">Agente IA</div>}{m.texto}</div>)}
        {pensando && <div className="msg s">El agente está escribiendo…</div>}
        <div ref={fin} />
      </div>
      {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
      <form style={{ display: 'flex', gap: 6, marginTop: 10 }} onSubmit={e => { e.preventDefault(); if (texto.trim()) { mandar({ texto }); setTexto(''); } }}>
        <input className="inp" placeholder="Hola, quiero una pizza…" value={texto} onChange={e => setTexto(e.target.value)} disabled={pensando} />
        <button className="btn pri sm" disabled={pensando}>Enviar</button>
      </form>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input className="inp" placeholder="Simular ubicación: -17.78, -63.18 o link de Google Maps" value={ubic} onChange={e => setUbic(e.target.value)} />
        <button className="btn sm" disabled={pensando} onClick={() => { const u = leerUbicacion(ubic); if (u) { mandar({ ubicacion: u }); setUbic(''); } else setError('Ubicación no válida'); }}>📍 Enviar</button>
      </div>
      <button className="btn sm" style={{ marginTop: 10 }} onClick={async () => { await apiPost('/api/probar', { reiniciar: true }); cargar(); }}>Reiniciar conversación</button>
    </div>
  );
}

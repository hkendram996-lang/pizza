'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase, apiPost } from '@/lib/supabaseClient';
import { hhmm } from '@/lib/format';

// Conversación de WhatsApp de un cliente, en tiempo real, con respuesta manual
export default function Chat({ telefono, cliente }) {
  const [msgs, setMsgs] = useState([]);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState('');
  const fin = useRef(null);

  useEffect(() => {
    if (!telefono) return;
    let vivo = true;
    const cargar = async () => {
      const { data } = await supabase.from('messages').select('*').eq('telefono', telefono)
        .order('created_at', { ascending: false }).limit(60);
      if (vivo) setMsgs((data || []).reverse());
    };
    cargar();
    const canal = supabase.channel('chat-' + telefono)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'telefono=eq.' + telefono }, cargar)
      .subscribe();
    return () => { vivo = false; supabase.removeChannel(canal); };
  }, [telefono]);

  useEffect(() => { if (fin.current) fin.current.scrollIntoView({ block: 'nearest' }); }, [msgs.length]);

  async function enviar(e) {
    e.preventDefault();
    if (!texto.trim()) return;
    setError('');
    try { await apiPost('/api/enviar', { telefono, texto }); setTexto(''); }
    catch (err) { setError(err.message); }
  }
  async function tomar(v) {
    if (!cliente) return;
    await supabase.from('customers').update({ escalado: v, escalado_motivo: v ? 'Atendido por una persona' : null }).eq('id', cliente.id);
  }

  if (!telefono) return <div className="empty">Pedido sin WhatsApp asociado</div>;
  const cls = { cliente: 'c', agente: 'a', humano: 'a', sistema: 's' };
  return (
    <div>
      {cliente && (
        <div className="row" style={{ marginBottom: 8, justifyContent: 'space-between' }}>
          <span className="mute" style={{ fontSize: 12.5 }}>
            {cliente.escalado ? '🙋 Atiende una persona: el agente no responde' : '🤖 Atiende el agente IA'}
          </span>
          {cliente.escalado
            ? <button className="btn sm" onClick={() => tomar(false)}>Devolver al agente</button>
            : <button className="btn sm" onClick={() => tomar(true)}>Tomar conversación</button>}
        </div>
      )}
      <div className="chat">
        {msgs.length === 0 && <div className="empty">Sin mensajes</div>}
        {msgs.map(m => (
          <div key={m.id} className={'msg ' + cls[m.rol]}>
            {m.rol === 'agente' && <div className="who">Agente IA · {hhmm(m.created_at)}</div>}
            {m.rol === 'humano' && <div className="who">Local · {hhmm(m.created_at)}</div>}
            {m.texto}
          </div>
        ))}
        <div ref={fin} />
      </div>
      {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
      <form onSubmit={enviar} style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <input className="inp" placeholder="Responder como el local…" value={texto} onChange={e => setTexto(e.target.value)} />
        <button className="btn pri sm">Enviar</button>
      </form>
    </div>
  );
}

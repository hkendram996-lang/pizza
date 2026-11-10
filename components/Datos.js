'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { inicioDelDia } from '@/lib/format';

const Ctx = createContext(null);
export const useDatos = () => useContext(Ctx);

/**
 * Carga los datos del día y los mantiene actualizados en tiempo real.
 */
export function DatosProvider({ perfil, children }) {
  const [d, setD] = useState({
    cargando: true, orders: [], products: [], riders: [], zones: [], settings: null,
    caja: null, movs: [], escalados: []
  });
  const timers = useRef({});
  const set = (k, v) => setD(prev => ({ ...prev, [k]: v }));

  const cargar = useCallback(async k => {
    if (k === 'orders') {
      const desde = inicioDelDia().toISOString();
      const { data } = await supabase.from('orders').select('*, order_items(*)')
        .or(`created_at.gte."${desde}",estado.in.(nuevo,cocina,listo,camino)`)
        .order('created_at', { ascending: true }).limit(1000);
      set('orders', data || []);
    }
    if (k === 'products') {
      const { data } = await supabase.from('products').select('*').order('orden').order('id');
      set('products', data || []);
    }
    if (k === 'riders') {
      const { data } = await supabase.from('riders').select('*').order('id');
      set('riders', data || []);
    }
    if (k === 'zones') {
      const { data } = await supabase.from('zones').select('*').order('radio_km');
      set('zones', data || []);
    }
    if (k === 'settings') {
      const { data } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
      set('settings', data);
    }
    if (k === 'caja') {
      const { data: s } = await supabase.from('cash_sessions').select('*').is('cerrada_at', null)
        .order('abierta_at', { ascending: false }).limit(1).maybeSingle();
      let movs = [];
      if (s) {
        const r = await supabase.from('cash_movements').select('*').eq('session_id', s.id).order('created_at', { ascending: false });
        movs = r.data || [];
      }
      setD(prev => ({ ...prev, caja: s, movs }));
    }
    if (k === 'customers') {
      const { data } = await supabase.from('customers').select('*').eq('escalado', true);
      set('escalados', data || []);
    }
  }, []);

  const recargar = useCallback(k => {
    clearTimeout(timers.current[k]);
    timers.current[k] = setTimeout(() => cargar(k), 250);
  }, [cargar]);

  useEffect(() => {
    if (!perfil) return;
    const claves = ['orders', 'products', 'riders', 'zones', 'settings', 'caja', 'customers'];
    Promise.all(claves.map(cargar)).then(() => set('cargando', false));

    const mapa = {
      orders: 'orders', order_items: 'orders', products: 'products', riders: 'riders', zones: 'zones',
      settings: 'settings', cash_sessions: 'caja', cash_movements: 'caja', customers: 'customers'
    };
    let canal = supabase.channel('panel');
    for (const tabla of Object.keys(mapa)) {
      canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, () => recargar(mapa[tabla]));
    }
    canal.subscribe();
    // Respaldo: refrescar cada 30 s por si se corta la conexión en tiempo real
    const iv = setInterval(() => claves.forEach(recargar), 30000);
    return () => { supabase.removeChannel(canal); clearInterval(iv); };
  }, [perfil, cargar, recargar]);

  return <Ctx.Provider value={{ ...d, perfil, recargar }}>{children}</Ctx.Provider>;
}

// Re-render cada segundo (para los cronómetros)
export function useReloj(ms = 1000) {
  const [, setT] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setT(t => t + 1), ms);
    return () => clearInterval(iv);
  }, [ms]);
}

export function useToast() {
  const [lista, setLista] = useState([]);
  const toast = useCallback(msg => {
    const id = Math.random();
    setLista(l => [...l.slice(-3), { id, msg }]);
    setTimeout(() => setLista(l => l.filter(t => t.id !== id)), 4200);
  }, []);
  const Toasts = () => (
    <div className="toasts">{lista.map(t => <div key={t.id} className="toast">{t.msg}</div>)}</div>
  );
  return { toast, Toasts };
}

'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

// Si escriben un teléfono, se convierte al usuario interno que crea el administrador
function usuarioDe(texto) {
  const t = String(texto || '').trim();
  if (t.includes('@')) return t.toLowerCase();
  let d = t.replace(/\D/g, '');
  if (d.length === 8) d = '591' + d;
  return `${d}@tel.pizzeria-ia.app`;
}

export default function Login() {
  const router = useRouter();
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const esTelefono = usuario && !usuario.includes('@');

  async function entrar(e) {
    e.preventDefault();
    setError(''); setCargando(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: usuarioDe(usuario), password: clave });
      if (error) throw error;
      const { data: p } = await supabase.from('profiles').select('rol').eq('id', data.user.id).single();
      const destino = !p ? '/panel' : p.rol === 'repartidor' ? '/repartidor' : p.rol === 'mozo' ? '/mozo' : p.rol === 'cocina' ? '/panel/cocina' : '/panel';
      router.replace(destino);
    } catch (err) {
      const m = err.message || '';
      setError(m.includes('Invalid login') ? (esTelefono ? 'Teléfono o PIN incorrectos' : 'Correo o contraseña incorrectos')
        : m.toLowerCase().includes('banned') ? 'Tu usuario está desactivado. Habla con el administrador.' : m);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="center">
      <form className="authbox" onSubmit={entrar}>
        <div className="logo" style={{ marginBottom: 14 }}>🍕</div>
        <h1>Entrar al panel</h1>
        <p className="mute" style={{ marginTop: 0, marginBottom: 18 }}>Entra con tu número de celular y tu PIN.</p>
        {error && <div className="error">{error}</div>}
        <label className="fl">Celular (o correo del administrador)</label>
        <input className="inp" inputMode={usuario.includes('@') ? 'email' : 'tel'} autoComplete="username"
          placeholder="Ej. 70012345" value={usuario} onChange={e => setUsuario(e.target.value)} required />
        <label className="fl">{esTelefono || !usuario ? 'PIN de 6 números' : 'Contraseña'}</label>
        <input className="inp" type="password" autoComplete="current-password"
          inputMode={esTelefono ? 'numeric' : 'text'} placeholder="••••••"
          value={clave} onChange={e => setClave(e.target.value)} required />
        <button className="btn pri big" disabled={cargando}>{cargando ? 'Un momento…' : 'Entrar'}</button>
        <p className="mute" style={{ textAlign: 'center', marginBottom: 0, fontSize: 13 }}>
          ¿No tienes acceso? Pídele al administrador que te cree un usuario.
        </p>
      </form>
    </div>
  );
}

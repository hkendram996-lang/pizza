'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function Login() {
  const router = useRouter();
  const [modo, setModo] = useState('entrar');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [cargando, setCargando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError(''); setInfo(''); setCargando(true);
    try {
      if (modo === 'entrar') {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        const { data: p } = await supabase.from('profiles').select('rol').eq('id', data.user.id).single();
        router.replace(p && p.rol === 'repartidor' ? '/repartidor' : '/panel');
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password: pass, options: { data: { nombre } } });
        if (error) throw error;
        if (data.session) router.replace('/panel');
        else setInfo('Cuenta creada. Revisa tu correo para confirmarla y luego entra.');
      }
    } catch (err) {
      setError(err.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos' : err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="center">
      <form className="authbox" onSubmit={enviar}>
        <div className="logo" style={{ marginBottom: 14 }}>🍕</div>
        <h1>{modo === 'entrar' ? 'Entrar al panel' : 'Crear cuenta'}</h1>
        <p className="mute" style={{ marginTop: 0, marginBottom: 18 }}>
          {modo === 'entrar' ? 'Pedidos, cocina, delivery, caja y finanzas.' : 'El primer usuario será administrador. Los demás esperan aprobación.'}
        </p>
        {error && <div className="error">{error}</div>}
        {info && <div className="ok-msg">{info}</div>}
        {modo === 'registro' && (
          <input className="inp" placeholder="Tu nombre" value={nombre} onChange={e => setNombre(e.target.value)} required />
        )}
        <input className="inp" type="email" placeholder="Correo" value={email} onChange={e => setEmail(e.target.value)} required />
        <input className="inp" type="password" placeholder="Contraseña (mín. 6 caracteres)" value={pass} onChange={e => setPass(e.target.value)} required minLength={6} />
        <button className="btn pri big" disabled={cargando}>{cargando ? 'Un momento…' : modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}</button>
        <p className="mute" style={{ textAlign: 'center', marginBottom: 0, fontSize: 13 }}>
          {modo === 'entrar' ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
          <a href="#" onClick={e => { e.preventDefault(); setModo(modo === 'entrar' ? 'registro' : 'entrar'); }}>
            {modo === 'entrar' ? 'Crear una' : 'Entrar'}
          </a>
        </p>
      </form>
    </div>
  );
}

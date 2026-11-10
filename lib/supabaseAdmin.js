import { createClient } from '@supabase/supabase-js';

// Cliente del servidor con la clave secreta. ¡Nunca importarlo en componentes del navegador!
let _admin = null;
export function admin() {
  if (!_admin) {
    _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return _admin;
}

// Verifica que la petición venga de un usuario del panel aprobado
export async function requireStaff(req) {
  const h = req.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return null;
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data || !data.user) return null;
  const { data: perfil } = await admin().from('profiles').select('*').eq('id', data.user.id).single();
  if (!perfil || perfil.rol === 'pendiente') return null;
  return perfil;
}

'use client';
import { createClient } from '@supabase/supabase-js';

// Cliente para el navegador: usa la clave pública y respeta los permisos (RLS)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Llama a una acción del servidor (cambiar estado de pedidos, cobrar, etc.)
export async function accion(nombre, datos = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/pedidos/accion', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + (session ? session.access_token : '')
    },
    body: JSON.stringify({ accion: nombre, ...datos })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Error del servidor');
  return json;
}

export async function apiPost(url, body) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + (session ? session.access_token : '')
    },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Error del servidor');
  return json;
}

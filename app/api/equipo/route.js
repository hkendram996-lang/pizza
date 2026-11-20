import { NextResponse } from 'next/server';
import { admin, requireStaff } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const ROLES = ['admin', 'cajero', 'cocina', 'repartidor'];
const COLORES = ['#a8532f', '#2c66d4', '#6a4fc9', '#b97d0c', '#2f8a58', '#c2306f', '#0f8b8d'];

// Solo dígitos; si es un celular boliviano de 8 dígitos, se le agrega 591
function normalizar(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (d.length === 8) d = '591' + d;
  return d;
}
const correoDe = tel => `${tel}@tel.pizzeria-ia.app`;
const err = (m, s = 400) => NextResponse.json({ error: m }, { status: s });

// Gestión del equipo: solo el administrador
export async function POST(req) {
  const yo = await requireStaff(req);
  if (!yo || yo.rol !== 'admin') return err('Solo el administrador puede gestionar el equipo', 403);
  const db = admin();
  const b = await req.json().catch(() => ({}));

  try {
    if (b.accion === 'crear') {
      const tel = normalizar(b.telefono);
      const nombre = String(b.nombre || '').trim();
      const pin = String(b.pin || '');
      if (!nombre) return err('Escribe el nombre');
      if (tel.length < 8) return err('Teléfono inválido');
      if (!/^\d{6}$/.test(pin)) return err('El PIN debe tener exactamente 6 números');
      if (!ROLES.includes(b.rol)) return err('Rol inválido');

      const { data: existe } = await db.from('profiles').select('id').eq('telefono', tel).maybeSingle();
      if (existe) return err('Ya existe un usuario con ese teléfono');

      const { data, error } = await db.auth.admin.createUser({
        email: correoDe(tel), password: pin, email_confirm: true, user_metadata: { nombre }
      });
      if (error) return err(error.message);
      const id = data.user.id;
      // El perfil lo crea la base automáticamente; aquí le damos nombre, teléfono y rol
      await db.from('profiles').upsert({ id, nombre, email: correoDe(tel), telefono: tel, rol: b.rol, activo: true });

      if (b.rol === 'repartidor') {
        const { count } = await db.from('riders').select('id', { count: 'exact', head: true });
        await db.from('riders').insert({
          nombre, telefono: tel, user_id: id, color: COLORES[(count || 0) % COLORES.length], estado: 'desconectado'
        });
      }
      return NextResponse.json({ ok: true, id });
    }

    if (b.accion === 'pin') {
      if (!/^\d{6}$/.test(String(b.pin || ''))) return err('El PIN debe tener exactamente 6 números');
      const { error } = await db.auth.admin.updateUserById(b.id, { password: String(b.pin) });
      if (error) return err(error.message);
      return NextResponse.json({ ok: true });
    }

    if (b.accion === 'activo') {
      if (b.id === yo.id) return err('No puedes desactivarte a ti mismo');
      const { error } = await db.auth.admin.updateUserById(b.id, { ban_duration: b.activo ? 'none' : '876000h' });
      if (error) return err(error.message);
      await db.from('profiles').update({ activo: !!b.activo }).eq('id', b.id);
      await db.from('riders').update({ activo: !!b.activo, ...(b.activo ? {} : { estado: 'desconectado' }) }).eq('user_id', b.id);
      return NextResponse.json({ ok: true });
    }

    if (b.accion === 'rol') {
      if (!ROLES.includes(b.rol)) return err('Rol inválido');
      if (b.id === yo.id && b.rol !== 'admin') return err('No puedes quitarte el rol de administrador');
      await db.from('profiles').update({ rol: b.rol }).eq('id', b.id);
      if (b.rol === 'repartidor') {
        const { data: r } = await db.from('riders').select('id').eq('user_id', b.id).maybeSingle();
        if (!r) {
          const { data: p } = await db.from('profiles').select('nombre,telefono').eq('id', b.id).single();
          await db.from('riders').insert({ nombre: p.nombre || 'Repartidor', telefono: p.telefono, user_id: b.id, color: COLORES[0], estado: 'desconectado' });
        }
      }
      return NextResponse.json({ ok: true });
    }

    return err('Acción desconocida');
  } catch (e) {
    console.error(e);
    return err(e.message || 'Error interno', 500);
  }
}

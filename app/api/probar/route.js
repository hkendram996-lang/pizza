import { NextResponse } from 'next/server';
import { admin, requireStaff } from '@/lib/supabaseAdmin';
import { responder } from '@/lib/agent';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Simulador: conversa con el agente desde el panel, sin WhatsApp.
// Usa un cliente de prueba con teléfono "prueba". Los pedidos que cree son reales (puedes cancelarlos).
export async function POST(req) {
  const staff = await requireStaff(req);
  if (!staff) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const db = admin();
  const tel = 'prueba';
  const body = await req.json();

  let { data: cliente } = await db.from('customers').select('*').eq('telefono', tel).maybeSingle();
  if (!cliente) {
    const { data } = await db.from('customers').insert({ telefono: tel, nombre: null }).select().single();
    cliente = data;
  }

  if (body.reiniciar) {
    await db.from('messages').delete().eq('telefono', tel);
    await db.from('customers').update({ nombre: null, direccion: null, lat: null, lng: null, escalado: false, escalado_motivo: null }).eq('id', cliente.id);
    return NextResponse.json({ ok: true });
  }

  let texto = (body.texto || '').trim();
  if (body.ubicacion) {
    const { data } = await db.from('customers').update({ lat: body.ubicacion.lat, lng: body.ubicacion.lng }).eq('id', cliente.id).select().single();
    cliente = data;
    texto = '[Compartí mi ubicación]';
  }
  if (!texto) return NextResponse.json({ error: 'Escribe un mensaje' }, { status: 400 });

  await db.from('messages').insert({ telefono: tel, rol: 'cliente', texto });
  if (cliente.escalado) await db.from('customers').update({ escalado: false }).eq('id', cliente.id);
  try {
    const r = await responder({ ...cliente, escalado: false });
    if (r.texto) await db.from('messages').insert({ telefono: tel, rol: 'agente', texto: r.texto });
    if (r.enviarQR) await db.from('messages').insert({ telefono: tel, rol: 'sistema', texto: '[Aquí se enviaría la imagen del QR de pago]' });
    if (r.escalado) await db.from('messages').insert({ telefono: tel, rol: 'sistema', texto: '[El agente pasó la conversación a una persona]' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Error del agente: ' + e.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { admin, requireStaff } from '@/lib/supabaseAdmin';
import { enviarTexto } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

// Una persona del local responde manualmente a un cliente por WhatsApp
export async function POST(req) {
  const staff = await requireStaff(req);
  if (!staff) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { telefono, texto } = await req.json();
  if (!telefono || !texto) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
  const ok = await enviarTexto(telefono, texto);
  if (!ok) return NextResponse.json({ error: 'WhatsApp no aceptó el mensaje (si el cliente no escribió en las últimas 24 h, Meta exige una plantilla)' }, { status: 502 });
  await admin().from('messages').insert({ telefono, rol: 'humano', texto });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabaseAdmin';
import { responder } from '@/lib/agent';
import { enviarTexto, enviarImagen, marcarLeido, firmaValida } from '@/lib/whatsapp';
import { bs } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Meta llama a este GET una sola vez para verificar el webhook
export async function GET(req) {
  const p = new URL(req.url).searchParams;
  if (p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(p.get('hub.challenge') || '', { status: 200 });
  }
  return new Response('Token inválido', { status: 403 });
}

// Cada mensaje que llega a tu número de WhatsApp entra por aquí
export async function POST(req) {
  const raw = await req.text();
  if (!firmaValida(raw, req.headers.get('x-hub-signature-256'))) {
    return new Response('Firma inválida', { status: 401 });
  }
  let body;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }

  const tareas = [];
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      const perfiles = {};
      for (const c of v.contacts || []) perfiles[c.wa_id] = c.profile && c.profile.name;
      for (const m of v.messages || []) tareas.push(procesar(m, perfiles[m.from]));
    }
  }
  await Promise.allSettled(tareas);
  return NextResponse.json({ ok: true });
}

async function procesar(m, nombrePerfil) {
  const db = admin();
  const tel = m.from;

  // 1) Traducir el mensaje a texto
  let texto = '';
  let ubicacion = null;
  if (m.type === 'text') texto = m.text.body;
  else if (m.type === 'location') {
    ubicacion = { lat: m.location.latitude, lng: m.location.longitude };
    texto = '[Compartí mi ubicación' + (m.location.address ? ': ' + m.location.address : '') + ']';
  } else if (m.type === 'image') texto = '[Envié una imagen' + (m.image && m.image.caption ? ': ' + m.image.caption : '') + ' — posiblemente el comprobante de pago]';
  else if (m.type === 'audio') texto = '[Envié un audio. Aún no puedes escucharlo: pide amablemente que lo escriba]';
  else if (m.type === 'interactive') texto = (m.interactive.button_reply || m.interactive.list_reply || {}).title || '';
  else if (m.type === 'button') texto = m.button.text;
  else texto = '[Mensaje de tipo ' + m.type + ']';

  // 2) Guardar el mensaje (si ya existe, es un reintento de Meta: ignorar)
  const { error: dup } = await db.from('messages').insert({ telefono: tel, rol: 'cliente', texto, wa_id: m.id });
  if (dup) return;
  marcarLeido(m.id).catch(() => {});

  // 3) Cliente (crear si es nuevo) y ubicación
  let { data: cliente } = await db.from('customers').select('*').eq('telefono', tel).maybeSingle();
  if (!cliente) {
    const { data } = await db.from('customers').insert({ telefono: tel, nombre: nombrePerfil || null }).select().single();
    cliente = data;
  }
  if (ubicacion) {
    const { data } = await db.from('customers').update(ubicacion).eq('id', cliente.id).select().single();
    cliente = data;
  }

  // 4) Si una persona está atendiendo o el agente está apagado, no responder
  const { data: settings } = await db.from('settings').select('agente_activo').eq('id', 1).single();
  if (cliente.escalado || (settings && settings.agente_activo === false)) return;

  // 5) Respuesta del agente
  let r;
  try {
    r = await responder(cliente);
  } catch (e) {
    console.error('Error del agente:', e);
    r = { texto: 'Disculpa, tuve un problema técnico 🙏 En un momento te atiende una persona del local.' };
    await db.from('customers').update({ escalado: true, escalado_motivo: 'Error técnico del agente' }).eq('id', cliente.id);
  }
  if (r.texto) {
    await enviarTexto(tel, r.texto);
    await db.from('messages').insert({ telefono: tel, rol: 'agente', texto: r.texto });
  }
  if (r.enviarQR && r.settings && r.settings.qr_imagen_url) {
    const caption = `QR de pago · Pedido #${r.enviarQR.id} · Total ${bs(r.enviarQR.total)}`;
    await enviarImagen(tel, r.settings.qr_imagen_url, caption);
    await db.from('messages').insert({ telefono: tel, rol: 'sistema', texto: '[Imagen del QR enviada] ' + caption });
  }
}

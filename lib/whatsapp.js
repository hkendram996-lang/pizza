import crypto from 'crypto';

const API = 'https://graph.facebook.com/v21.0';

async function enviar(payload) {
  const res = await fetch(`${API}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload })
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error('Error enviando WhatsApp:', res.status, txt);
    return false;
  }
  return true;
}

export const enviarTexto = (to, body) =>
  enviar({ to, type: 'text', text: { body: body.slice(0, 4000), preview_url: true } });

export const enviarImagen = (to, link, caption) =>
  enviar({ to, type: 'image', image: { link, caption } });

export const marcarLeido = messageId =>
  enviar({ status: 'read', message_id: messageId });

// Verifica que el webhook realmente venga de Meta (si configuraste WHATSAPP_APP_SECRET)
export function firmaValida(rawBody, firma) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true;
  if (!firma) return false;
  const esperado = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(esperado), b = Buffer.from(firma);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

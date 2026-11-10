import { admin } from './supabaseAdmin';
import { enviarTexto } from './whatsapp';

const URL = () => (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');

// Avisa por WhatsApp al cliente cuando su pedido cambia de estado
export async function notificarPedido(orderId, evento) {
  const db = admin();
  const { data: o } = await db.from('orders').select('*, riders(nombre)').eq('id', orderId).single();
  if (!o || !o.telefono || !process.env.WHATSAPP_TOKEN) return;
  const nombre = (o.cliente_nombre || '').split(' ')[0];
  let texto = null;
  if (evento === 'cocina') texto = `✅ ${nombre}, tu pedido #${o.id} fue confirmado y ya está en preparación 🍕`;
  if (evento === 'camino')
    texto = `🛵 ¡Tu pedido #${o.id} salió!${o.riders ? ' Lo lleva ' + o.riders.nombre + '.' : ''} Síguelo en vivo aquí: ${URL()}/seguir/${o.tracking_token}`;
  if (evento === 'entregado') texto = `¡Pedido #${o.id} entregado! Gracias por elegirnos 🍕 ¿Cómo lo calificarías del 1 al 5?`;
  if (evento === 'cancelado') texto = `Tu pedido #${o.id} fue cancelado. Si tienes dudas, escríbenos por aquí.`;
  if (!texto) return;
  const ok = await enviarTexto(o.telefono, texto);
  if (ok) await db.from('messages').insert({ telefono: o.telefono, rol: 'sistema', texto });
}

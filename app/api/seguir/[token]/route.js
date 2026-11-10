import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// Datos públicos y mínimos para la página de seguimiento del cliente
export async function GET(_req, { params }) {
  const token = params.token;
  if (!/^[0-9a-f-]{36}$/i.test(token || '')) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  const db = admin();
  const { data: o } = await db.from('orders')
    .select('id,estado,tipo,lat,lng,created_at,cocina_at,listo_at,camino_at,entregado_at,total,cliente_nombre,order_items(nombre,cantidad),riders(nombre,lat,lng,color,ubicado_at)')
    .eq('tracking_token', token).maybeSingle();
  if (!o) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  const { data: s } = await db.from('settings').select('nombre_negocio,local_lat,local_lng').eq('id', 1).single();
  return NextResponse.json({
    pedido: {
      id: o.id, estado: o.estado, tipo: o.tipo, destino: o.lat != null ? { lat: o.lat, lng: o.lng } : null,
      creado: o.created_at, cocina: o.cocina_at, listo: o.listo_at, camino: o.camino_at, entregado: o.entregado_at,
      total: o.total, nombre: (o.cliente_nombre || '').split(' ')[0], items: o.order_items
    },
    repartidor: o.estado === 'camino' && o.riders ? { nombre: o.riders.nombre, lat: o.riders.lat, lng: o.riders.lng, color: o.riders.color } : null,
    local: s ? { nombre: s.nombre_negocio, lat: s.local_lat, lng: s.local_lng } : null
  });
}

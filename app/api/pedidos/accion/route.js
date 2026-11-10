import { NextResponse } from 'next/server';
import { admin, requireStaff } from '@/lib/supabaseAdmin';
import { notificarPedido } from '@/lib/notificar';

export const dynamic = 'force-dynamic';

const err = (msg, status = 400) => NextResponse.json({ error: msg }, { status });

// Asigna repartidores libres y avisa a los clientes cuyo pedido salió
async function asignar() {
  const { data, error } = await admin().rpc('asignar_pedidos');
  if (error) throw error;
  const ids = (data || []).map(x => (typeof x === 'object' ? Object.values(x)[0] : x));
  await Promise.all(ids.map(id => notificarPedido(id, 'camino')));
  return ids;
}

export async function POST(req) {
  const staff = await requireStaff(req);
  if (!staff) return err('No autorizado', 401);
  const db = admin();
  let body;
  try { body = await req.json(); } catch { return err('Datos inválidos'); }
  const { accion, orderId } = body;

  try {
    switch (accion) {
      case 'cocina': {
        const { data, error } = await db.from('orders').update({ estado: 'cocina' })
          .eq('id', orderId).eq('estado', 'nuevo').select().single();
        if (error || !data) return err('El pedido ya no está en "Nuevos"');
        if (body.pagado) await db.rpc('registrar_cobro', { p_order: orderId });
        await notificarPedido(orderId, 'cocina');
        return NextResponse.json({ ok: true });
      }
      case 'cobrar': {
        const { error } = await db.rpc('registrar_cobro', { p_order: orderId });
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case 'listo': {
        const { data, error } = await db.from('orders').update({ estado: 'listo' })
          .eq('id', orderId).eq('estado', 'cocina').select().single();
        if (error || !data) return err('El pedido ya no está en cocina');
        const asignados = await asignar();
        return NextResponse.json({ ok: true, asignados });
      }
      case 'entregar': {
        const { data: o } = await db.from('orders').select('*').eq('id', orderId).single();
        if (!o) return err('Pedido no encontrado', 404);
        if (staff.rol === 'repartidor') {
          const { data: r } = await db.from('riders').select('id').eq('user_id', staff.id).single();
          if (!r || r.id !== o.rider_id) return err('Este pedido no está asignado a ti', 403);
        }
        const { error } = await db.rpc('finalizar_entrega', { p_order: orderId });
        if (error) throw error;
        if (o.tipo === 'delivery') await notificarPedido(orderId, 'entregado');
        await asignar();
        return NextResponse.json({ ok: true });
      }
      case 'cancelar': {
        const { data: o } = await db.from('orders').select('*').eq('id', orderId).single();
        if (!o) return err('Pedido no encontrado', 404);
        if (staff.rol !== 'admin' && staff.rol !== 'cajero') return err('Solo caja o administración puede cancelar', 403);
        await db.from('orders').update({ estado: 'cancelado' }).eq('id', orderId);
        if (o.rider_id && o.estado === 'camino')
          await db.from('riders').update({ estado: 'libre', libre_desde: new Date().toISOString() }).eq('id', o.rider_id);
        if (o.pagado)
          await db.from('cash_movements').insert({
            session_id: (await sesionAbierta())?.id || null, tipo: 'egreso',
            concepto: 'Devolución pedido #' + o.id, monto: o.total, metodo: o.metodo_pago, order_id: o.id
          });
        await notificarPedido(orderId, 'cancelado');
        await asignar();
        return NextResponse.json({ ok: true });
      }
      case 'crear_mostrador': {
        const items = (body.items || []).map(i => ({ producto_id: i.producto_id, cantidad: i.cantidad }));
        const { data: o, error } = await db.rpc('crear_pedido', {
          p: {
            canal: 'Mostrador', tipo: 'mostrador', estado: 'cocina',
            cliente_nombre: body.cliente_nombre || 'Cliente mostrador',
            metodo_pago: body.metodo_pago || 'Efectivo', items, nota: body.nota || null
          }
        });
        if (error) return err(error.message);
        await db.rpc('registrar_cobro', { p_order: o.id });
        return NextResponse.json({ ok: true, pedido: o });
      }
      case 'crear_manual': {
        // Pedido cargado a mano (teléfono, PedidosYa, etc.)
        const items = (body.items || []).map(i => ({ producto_id: i.producto_id, cantidad: i.cantidad }));
        const { data: o, error } = await db.rpc('crear_pedido', {
          p: {
            canal: body.canal || 'Teléfono', tipo: body.tipo || 'delivery', estado: 'nuevo',
            cliente_nombre: body.cliente_nombre, telefono: body.telefono || null,
            direccion: body.direccion || null, lat: body.lat, lng: body.lng,
            metodo_pago: body.metodo_pago || 'Efectivo', items, nota: body.nota || null
          }
        });
        if (error) return err(error.message);
        return NextResponse.json({ ok: true, pedido: o });
      }
      case 'disponible': {
        // El repartidor se pone libre o se desconecta
        const estado = body.disponible ? 'libre' : 'desconectado';
        const { data: r } = await db.from('riders').select('*').eq('user_id', staff.id).single();
        if (!r) return err('Tu usuario no está vinculado a un repartidor', 403);
        if (r.estado === 'ocupado') return err('Termina tu entrega actual primero');
        await db.from('riders').update({ estado, libre_desde: new Date().toISOString() }).eq('id', r.id);
        if (estado === 'libre') await asignar();
        return NextResponse.json({ ok: true });
      }
      case 'asignar': {
        const asignados = await asignar();
        return NextResponse.json({ ok: true, asignados });
      }
      default:
        return err('Acción desconocida');
    }
  } catch (e) {
    console.error(e);
    return err(e.message || 'Error interno', 500);
  }
}

async function sesionAbierta() {
  const { data } = await admin().from('cash_sessions').select('id').is('cerrada_at', null)
    .order('abierta_at', { ascending: false }).limit(1).maybeSingle();
  return data;
}

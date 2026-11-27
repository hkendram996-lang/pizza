import { NextResponse } from 'next/server';
import { admin, requireStaff } from '@/lib/supabaseAdmin';
import { notificarPedido } from '@/lib/notificar';
import { ORIGENES_LOCAL } from '@/lib/format';

export const dynamic = 'force-dynamic';

const err = (msg, status = 400) => NextResponse.json({ error: msg }, { status });

const ids = data => (data || []).map(x => (typeof x === 'object' ? Object.values(x)[0] : x));

// Despacho inteligente: llama al repartidor antes de que la pizza salga del horno
async function asignar() {
  const { data, error } = await admin().rpc('despachar');
  if (error) throw error;
  return ids(data);
}

async function riderDe(staff) {
  const { data } = await admin().from('riders').select('*').eq('user_id', staff.id).maybeSingle();
  return data;
}
const esCaja = staff => staff.rol === 'admin' || staff.rol === 'cajero';

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
        await asignar();
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
          const r = await riderDe(staff);
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
        if (o.rider_id) await db.rpc('liberar_si_vacio', { p_rider: o.rider_id });
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
        const items = limpiarItems(body.items);
        const canal = ORIGENES_LOCAL.includes(body.canal) ? body.canal : 'Mostrador';
        const { data: o, error } = await db.rpc('crear_pedido', {
          p: {
            canal, tipo: 'mostrador', estado: 'cocina',
            mesa: canal === 'Salón' && body.mesa ? String(body.mesa).slice(0, 20) : null,
            cliente_nombre: body.cliente_nombre || (canal === 'Salón' && body.mesa ? 'Mesa ' + body.mesa : 'Cliente ' + canal.toLowerCase()),
            metodo_pago: body.metodo_pago || 'Efectivo', items, nota: body.nota || null
          }
        });
        if (error) return err(error.message);
        await db.rpc('registrar_cobro', { p_order: o.id });
        return NextResponse.json({ ok: true, pedido: o });
      }
      case 'crear_manual': {
        // Pedido cargado a mano (teléfono, PedidosYa, etc.)
        const items = limpiarItems(body.items);
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
        const r = await riderDe(staff);
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
      case 'salir': {
        // El repartidor recogió las pizzas y sale: recién ahí el cliente recibe el link
        const r = staff.rol === 'repartidor' ? await riderDe(staff)
          : (await db.from('riders').select('*').eq('id', body.riderId).maybeSingle()).data;
        if (!r) return err('Repartidor no encontrado', 404);
        const { data, error } = await db.rpc('salir_reparto', { p_rider: r.id });
        if (error) throw error;
        const salieron = ids(data);
        if (!salieron.length) return err('Todavía no hay pizzas listas para llevar');
        await Promise.all(salieron.map(id => notificarPedido(id, 'camino')));
        await asignar();
        return NextResponse.json({ ok: true, salieron });
      }
      case 'asignar_a': {
        if (!esCaja(staff)) return err('Solo caja o administración puede asignar', 403);
        const { error } = await db.rpc('asignar_a', { p_order: orderId, p_rider: body.riderId });
        if (error) return err(error.message);
        return NextResponse.json({ ok: true });
      }
      case 'desasignar': {
        if (!esCaja(staff)) return err('Solo caja o administración puede cambiar la asignación', 403);
        const { error } = await db.rpc('desasignar', { p_order: orderId });
        if (error) return err(error.message);
        await asignar();
        return NextResponse.json({ ok: true });
      }
      case 'demora': {
        // Cocina avisa que el pedido tarda más: se corre la hora estimada
        const mins = Math.max(1, Math.min(30, Number(body.minutos) || 5));
        const { data: o } = await db.from('orders').select('listo_estimado').eq('id', orderId).single();
        const base = Math.max(Date.now(), o && o.listo_estimado ? new Date(o.listo_estimado).getTime() : 0);
        await db.from('orders').update({ listo_estimado: new Date(base + mins * 60000).toISOString() })
          .eq('id', orderId).eq('estado', 'cocina');
        return NextResponse.json({ ok: true });
      }
      default:
        return err('Acción desconocida');
    }
  } catch (e) {
    console.error(e);
    return err(e.message || 'Error interno', 500);
  }
}

// Solo se aceptan id de producto, cantidad, id de extras y nota (los precios los calcula la base)
function limpiarItems(lista) {
  return (Array.isArray(lista) ? lista : []).map(i => ({
    producto_id: i.producto_id,
    cantidad: i.cantidad,
    extras: Array.isArray(i.extras) ? i.extras.map(Number).filter(Number.isInteger) : [],
    nota: i.nota ? String(i.nota).slice(0, 200) : null
  }));
}

async function sesionAbierta() {
  const { data } = await admin().from('cash_sessions').select('id').is('cerrada_at', null)
    .order('abierta_at', { ascending: false }).limit(1).maybeSingle();
  return data;
}

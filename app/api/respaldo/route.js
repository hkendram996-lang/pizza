import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const TABLAS = ['settings', 'zones', 'products', 'profiles', 'riders', 'customers', 'orders', 'order_items',
  'messages', 'cash_sessions', 'cash_movements', 'expenses'];

// Copia de seguridad completa en JSON. Solo responde con la clave secreta RESPALDO_TOKEN.
// La usa una tarea automática semanal de GitHub, que la guarda cifrada.
export async function GET(req) {
  const clave = process.env.RESPALDO_TOKEN || '';
  const h = req.headers.get('authorization') || '';
  if (clave.length < 24 || h !== 'Bearer ' + clave) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const db = admin();
  const copia = { creado: new Date().toISOString(), tablas: {} };
  for (const t of TABLAS) {
    const filas = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await db.from(t).select('*').range(desde, desde + 999);
      if (error) { copia.tablas[t] = { error: error.message }; break; }
      filas.push(...data);
      if (data.length < 1000) { copia.tablas[t] = filas; break; }
    }
  }
  return NextResponse.json(copia, { headers: { 'Cache-Control': 'no-store' } });
}

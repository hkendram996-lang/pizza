import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// Chequeo de salud: confirma que el sistema y la base de datos responden.
// Una tarea automática la visita cada 2 días para que la base gratuita no se pause.
export async function GET() {
  const { error } = await admin().from('settings').select('id').eq('id', 1).maybeSingle();
  return NextResponse.json({ ok: !error, hora: new Date().toISOString() }, { status: error ? 500 : 200 });
}

import { ARTE } from '@/lib/menuArte';

// Sirve las ilustraciones de la carta como imágenes (con caché larga)
export async function GET(_req, { params }) {
  const nombre = String(params.nombre || '').replace(/\.webp$/, '');
  const b64 = ARTE[nombre];
  if (!b64) return new Response('No encontrado', { status: 404 });
  return new Response(Buffer.from(b64, 'base64'), {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=604800, immutable'
    }
  });
}

import { admin } from '@/lib/supabaseAdmin';
import { Fraunces } from 'next/font/google';
import MenuCliente from './MenuCliente';

const display = Fraunces({ subsets: ['latin'], variable: '--f-display', display: 'swap' });

// Página pública del menú: siempre muestra lo que haya en el Catálogo en este momento
export const dynamic = 'force-dynamic';

const URL_APP = (process.env.NEXT_PUBLIC_APP_URL || 'https://manechi.vercel.app').replace(/\/$/, '');

export const metadata = {
  title: 'Manechi Pizzería · Menú y pedidos',
  description: 'Pizzas salvajes 🐒🍕 Mirá el menú de Manechi y pedí por WhatsApp en 3 toques. Aribibi 120, Santa Cruz de la Sierra.',
  openGraph: {
    title: 'Manechi Pizzería · Pizzas salvajes 🐒🍕',
    description: 'Mirá el menú y pedí por WhatsApp en 3 toques.',
    url: URL_APP + '/menu',
    images: [{ url: URL_APP + '/menu/portada.webp', width: 640, height: 914 }],
    locale: 'es_BO',
    type: 'website'
  }
};

export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#fffdf3' };

export default async function MenuPage() {
  let productos = [], s = null;
  try {
    const db = admin();
    const [a, b] = await Promise.all([
      db.from('products').select('id,nombre,categoria,descripcion,precio,orden').eq('activo', true).order('orden').order('id'),
      db.from('settings').select('nombre_negocio,direccion_local,horario,local_lat,local_lng').eq('id', 1).single()
    ]);
    productos = a.data || [];
    s = b.data;
  } catch (e) {
    console.error('Menú: no se pudo leer la base', e);
  }
  return (
    <div className={display.variable}>
    <MenuCliente
      productos={productos}
      negocio={{
        nombre: s?.nombre_negocio || 'Manechi Pizzería',
        direccion: s?.direccion_local || 'Aribibi 120, Santa Cruz de la Sierra',
        horario: s?.horario || 'Jueves a domingo de 18:30 a 22:30',
        lat: s?.local_lat ?? null,
        lng: s?.local_lng ?? null,
        whatsapp: process.env.WHATSAPP_PUBLICO || '59178108270',
        instagram: 'manechi.bo'
      }}
    />
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { Header } from '@/components/UI';

// Enlaces para redes sociales y códigos QR para imprimir (mesas y delivery)
const WHATSAPP = '59178108270';
const qr = (texto, tam = 600) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${tam}x${tam}&margin=8&ecc=M&color=2b2118&bgcolor=fffdf3&data=${encodeURIComponent(texto)}`;

export default function Compartir() {
  const [origen, setOrigen] = useState('https://manechi.vercel.app');
  const [mesas, setMesas] = useState(10);
  const [copiado, setCopiado] = useState('');

  useEffect(() => {
    setOrigen(window.location.origin);
    try { const n = Number(localStorage.getItem('manechi-mesas')); if (n > 0) setMesas(n); } catch (e) {}
  }, []);
  useEffect(() => { try { localStorage.setItem('manechi-mesas', String(mesas)); } catch (e) {} }, [mesas]);

  const menu = origen + '/menu';
  const wa = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent('¡Hola Manechi! 🐒 Quiero hacer un pedido')}`;
  const lista = Array.from({ length: Math.max(0, Math.min(60, Number(mesas) || 0)) }, (_, i) => i + 1);

  function copiar(texto, cual) {
    navigator.clipboard?.writeText(texto).then(() => { setCopiado(cual); setTimeout(() => setCopiado(''), 1800); });
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <Header titulo="Menú y QR" sub="Enlaces para redes sociales y códigos QR para imprimir" />

      <div className="grid sin-imprimir" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 14, maxWidth: 1000 }}>
        <div className="card">
          <h3>🍕 Enlace del menú</h3>
          <p className="mute" style={{ marginTop: 0 }}>Para la bio de Instagram, stories, Facebook, Linktree y Google Maps. El cliente ve el menú, arma su pedido y lo manda por WhatsApp.</p>
          <div className="enlace"><code>{menu}</code><button className="btn sm pri" onClick={() => copiar(menu, 'menu')}>{copiado === 'menu' ? '✓ Copiado' : 'Copiar'}</button></div>
          <a className="btn sm" href="/menu" target="_blank" rel="noopener" style={{ marginTop: 10, display: 'inline-block' }}>Abrir el menú ↗</a>
        </div>
        <div className="card">
          <h3>💬 Enlace directo a WhatsApp</h3>
          <p className="mute" style={{ marginTop: 0 }}>Abre el chat con el mensaje "¡Hola Manechi! 🐒 Quiero hacer un pedido" ya escrito.</p>
          <div className="enlace"><code>{wa}</code><button className="btn sm pri" onClick={() => copiar(wa, 'wa')}>{copiado === 'wa' ? '✓ Copiado' : 'Copiar'}</button></div>
        </div>
        <div className="card">
          <h3>✍️ Texto para la bio de Instagram</h3>
          <div className="enlace"><code>{'Pizzas salvajes 🐒🍕\nUna selva en plena ciudad 🌿\nJue a dom · 18:30–22:30\n👇 Mirá el menú y pedí aquí'}</code>
            <button className="btn sm pri" onClick={() => copiar('Pizzas salvajes 🐒🍕\nUna selva en plena ciudad 🌿\nJue a dom · 18:30–22:30\n👇 Mirá el menú y pedí aquí', 'bio')}>{copiado === 'bio' ? '✓ Copiado' : 'Copiar'}</button></div>
        </div>
      </div>

      <div className="card sin-imprimir" style={{ maxWidth: 1000, marginTop: 14, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h3 style={{ margin: 0 }}>🖨️ Códigos QR para imprimir</h3>
          <p className="mute" style={{ margin: '4px 0 0' }}>Cada mesa tiene su propio QR: el pedido llega por WhatsApp con el número de mesa. El último es para delivery (flyers, bolsas, cajas de pizza).</p>
        </div>
        <label className="fl" style={{ margin: 0 }}>¿Cuántas mesas?</label>
        <input className="inp" type="number" min="1" max="60" value={mesas} onChange={e => setMesas(e.target.value)} style={{ width: 90 }} />
        <button className="btn pri" onClick={() => window.print()}>Imprimir</button>
      </div>

      <div className="qr-hojas">
        {lista.map(n => <Tarjeta key={n} titulo={`Mesa ${n}`} sub="Pedí desde tu celular" url={`${menu}?mesa=${n}`} pie="Escaneá con la cámara · elegí · tocá Pedir · te lo llevamos a la mesa" />)}
        <Tarjeta titulo="Pedí a domicilio" sub="Delivery y para llevar" url={menu} pie="Escaneá, armá tu pedido y mandalo por WhatsApp 🛵" grande />
      </div>
    </>
  );
}

function Tarjeta({ titulo, sub, url, pie }) {
  return (
    <div className="qr-t">
      <div className="qr-cab">
        <span className="qr-logo" />
        <div><b>Manechi</b><small>Pizzería · pizzas salvajes</small></div>
      </div>
      <h2>{titulo}</h2>
      <p className="qr-sub">{sub}</p>
      <img src={qr(url)} alt={'Código QR: ' + titulo} width="600" height="600" />
      <p className="qr-pie">{pie}</p>
      <p className="qr-url">{url.replace(/^https?:\/\//, '')}</p>
    </div>
  );
}

const CSS = `
.enlace{display:flex;gap:8px;align-items:flex-start;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:8px}
.enlace code{flex:1;font-size:12.5px;word-break:break-all;white-space:pre-wrap;padding:4px}
.qr-hojas{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;margin-top:14px;max-width:1000px}
.qr-t{background:#fffdf3;border:1.5px solid #eadfcb;border-radius:18px;padding:16px 16px 12px;text-align:center;color:#2b2118;break-inside:avoid;page-break-inside:avoid}
.qr-cab{display:flex;align-items:center;gap:10px;justify-content:center}
.qr-logo{width:38px;height:38px;border-radius:50%;background:#fbf8f3 var(--logo, none) center/cover no-repeat;border:2px solid #2f5d3a}
.qr-cab b{font-family:Georgia,serif;font-size:20px;color:#b0482a;display:block;text-align:left;line-height:1}
.qr-cab small{color:#7a6b5d;font-size:11px}
.qr-t h2{font-family:Georgia,serif;font-size:30px;margin:12px 0 0;color:#2f5d3a}
.qr-sub{margin:2px 0 8px;color:#7a6b5d;font-weight:600}
.qr-t img{width:100%;height:auto;display:block;border-radius:10px}
.qr-pie{font-size:12px;color:#2b2118;margin:8px 0 2px;line-height:1.35}
.qr-url{font-size:10px;color:#9a8b7d;margin:0;word-break:break-all}
@media print{
  @page{size:A4;margin:10mm}
  body *{visibility:hidden}
  .qr-hojas,.qr-hojas *{visibility:visible}
  .qr-hojas{position:absolute;left:0;top:0;width:100%;max-width:none;margin:0;grid-template-columns:1fr 1fr;gap:8mm}
  .qr-t{border:1px dashed #b9a995;padding:8mm 8mm 5mm}
  .qr-t img{width:62mm;margin:0 auto}
  .sin-imprimir{display:none}
}
`;

'use client';
import { useEffect, useMemo, useRef, useState } from 'react';

// ---------------------------------------------------------------------
// Menú público de Manechi: ver el menú, armar el pedido y enviarlo por WhatsApp
// ---------------------------------------------------------------------

const HORARIO = { dias: [4, 5, 6, 0], abre: [18, 30], cierra: [22, 30] }; // jue a dom, 18:30 a 22:30
const NOMBRE_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const ICONO = { 'Pizzas': '🍕', 'Entradas': '🥗', 'Postres': '🍰', 'Jugos naturales': '🍹', 'Sodas naturales': '🫧', 'Cervezas': '🍺', 'Vinos': '🍷' };
const ALCOHOL = ['Cervezas', 'Vinos'];
const ANTOJOS = [
  { k: 'todas', t: 'Todas' },
  { k: 'intensa', t: '🔥 Intensas' },
  { k: 'clasica', t: '🍅 Clásicas' },
  { k: 'diferente', t: '✨ Diferentes' }
];
const LLAVE = 'manechi-pedido-v1';

const bs = n => 'Bs ' + Number(n || 0).toLocaleString('es-BO', { maximumFractionDigits: 2 });
const tieneVegano = p => /queso vegano/i.test(p.descripcion || '');
const descLimpia = p => (p.descripcion || '').replace(/\s*Opción con queso vegano\.?/i, '').trim();

function antojoDe(p) {
  const t = (p.nombre + ' ' + (p.descripcion || '')).toLowerCase();
  if (/miel|piña|pera|motojobobo|palta|manzana|plátano/.test(t)) return 'diferente';
  if (/ahumad|flamead|pino|blanca/.test(t)) return 'intensa';
  return 'clasica';
}

// Hora actual del local (Bolivia), sin depender de la zona del teléfono del cliente
function ahoraEnBolivia() {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/La_Paz', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date());
  const v = Object.fromEntries(partes.map(x => [x.type, x.value]));
  const dia = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(v.weekday);
  return { dia, min: (Number(v.hour) % 24) * 60 + Number(v.minute) };
}
function estadoLocal() {
  const { dia, min } = ahoraEnBolivia();
  const abre = HORARIO.abre[0] * 60 + HORARIO.abre[1], cierra = HORARIO.cierra[0] * 60 + HORARIO.cierra[1];
  const hoyAbre = HORARIO.dias.includes(dia);
  if (hoyAbre && min >= abre && min < cierra) return { abierto: true, texto: 'Abierto ahora · hasta las 22:30' };
  if (hoyAbre && min < abre) return { abierto: false, texto: 'Hoy abrimos a las 18:30', proximo: 'hoy a las 18:30' };
  for (let i = 1; i <= 7; i++) {
    const d = (dia + i) % 7;
    if (HORARIO.dias.includes(d)) {
      const cuando = i === 1 ? 'mañana' : 'el ' + NOMBRE_DIA[d];
      return { abierto: false, texto: `Cerrado · abrimos ${cuando} 18:30`, proximo: `${cuando} a las 18:30` };
    }
  }
  return { abierto: false, texto: 'Cerrado' };
}

// Junta "Jugo (vaso)" y "Jugo (jarra)" en una sola tarjeta con dos opciones
function agrupar(lista) {
  const out = [], vistos = {};
  for (const p of lista) {
    const m = p.nombre.match(/^(.*?)\s*\((vaso|jarra)\)\s*$/i);
    if (!m) { out.push({ base: p.nombre, desc: descLimpia(p), vegano: tieneVegano(p), variantes: [{ p, etiqueta: null }], antojo: antojoDe(p) }); continue; }
    const base = m[1].trim();
    if (!vistos[base]) { vistos[base] = { base, desc: descLimpia(p), vegano: false, variantes: [], antojo: 'clasica' }; out.push(vistos[base]); }
    vistos[base].variantes.push({ p, etiqueta: m[2].toLowerCase() });
  }
  return out;
}

// El monito Manechi con su mochila (la mochila muestra un número o una letra)
function Monito({ texto = '', color = '#a8532f', size = 46 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ overflow: 'visible', flex: 'none' }}>
      <path d="M20 50 C9 50 7 39 13 36 C18 34 20 40 16 41" fill="none" stroke="#7a3f22" strokeWidth="3.2" strokeLinecap="round" />
      <ellipse cx="33" cy="45" rx="11" ry="12" fill="#9c5530" />
      <ellipse cx="36" cy="47" rx="6" ry="7.5" fill="#e9c39b" />
      <rect x="23" y="53" width="7" height="5" rx="2.5" fill="#7a3f22" />
      <rect x="35" y="53" width="7" height="5" rx="2.5" fill="#7a3f22" />
      <rect x="8" y="34" width="19" height="21" rx="5" fill={color} stroke="#fff" strokeWidth="2" />
      <path d="M8 41 Q17.5 45 27 41" fill="none" stroke="#fff" strokeWidth="1.5" opacity=".6" />
      <text x="17.5" y="51.5" textAnchor="middle" fontFamily="Outfit,Arial,sans-serif" fontWeight="800" fontSize={String(texto).length > 1 ? 10 : 12} fill="#fff">{texto}</text>
      <circle cx="23" cy="20" r="5" fill="#9c5530" /><circle cx="23" cy="20" r="2.6" fill="#e9c39b" />
      <circle cx="49" cy="20" r="5" fill="#9c5530" /><circle cx="49" cy="20" r="2.6" fill="#e9c39b" />
      <circle cx="36" cy="20" r="13" fill="#9c5530" />
      <path d="M26 22 C26 15 31 14 33 17 C35 14 40 14 41 17 C43 14 47 16 46 22 C46 30 40 32 36 32 C31 32 26 30 26 22Z" fill="#e9c39b" />
      <circle cx="32" cy="20" r="2" fill="#1f2b21" /><circle cx="40" cy="20" r="2" fill="#1f2b21" />
      <circle cx="32.6" cy="19.3" r=".6" fill="#fff" /><circle cx="40.6" cy="19.3" r=".6" fill="#fff" />
      <path d="M32.5 26 Q36 29 39.5 26" fill="none" stroke="#5a2c17" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M34 8 Q36 4 38 8" fill="none" stroke="#7a3f22" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function MenuCliente({ productos, negocio }) {
  const [carrito, setCarrito] = useState({}); // clave -> { id, nombre, precio, cant, vegano }
  const [abierto, setAbierto] = useState(false);
  const [antojo, setAntojo] = useState('todas');
  const [estado, setEstado] = useState(null);
  const [activa, setActiva] = useState(null);
  const [datos, setDatos] = useState({ entrega: 'delivery', nombre: '', nota: '' });
  const [salto, setSalto] = useState(0);
  const [mesa, setMesa] = useState(null); // si el cliente escaneó el QR de una mesa
  const secciones = useRef({});

  const categorias = useMemo(() => {
    const orden = [], mapa = {};
    for (const p of productos) {
      const c = p.categoria || 'Otros';
      if (!mapa[c]) { mapa[c] = []; orden.push(c); }
      mapa[c].push(p);
    }
    return orden.map(c => ({ nombre: c, grupos: agrupar(mapa[c]) }));
  }, [productos]);

  // Recordar el pedido si el cliente cierra la página
  useEffect(() => {
    try { const g = JSON.parse(localStorage.getItem(LLAVE) || 'null'); if (g && g.carrito) { setCarrito(g.carrito); if (g.datos) setDatos(d => ({ ...d, ...g.datos })); } } catch (e) {}
    setEstado(estadoLocal());
    try {
      const m = new URLSearchParams(window.location.search).get('mesa');
      if (m && /^[\w -]{1,12}$/.test(m)) setMesa(m.trim());
    } catch (e) {}
    const t = setInterval(() => setEstado(estadoLocal()), 60000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    try { localStorage.setItem(LLAVE, JSON.stringify({ carrito, datos: { entrega: datos.entrega, nombre: datos.nombre } })); } catch (e) {}
  }, [carrito, datos]);

  // Resaltar la categoría que se está viendo
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(es => {
      const vis = es.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setActiva(vis.target.dataset.cat);
    }, { rootMargin: '-120px 0px -60% 0px' });
    Object.values(secciones.current).forEach(el => el && obs.observe(el));
    return () => obs.disconnect();
  }, [categorias]);

  const lineas = Object.entries(carrito).map(([k, v]) => ({ k, ...v })).filter(x => x.cant > 0);
  const cantidad = lineas.reduce((a, x) => a + x.cant, 0);
  const total = lineas.reduce((a, x) => a + x.cant * x.precio, 0);
  const hayAlcohol = lineas.some(x => ALCOHOL.includes(x.categoria));

  function cambiar(p, delta, vegano = false, etiqueta = null) {
    const k = p.id + (vegano ? '-v' : '');
    setCarrito(c => {
      const prev = c[k] || { id: p.id, nombre: p.nombre, precio: Number(p.precio), cant: 0, vegano, categoria: p.categoria, etiqueta };
      const cant = Math.max(0, Math.min(30, prev.cant + delta));
      const n = { ...c, [k]: { ...prev, cant } };
      if (!cant) delete n[k];
      return n;
    });
    if (delta > 0) setSalto(s => s + 1);
  }
  const cantDe = (p, vegano = false) => (carrito[p.id + (vegano ? '-v' : '')] || {}).cant || 0;

  function irA(cat) {
    const el = secciones.current[cat];
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 70, behavior: 'smooth' });
  }

  function mensaje() {
    const l = [mesa ? `¡Hola Manechi! 🐒 Pedido desde la MESA ${mesa}:` : '¡Hola Manechi! 🐒 Quiero hacer un pedido:', ''];
    for (const x of lineas) {
      l.push(`• ${x.cant}× ${x.nombre}${x.vegano ? ' (con queso vegano)' : ''} — ${bs(x.cant * x.precio)}`);
    }
    l.push('', `Subtotal: ${bs(total)}`);
    if (mesa) l.push(`Entrega: 🍽️ MESA ${mesa} (estoy en el local)`);
    else l.push(datos.entrega === 'delivery' ? 'Entrega: 🛵 Delivery (te mando mi ubicación)' : 'Entrega: 🏃 Paso a recoger al local');
    if (datos.nombre.trim()) l.push('A nombre de: ' + datos.nombre.trim());
    if (datos.nota.trim()) l.push('Nota: ' + datos.nota.trim());
    if (!mesa && estado && !estado.abierto && estado.proximo) l.push('', `(Es para cuando abran: ${estado.proximo})`);
    return l.join('\n');
  }
  function pedir() {
    const url = `https://wa.me/${negocio.whatsapp}?text=${encodeURIComponent(mensaje())}`;
    window.open(url, '_blank', 'noopener');
  }

  const mapa = negocio.lat != null
    ? `https://www.google.com/maps/search/?api=1&query=${negocio.lat},${negocio.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(negocio.direccion)}`;
  const recomendada = productos.find(p => /ahumada/i.test(p.nombre)) || productos[0];

  return (
    <div className="mn">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* Portada */}
      <header className="mn-hero">
        <img src="/menu/portada.webp" alt="Manechi Pizzería — el manechi sobre una rama en la selva" width="640" height="914" />
        <div className="mn-hero-txt">
          <p className="mn-eyebrow">Pizzas salvajes 🐒🍕</p>
          <h1>Una selva en plena ciudad</h1>
          <p className="mn-lead">{mesa ? `¡Bienvenido a la selva! Estás en la Mesa ${mesa}: pedí desde tu celular y te lo llevamos a la mesa.` : 'Pizzas de autor con hongos, frutos y esencias de nuestra tierra. Mirá el menú, armá tu pedido y mandalo por WhatsApp en 3 toques.'}</p>
          {estado && <span className={'mn-estado ' + (estado.abierto ? 'on' : 'off')}><i />{estado.texto}</span>}
          <div className="mn-cta">
            <button className="mn-btn pri" onClick={() => irA(categorias[0]?.nombre)}>Ver el menú ↓</button>
            <a className="mn-btn" href={mapa} target="_blank" rel="noopener noreferrer">📍 Cómo llegar</a>
          </div>
        </div>
      </header>

      {/* Categorías */}
      <div className="mn-cats" role="navigation" aria-label="Categorías">
        {categorias.map(c => (
          <button key={c.nombre} className={activa === c.nombre ? 'on' : ''} onClick={() => irA(c.nombre)}>
            <span>{ICONO[c.nombre] || '🌿'}</span>{c.nombre}
          </button>
        ))}
      </div>

      {mesa && (
        <div className="mn-mesa"><span>🍽️</span><div><b>Estás en la Mesa {mesa}</b><small>Elegí, tocá "Pedir" y te lo llevamos a la mesa.</small></div></div>
      )}

      <main className="mn-main">
        {recomendada && (
          <div className="mn-tip">
            <Monito texto="M" />
            <p><b>¿No sabés qué pedir?</b> Si te gusta lo intenso, probá la <b>{recomendada.nombre}</b> 🔥 Y si buscás algo diferente, la <b>Motojobobo</b> no se parece a nada que hayas probado.</p>
          </div>
        )}

        {categorias.map(c => {
          const esPizza = c.nombre === 'Pizzas';
          const grupos = esPizza && antojo !== 'todas' ? c.grupos.filter(g => g.antojo === antojo) : c.grupos;
          return (
            <section key={c.nombre} data-cat={c.nombre} ref={el => { secciones.current[c.nombre] = el; }} className="mn-sec">
              <h2><span>{ICONO[c.nombre] || '🌿'}</span>{c.nombre}</h2>
              {esPizza && <p className="mn-sub">Un solo tamaño · masa crujiente y fácil de digerir · 🌿 = se puede pedir con queso vegano</p>}
              {ALCOHOL.includes(c.nombre) && <p className="mn-sub">Solo para mayores de 18 años.</p>}
              {esPizza && (
                <div className="mn-antojos">
                  {ANTOJOS.map(a => <button key={a.k} className={antojo === a.k ? 'on' : ''} onClick={() => setAntojo(a.k)}>{a.t}</button>)}
                </div>
              )}
              <div className={'mn-grid' + (esPizza ? ' pizzas' : '')}>
                {grupos.map(g => (
                  <article key={g.base} className="mn-card">
                    <div className="mn-card-top">
                      <h3>{g.base}{g.vegano && <span className="mn-hoja" title="Se puede pedir con queso vegano">🌿</span>}</h3>
                      {g.variantes.length === 1 && <b className="mn-precio">{bs(g.variantes[0].p.precio)}</b>}
                    </div>
                    {g.desc && <p className="mn-desc">{g.desc}</p>}
                    <div className="mn-acciones">
                      {g.variantes.map(({ p, etiqueta }) => (
                        <Control key={p.id} etiqueta={etiqueta ? `${etiqueta} · ${bs(p.precio)}` : null}
                          cant={cantDe(p)} mas={() => cambiar(p, 1, false, etiqueta)} menos={() => cambiar(p, -1)} />
                      ))}
                      {g.vegano && (
                        <Control etiqueta="con queso vegano" suave
                          cant={cantDe(g.variantes[0].p, true)} mas={() => cambiar(g.variantes[0].p, 1, true)} menos={() => cambiar(g.variantes[0].p, -1, true)} />
                      )}
                    </div>
                  </article>
                ))}
                {!grupos.length && <p className="mn-sub">No hay pizzas en este antojo. Probá otro 🐒</p>}
              </div>
            </section>
          );
        })}

        {/* Visitanos */}
        <section className="mn-visita">
          <h2><span>🌿</span>Vení a la selva</h2>
          <p>Un jardín lleno de plantas silvestres para escaparte un rato de la ciudad. Mesas entre la selva, pizzas al horno y jugos de frutas de nuestra tierra.</p>
          <ul>
            <li>📍 <a href={mapa} target="_blank" rel="noopener noreferrer">{negocio.direccion}</a></li>
            <li>🕡 {negocio.horario}</li>
            <li>📸 <a href={`https://instagram.com/${negocio.instagram}`} target="_blank" rel="noopener noreferrer">@{negocio.instagram}</a></li>
            <li>💬 <a href={`https://wa.me/${negocio.whatsapp}?text=${encodeURIComponent('¡Hola Manechi! 🐒 Quiero reservar una mesa en el jardín')}`} target="_blank" rel="noopener noreferrer">Reservar mesa por WhatsApp</a></li>
          </ul>
        </section>
      </main>

      <footer className="mn-pie">
        <img src="/menu/portada.webp" alt="" width="640" height="914" loading="lazy" />
        <p>Manechi Pizzería · Pizzas salvajes 🐒🍕</p>
      </footer>

      {/* Barra del pedido */}
      {cantidad > 0 && !abierto && (
        <button key={salto} className="mn-barra" onClick={() => setAbierto(true)}>
          <Monito texto={cantidad > 9 ? '9+' : String(cantidad)} size={42} />
          <span className="mn-barra-txt"><small>Tu pedido</small><b>{bs(total)}</b></span>
          <span className="mn-barra-ir">Ver pedido →</span>
        </button>
      )}

      {/* Hoja del pedido */}
      {abierto && (
        <div className="mn-velo" onClick={e => { if (e.target === e.currentTarget) setAbierto(false); }}>
          <div className="mn-hoja-pedido" role="dialog" aria-label="Tu pedido">
            <div className="mn-hp-cab">
              <Monito texto={String(cantidad)} size={40} />
              <div><h2>Tu pedido</h2><small>Va en la mochila de Manechi 🎒</small></div>
              <button className="mn-x" aria-label="Cerrar" onClick={() => setAbierto(false)}>✕</button>
            </div>

            {!lineas.length && <p className="mn-sub">Todavía no agregaste nada.</p>}
            <ul className="mn-lineas">
              {lineas.map(x => {
                const p = productos.find(y => y.id === x.id);
                return (
                  <li key={x.k}>
                    <div><b>{x.nombre}</b>{x.vegano && <small> · con queso vegano</small>}<small>{bs(x.precio)} c/u</small></div>
                    <Control cant={x.cant} mas={() => p && cambiar(p, 1, x.vegano)} menos={() => p && cambiar(p, -1, x.vegano)} />
                    <b className="mn-precio">{bs(x.cant * x.precio)}</b>
                  </li>
                );
              })}
            </ul>

            {mesa ? (
              <div className="mn-mesa chica"><span>🍽️</span><div><b>Para la Mesa {mesa}</b><small>Te lo llevamos a tu mesa.</small></div></div>
            ) : (
              <>
                <label className="mn-l">¿Cómo lo querés?</label>
                <div className="mn-seg">
                  <button className={datos.entrega === 'delivery' ? 'on' : ''} onClick={() => setDatos({ ...datos, entrega: 'delivery' })}>🛵 Delivery</button>
                  <button className={datos.entrega === 'recojo' ? 'on' : ''} onClick={() => setDatos({ ...datos, entrega: 'recojo' })}>🏃 Paso a recoger</button>
                </div>
              </>
            )}
            <label className="mn-l" htmlFor="mn-nombre">Tu nombre <span>(opcional)</span></label>
            <input id="mn-nombre" className="mn-inp" value={datos.nombre} onChange={e => setDatos({ ...datos, nombre: e.target.value })} placeholder="Ej. Carla" autoComplete="given-name" />
            <label className="mn-l" htmlFor="mn-nota">Nota <span>(opcional)</span></label>
            <input id="mn-nota" className="mn-inp" value={datos.nota} onChange={e => setDatos({ ...datos, nota: e.target.value })} placeholder="Ej. sin cebolla, tocar el timbre" />

            <div className="mn-total"><span>Subtotal</span><b>{bs(total)}</b></div>
            <p className="mn-sub" style={{ marginTop: 4 }}>
              {mesa ? 'Manechi te confirma el pedido por WhatsApp y lo llevamos a tu mesa.' : datos.entrega === 'delivery' ? 'El envío se calcula con tu ubicación. Manechi te confirma el total y la forma de pago por WhatsApp.' : 'Manechi te confirma por WhatsApp cuándo está listo.'}
              {hayAlcohol && ' Las bebidas alcohólicas se entregan solo a mayores de 18.'}
            </p>
            {!mesa && estado && !estado.abierto && <p className="mn-aviso">🌙 {estado.texto}. Podés mandar tu pedido igual y lo dejamos reservado para {estado.proximo || 'cuando abramos'}.</p>}

            <button className="mn-wa" disabled={!lineas.length} onClick={pedir}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 2s.8 2.3.9 2.5c.1.2 1.7 2.6 4.1 3.6 1.5.7 2.1.7 2.9.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" /></svg>
              Pedir por WhatsApp · {bs(total)}
            </button>
            {lineas.length > 0 && <button className="mn-vaciar" onClick={() => { setCarrito({}); setAbierto(false); }}>Vaciar pedido</button>}
          </div>
        </div>
      )}
    </div>
  );
}

function Control({ cant, mas, menos, etiqueta, suave }) {
  if (!cant) {
    return (
      <button className={'mn-add' + (suave ? ' suave' : '')} onClick={mas} aria-label={'Agregar ' + (etiqueta || '')}>
        <span>+</span>{etiqueta ? etiqueta : 'Agregar'}
      </button>
    );
  }
  return (
    <div className={'mn-step' + (suave ? ' suave' : '')}>
      {etiqueta && <small>{etiqueta}</small>}
      <button onClick={menos} aria-label="Quitar uno">−</button>
      <b>{cant}</b>
      <button onClick={mas} aria-label="Agregar uno">+</button>
    </div>
  );
}

const CSS = `
.mn{--crema:#fffdf3;--arena:#f4ecdb;--tinta:#2b2118;--suave:#7a6b5d;--terra:#b0482a;--terra2:#8f3a22;--selva:#2f5d3a;--hoja:#6f9a5a;--linea:#eadfcb;
  background:var(--crema);color:var(--tinta);min-height:100vh;font-family:Outfit,system-ui,sans-serif;font-size:15px;padding-bottom:110px}
.mn *,.mn *::before,.mn *::after{box-sizing:border-box}
.mn h1,.mn h2,.mn h3{font-family:var(--f-display),Georgia,serif;margin:0}
.mn a{color:var(--terra)}
.mn-hero{max-width:1080px;margin:0 auto;display:grid;grid-template-columns:1fr;align-items:center}
.mn-hero img{width:100%;max-width:520px;height:58vh;min-height:340px;display:block;margin:0 auto;object-fit:cover;object-position:50% 30%}
@media(min-width:860px){.mn-hero img{height:auto;max-height:82vh;object-fit:contain}}
.mn-hero-txt{padding:4px 22px 18px;text-align:center}
.mn-eyebrow{color:var(--terra);font-weight:600;letter-spacing:.14em;text-transform:uppercase;font-size:12.5px;margin:0 0 8px}
.mn-hero h1{font-size:clamp(30px,6.5vw,46px);line-height:1.05;color:var(--selva);font-weight:700}
.mn-lead{color:var(--suave);font-size:16px;line-height:1.5;max-width:460px;margin:12px auto 14px}
.mn-estado{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;padding:6px 12px;border-radius:999px;background:var(--arena);color:var(--suave)}
.mn-estado i{width:8px;height:8px;border-radius:50%;background:#b9a995}
.mn-estado.on{background:#e3f0df;color:#2f6b3a}.mn-estado.on i{background:#3fa45a;box-shadow:0 0 0 4px rgba(63,164,90,.18)}
.mn-cta{display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap}
.mn-btn{border:1.5px solid var(--linea);background:#fff;color:var(--tinta);border-radius:999px;padding:12px 20px;font-weight:600;text-decoration:none;font-size:15px}
.mn-btn.pri{background:var(--terra);border-color:var(--terra);color:#fff;box-shadow:0 8px 20px -8px rgba(176,72,42,.6)}
@media(min-width:860px){
  .mn-hero{grid-template-columns:1fr 1fr;gap:20px;padding:20px 24px 0}
  .mn-hero-txt{text-align:left}.mn-lead{margin-left:0}.mn-cta{justify-content:flex-start}
}
.mn-cats{position:sticky;top:0;z-index:20;display:flex;gap:8px;overflow-x:auto;padding:10px 14px;background:rgba(255,253,243,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--linea);scrollbar-width:none;justify-content:flex-start}
.mn-cats::-webkit-scrollbar{display:none}
.mn-cats button{flex:none;border:0;background:transparent;color:var(--suave);font-weight:600;padding:8px 12px;border-radius:999px;display:flex;gap:6px;align-items:center;font-size:14px}
.mn-cats button.on{background:var(--selva);color:#fff}
@media(min-width:860px){.mn-cats{justify-content:center}}
.mn-main{max-width:1080px;margin:0 auto;padding:6px 16px 0}
.mn-tip{display:flex;gap:12px;align-items:center;background:#fff;border:1px solid var(--linea);border-radius:18px;padding:12px 14px;margin:16px 0 6px;box-shadow:0 6px 22px -14px rgba(60,40,20,.35)}
.mn-tip p{margin:0;font-size:14px;line-height:1.45;color:var(--suave)}.mn-tip b{color:var(--tinta)}
.mn-sec{padding-top:26px;scroll-margin-top:70px}
.mn-sec h2,.mn-visita h2{font-size:26px;color:var(--terra);display:flex;align-items:center;gap:10px;letter-spacing:.01em}
.mn-sec h2 span,.mn-visita h2 span{font-size:22px}
.mn-sub{color:var(--suave);font-size:13.5px;margin:6px 0 0}
.mn-antojos{display:flex;gap:8px;overflow-x:auto;margin:12px -16px 0;padding:0 16px 4px;scrollbar-width:none}
.mn-antojos::-webkit-scrollbar{display:none}
.mn-antojos button{flex:none;border:1.5px solid var(--linea);background:#fff;border-radius:999px;padding:8px 14px;font-weight:600;color:var(--suave);font-size:14px}
.mn-antojos button.on{border-color:var(--terra);color:var(--terra);background:#fbeee6}
.mn-grid{display:grid;grid-template-columns:1fr;gap:12px;margin-top:14px}
@media(min-width:700px){.mn-grid{grid-template-columns:1fr 1fr}}
.mn-card{background:#fff;border:1px solid var(--linea);border-radius:18px;padding:16px;display:flex;flex-direction:column;gap:8px;transition:transform .15s,box-shadow .15s}
.mn-card:hover{transform:translateY(-2px);box-shadow:0 12px 28px -18px rgba(60,40,20,.45)}
.mn-grid.pizzas .mn-card{border-left:4px solid var(--terra)}
.mn-card-top{display:flex;justify-content:space-between;gap:12px;align-items:baseline}
.mn-card h3{font-size:19px;font-weight:700;line-height:1.2}
.mn-hoja{font-size:14px;margin-left:6px}
.mn-precio{color:var(--terra);font-weight:700;white-space:nowrap;font-size:16px}
.mn-desc{margin:0;color:var(--suave);font-size:14px;line-height:1.45}
.mn-acciones{display:flex;flex-wrap:wrap;gap:8px;margin-top:auto;padding-top:6px}
.mn-add{display:inline-flex;align-items:center;gap:8px;border:0;background:var(--selva);color:#fff;font-weight:600;border-radius:999px;padding:9px 16px 9px 10px;font-size:14px;text-transform:none}
.mn-add span{width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,.2);display:grid;place-items:center;font-size:17px;line-height:1}
.mn-add.suave{background:#eef4e8;color:var(--selva)}.mn-add.suave span{background:rgba(47,93,58,.12)}
.mn-step{display:inline-flex;align-items:center;gap:4px;background:var(--selva);color:#fff;border-radius:999px;padding:4px}
.mn-step.suave{background:#eef4e8;color:var(--selva)}
.mn-step small{padding:0 6px 0 10px;font-weight:600}
.mn-step button{width:32px;height:32px;border-radius:50%;border:0;background:rgba(255,255,255,.18);color:inherit;font-size:18px;font-weight:700;line-height:1}
.mn-step.suave button{background:rgba(47,93,58,.12)}
.mn-step b{min-width:22px;text-align:center}
.mn-visita{margin:34px 0 0;background:var(--selva);color:#eaf1e4;border-radius:22px;padding:22px}
.mn-visita h2{color:#fff}.mn-visita p{line-height:1.5;color:#d6e3cf}
.mn-visita ul{list-style:none;padding:0;margin:12px 0 0;display:grid;gap:10px}
.mn-visita a{color:#ffd9c2;font-weight:600}
.mn-pie{text-align:center;margin-top:20px;color:var(--suave);font-size:13px}
.mn-pie img{width:100%;max-width:640px;height:200px;object-fit:cover;object-position:50% 100%;display:block;margin:0 auto}
.mn-pie p{margin:-6px 0 0}
@keyframes mnSalto{0%{transform:translate(-50%,0) scale(1)}40%{transform:translate(-50%,-6px) scale(1.03)}100%{transform:translate(-50%,0) scale(1)}}
.mn-barra{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:40;width:min(520px,calc(100% - 24px));display:flex;align-items:center;gap:12px;border:0;border-radius:20px;padding:10px 16px 10px 12px;background:var(--tinta);color:#fff;box-shadow:0 18px 40px -12px rgba(30,20,10,.55);animation:mnSalto .35s ease;text-align:left}
.mn-barra-txt{display:flex;flex-direction:column;line-height:1.15}.mn-barra-txt small{color:#cbbfb2;font-size:12px}.mn-barra-txt b{font-size:18px}
.mn-barra-ir{margin-left:auto;background:var(--terra);border-radius:999px;padding:10px 16px;font-weight:700;font-size:14px}
.mn-velo{position:fixed;inset:0;z-index:50;background:rgba(30,22,14,.45);display:flex;align-items:flex-end;justify-content:center}
@keyframes mnSube{from{transform:translateY(40px);opacity:.4}to{transform:none;opacity:1}}
.mn-hoja-pedido{background:var(--crema);width:min(560px,100%);max-height:92vh;overflow:auto;border-radius:24px 24px 0 0;padding:18px 18px 22px;animation:mnSube .22s ease}
@media(min-width:700px){.mn-velo{align-items:center}.mn-hoja-pedido{border-radius:24px}}
.mn-hp-cab{display:flex;align-items:center;gap:12px;margin-bottom:8px}
.mn-hp-cab h2{font-size:24px;color:var(--tinta)}.mn-hp-cab small{color:var(--suave)}
.mn-x{margin-left:auto;border:0;background:var(--arena);width:36px;height:36px;border-radius:50%;font-size:15px;color:var(--suave)}
.mn-lineas{list-style:none;padding:0;margin:8px 0 6px}
.mn-lineas li{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;padding:12px 0;border-bottom:1px dashed var(--linea)}
.mn-lineas li>div:first-child{display:flex;flex-direction:column}.mn-lineas small{color:var(--suave);font-size:12.5px}
.mn-lineas .mn-step button{width:28px;height:28px}
.mn-l{display:block;font-weight:600;font-size:13.5px;margin:14px 0 6px}.mn-l span{color:var(--suave);font-weight:400}
.mn-seg{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.mn-seg button{border:1.5px solid var(--linea);background:#fff;border-radius:14px;padding:12px;font-weight:600;color:var(--suave);font-size:14px}
.mn-seg button.on{border-color:var(--selva);background:#eef4e8;color:var(--selva)}
.mn-inp{width:100%;border:1.5px solid var(--linea);background:#fff;border-radius:14px;padding:12px 14px;font-size:16px;font-family:inherit;color:var(--tinta)}
.mn-inp:focus{outline:none;border-color:var(--hoja)}
.mn-total{display:flex;justify-content:space-between;align-items:baseline;margin-top:16px;font-size:16px}.mn-total b{font-size:22px;color:var(--terra)}
.mn-aviso{background:#fbf0d8;color:#7a5410;border-radius:12px;padding:10px 12px;font-size:13.5px;margin:12px 0 0}
.mn-wa{width:100%;margin-top:16px;border:0;border-radius:16px;background:#1f9d55;color:#fff;font-weight:700;font-size:17px;padding:16px;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:0 12px 26px -12px rgba(31,157,85,.7)}
.mn-wa:disabled{opacity:.5}
.mn-mesa{position:sticky;top:57px;z-index:15;max-width:1080px;margin:10px auto 0;width:calc(100% - 32px);display:flex;gap:12px;align-items:center;background:var(--terra);color:#fff;border-radius:16px;padding:12px 14px;box-shadow:0 10px 24px -14px rgba(176,72,42,.8)}
.mn-mesa span{font-size:24px}.mn-mesa div{display:flex;flex-direction:column}.mn-mesa small{opacity:.85}
.mn-mesa.chica{position:static;width:100%;margin:14px 0 0}
.mn-vaciar{display:block;margin:12px auto 0;border:0;background:none;color:var(--suave);text-decoration:underline;font-size:13px}
`;

import Anthropic from '@anthropic-ai/sdk';
import { admin } from './supabaseAdmin';

const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const URL = () => (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');

// ---------------------------------------------------------------------
// Herramientas que el agente puede usar. Todas leen/escriben la base real.
// ---------------------------------------------------------------------
const TOOLS = [
  {
    name: 'ver_menu',
    description: 'Devuelve el menú actual con id, nombre, categoría, descripción y precio de cada producto disponible. Úsalo antes de confirmar precios o productos.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'guardar_datos_cliente',
    description: 'Guarda el nombre del cliente y/o su dirección escrita (calle, número, barrio, referencias). La ubicación GPS solo se obtiene cuando el cliente comparte su ubicación de WhatsApp.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre del cliente' },
        direccion: { type: 'string', description: 'Dirección escrita con referencias' }
      }
    }
  },
  {
    name: 'calcular_envio',
    description: 'Calcula zona, costo de envío y tiempo estimado según la ubicación guardada del cliente. Si falta la ubicación, avisa que hay que pedirla.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'crear_pedido',
    description: 'Crea el pedido en el sistema. Llámalo SOLO después de que el cliente confirmó explícitamente el resumen completo (productos, cantidades, total, tipo de entrega y forma de pago).',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              producto_id: { type: 'integer' },
              cantidad: { type: 'integer', minimum: 1 },
              nota: { type: 'string', description: 'Ej: sin cebolla, mitad pepperoni mitad hawaiana' }
            },
            required: ['producto_id', 'cantidad']
          }
        },
        tipo: { type: 'string', enum: ['delivery', 'mostrador'], description: 'delivery = envío a domicilio; mostrador = el cliente pasa a recoger' },
        metodo_pago: { type: 'string', enum: ['Efectivo', 'QR', 'Tarjeta'] },
        nota: { type: 'string', description: 'Notas generales, ej. paga con Bs 200, tocar timbre' }
      },
      required: ['items', 'tipo', 'metodo_pago']
    }
  },
  {
    name: 'estado_pedido',
    description: 'Consulta el estado de los pedidos recientes del cliente (en cocina, en camino, etc.).',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'escalar_a_humano',
    description: 'Pasa la conversación a una persona del local. Úsalo ante reclamos serios, enojo, pedidos para eventos grandes, problemas de pago o cualquier cosa que no puedas resolver.',
    input_schema: {
      type: 'object',
      properties: { motivo: { type: 'string' } },
      required: ['motivo']
    }
  }
];

async function ejecutar(nombre, input, ctx) {
  const db = admin();
  switch (nombre) {
    case 'ver_menu': {
      const { data } = await db.from('products').select('id,nombre,categoria,descripcion,precio')
        .eq('activo', true).order('orden').order('id');
      return data || [];
    }
    case 'guardar_datos_cliente': {
      const cambios = {};
      if (input.nombre) cambios.nombre = input.nombre;
      if (input.direccion) cambios.direccion = input.direccion;
      if (Object.keys(cambios).length) {
        const { data } = await db.from('customers').update(cambios).eq('id', ctx.cliente.id).select().single();
        if (data) ctx.cliente = data;
      }
      return { ok: true, tiene_ubicacion_gps: ctx.cliente.lat != null };
    }
    case 'calcular_envio': {
      const c = ctx.cliente;
      if (c.lat == null)
        return { error: 'Falta la ubicación. Pide al cliente que la comparta: clip 📎 > Ubicación > Enviar mi ubicación actual (o elegir un punto en el mapa).' };
      const { data } = await db.rpc('zona_para', { p_lat: c.lat, p_lng: c.lng });
      const z = Array.isArray(data) ? data[0] : data;
      if (!z) return { fuera_de_cobertura: true, mensaje: 'La ubicación está fuera de nuestra zona de delivery. Puede pasar a recoger al local.' };
      return { zona: z.nombre, costo_envio: Number(z.tarifa), minutos_estimados: z.minutos };
    }
    case 'crear_pedido': {
      const c = ctx.cliente;
      const { data: o, error } = await db.rpc('crear_pedido', {
        p: {
          canal: 'WhatsApp', ia: true, estado: 'nuevo',
          cliente_nombre: c.nombre || 'Cliente WhatsApp', telefono: c.telefono, customer_id: c.id,
          tipo: input.tipo, direccion: c.direccion, lat: c.lat, lng: c.lng,
          metodo_pago: input.metodo_pago, nota: input.nota || null,
          items: input.items
        }
      });
      if (error) return { error: error.message };
      if (input.metodo_pago === 'QR' && ctx.settings.qr_imagen_url) ctx.enviarQR = { total: o.total, id: o.id };
      return {
        ok: true, pedido_id: o.id, subtotal: Number(o.subtotal), envio: Number(o.envio), total: Number(o.total),
        link_seguimiento: `${URL()}/seguir/${o.tracking_token}`,
        nota_para_ti: input.metodo_pago === 'QR'
          ? (ctx.settings.qr_imagen_url ? 'El sistema enviará la imagen del QR automáticamente después de tu mensaje. Pide que envíe la foto del comprobante.' : 'No hay QR configurado: indica que en un momento le envían el QR.')
          : 'El pedido queda pendiente de confirmación del local; se le avisará cuando entre a cocina.'
      };
    }
    case 'estado_pedido': {
      const { data } = await db.from('orders').select('id,estado,total,created_at,tipo,tracking_token,riders(nombre)')
        .eq('telefono', ctx.cliente.telefono).order('created_at', { ascending: false }).limit(3);
      const nombres = { nuevo: 'recibido, esperando confirmación', cocina: 'en preparación', listo: 'listo, esperando repartidor', camino: 'en camino', entregado: 'entregado', cancelado: 'cancelado' };
      return (data || []).map(o => ({
        pedido: o.id, estado: nombres[o.estado], total: Number(o.total), hora: o.created_at,
        repartidor: o.riders ? o.riders.nombre : null,
        seguimiento: o.estado === 'camino' ? `${URL()}/seguir/${o.tracking_token}` : null
      }));
    }
    case 'escalar_a_humano': {
      await db.from('customers').update({ escalado: true, escalado_motivo: input.motivo }).eq('id', ctx.cliente.id);
      ctx.escalado = true;
      return { ok: true, mensaje: 'Una persona del local continuará la conversación. Despídete brevemente diciendo eso.' };
    }
    default:
      return { error: 'Herramienta desconocida' };
  }
}

function sistema(ctx, menu, zonas) {
  const s = ctx.settings, c = ctx.cliente;
  const ahora = new Date().toLocaleString('es-BO', { timeZone: process.env.TZ_NEGOCIO || 'America/La_Paz', dateStyle: 'full', timeStyle: 'short' });
  return `Eres el asistente de pedidos por WhatsApp de "${s.nombre_negocio}", una pizzería en ${s.direccion_local || 'Santa Cruz de la Sierra, Bolivia'}.
Hablas español boliviano, cálido, breve y claro (mensajes cortos, como en WhatsApp; algún emoji está bien). Moneda: bolivianos (Bs).
Fecha y hora actual: ${ahora}. Horario de atención: ${s.horario || 'no definido'}.

TU TRABAJO: tomar pedidos completos, resolver dudas del menú, informar el estado de pedidos y derivar a una persona cuando haga falta.

REGLAS:
- Nunca inventes productos ni precios: usa solo el menú de abajo (o la herramienta ver_menu).
- Para delivery necesitas la ubicación GPS del cliente (que la comparta por WhatsApp) y una dirección escrita con referencias. Usa calcular_envio para saber el costo y si llega.
- Sugiere UNA vez, con naturalidad, un complemento (entrada, bebida o postre del menú) si el pedido no lo tiene.
- Antes de crear el pedido muestra un resumen: productos, cantidades, notas, subtotal, envío, total, tipo de entrega y forma de pago. Crea el pedido solo cuando el cliente confirme.
- Formas de pago: Efectivo (pregunta con cuánto paga para llevar cambio), QR o Tarjeta (link de pago que envía el local).
- Si piden algo fuera de horario, toma nota pero avisa que se prepara cuando abra el local.
- Si el cliente está molesto, hay un reclamo, un pedido para evento grande o algo que no puedas resolver: usa escalar_a_humano.
- No hables de temas ajenos a la pizzería. No pidas datos de tarjetas por chat.
${s.instrucciones_agente ? '\nINSTRUCCIONES DEL DUEÑO:\n' + s.instrucciones_agente + '\n' : ''}
MENÚ (id · nombre · precio):
${menu.map(p => `${p.id} · ${p.nombre} (${p.categoria}) · Bs ${p.precio}${p.descripcion ? ' — ' + p.descripcion : ''}`).join('\n')}

ZONAS DE DELIVERY: ${zonas.map(z => `${z.nombre}: Bs ${z.tarifa}, ~${z.minutos} min`).join('; ')}

CLIENTE ACTUAL:
- Teléfono: ${c.telefono}
- Nombre: ${c.nombre || 'desconocido (pregúntalo con naturalidad)'}
- Dirección guardada: ${c.direccion || 'ninguna'}
- Ubicación GPS guardada: ${c.lat != null ? 'sí' : 'no'}
- Puntos de fidelidad: ${c.puntos}`;
}

// Convierte el historial de la base al formato de mensajes del modelo
function historial(msgs) {
  const out = [];
  for (const m of msgs) {
    const role = m.rol === 'cliente' ? 'user' : 'assistant';
    const texto = m.rol === 'humano' ? '[Mensaje de una persona del local] ' + m.texto
      : m.rol === 'sistema' ? '[Aviso automático enviado] ' + m.texto : m.texto;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += '\n' + texto;
    else out.push({ role, content: texto });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  while (out.length && out[out.length - 1].role !== 'user') out.pop();
  return out;
}

/**
 * Genera la respuesta del agente para un cliente.
 * @returns {{texto: string, enviarQR: object|null, escalado: boolean}}
 */
export async function responder(cliente) {
  const db = admin();
  const [{ data: settings }, { data: menu }, { data: zonas }, { data: msgs }] = await Promise.all([
    db.from('settings').select('*').eq('id', 1).single(),
    db.from('products').select('id,nombre,categoria,descripcion,precio').eq('activo', true).order('orden').order('id'),
    db.from('zones').select('*').eq('activo', true).order('radio_km'),
    db.from('messages').select('rol,texto,created_at').eq('telefono', cliente.telefono)
      .order('created_at', { ascending: false }).limit(24)
  ]);
  const ctx = { cliente, settings: settings || {}, enviarQR: null, escalado: false };
  const messages = historial((msgs || []).reverse());
  if (!messages.length) return { texto: '', enviarQR: null, escalado: false };

  const system = sistema(ctx, menu || [], zonas || []);
  const proveedor = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
  const texto = proveedor === 'gemini'
    ? await conGemini(system, messages, ctx)
    : await conClaude(system, messages, ctx);

  return { texto, enviarQR: ctx.enviarQR, escalado: ctx.escalado, settings: ctx.settings };
}

// ---------------------------------------------------------------------
// Claude (Anthropic): el recomendado para el lanzamiento
// ---------------------------------------------------------------------
async function conClaude(system, messages, ctx) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let texto = '';
  for (let vuelta = 0; vuelta < 8; vuelta++) {
    const resp = await anthropic.messages.create({
      model: MODEL(),
      max_tokens: 1024,
      system,
      tools: TOOLS,
      messages
    });
    const textos = resp.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (textos) texto = textos;
    if (resp.stop_reason !== 'tool_use') break;

    messages.push({ role: 'assistant', content: resp.content });
    const resultados = [];
    for (const b of resp.content) {
      if (b.type !== 'tool_use') continue;
      let r;
      try { r = await ejecutar(b.name, b.input || {}, ctx); }
      catch (e) { r = { error: e.message }; }
      resultados.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(r) });
    }
    messages.push({ role: 'user', content: resultados });
  }
  return texto;
}

// ---------------------------------------------------------------------
// Google Gemini: plan gratuito, para pruebas (tiene límites diarios bajos)
// ---------------------------------------------------------------------
function esquemaGemini(schema) {
  // Gemini acepta un subconjunto de JSON Schema: quitamos lo que no soporta
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === 'minimum' || k === 'maximum' || k === 'additionalProperties') continue;
    if (k === 'properties') {
      out.properties = {};
      for (const [pk, pv] of Object.entries(v)) out.properties[pk] = esquemaGemini(pv);
    } else if (k === 'items') out.items = esquemaGemini(v);
    else out[k] = v;
  }
  return out;
}

async function conGemini(system, messages, ctx) {
  // Si el modelo principal está saturado (503), se reintenta y luego se usa uno de respaldo
  const modelos = [process.env.GEMINI_MODEL || 'gemini-flash-latest', 'gemini-flash-lite-latest']
    .filter((m, i, a) => a.indexOf(m) === i);
  const espera = ms => new Promise(r => setTimeout(r, ms));
  async function pedir(cuerpo) {
    let ultimo = '';
    for (const modelo of modelos) {
      for (let intento = 0; intento < 2; intento++) {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY || '' },
          body: JSON.stringify(cuerpo)
        });
        if (res.ok) return res.json();
        const detalle = await res.text();
        ultimo = res.status + ': ' + detalle.slice(0, 200);
        if (res.status === 503 || res.status === 500) { await espera(1200 * (intento + 1)); continue; }
        if (res.status === 429) break; // límite de este modelo: probar el de respaldo
        throw new Error('Gemini respondió ' + res.status + ': ' + detalle.slice(0, 300));
      }
    }
    throw new Error('Gemini está saturado en este momento, intenta de nuevo en un minuto. (' + ultimo + ')');
  }
  const herramientas = [{
    functionDeclarations: TOOLS.map(t => {
      const d = { name: t.name, description: t.description };
      // Gemini no acepta objetos sin propiedades: en ese caso se omite "parameters"
      if (t.input_schema && Object.keys(t.input_schema.properties || {}).length) d.parameters = esquemaGemini(t.input_schema);
      return d;
    })
  }];
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }]
  }));

  let texto = '';
  for (let vuelta = 0; vuelta < 8; vuelta++) {
    const data = await pedir({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      tools: herramientas,
      generationConfig: { maxOutputTokens: 1024, temperature: 0.4 }
    });
    const contenido = data.candidates && data.candidates[0] && data.candidates[0].content;
    const partes = (contenido && contenido.parts) || [];
    const textos = partes.filter(p => p.text && !p.thought).map(p => p.text).join('\n').trim();
    if (textos) texto = textos;
    const llamadas = partes.filter(p => p.functionCall);
    if (!llamadas.length) break;

    // Se devuelve el contenido tal cual (incluye las "firmas" internas que Gemini necesita)
    contents.push({ role: 'model', parts: partes });
    const respuestas = [];
    for (const p of llamadas) {
      let r;
      try { r = await ejecutar(p.functionCall.name, p.functionCall.args || {}, ctx); }
      catch (e) { r = { error: e.message }; }
      respuestas.push({ functionResponse: { name: p.functionCall.name, response: { resultado: r } } });
    }
    contents.push({ role: 'user', parts: respuestas });
  }
  return texto;
}

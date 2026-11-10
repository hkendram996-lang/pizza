# 🍕 Pizzería IA

Sistema completo para una pizzería:

- **Agente IA en WhatsApp**: toma pedidos, recomienda, calcula el envío por ubicación, crea el pedido y avisa al cliente.
- **Panel web**: Inicio, Pedidos (todos los canales + chat de WhatsApp), Cocina, Delivery con **mapa real en vivo**, Caja con arqueo, Catálogo, Finanzas y Ajustes.
- **App del repartidor** (se abre en el celular): comparte el GPS, recibe pedidos automáticamente, abre la ruta en Google Maps y marca "Entregado".
- **Página de seguimiento** para el cliente: ve el estado y al repartidor en el mapa.
- **Simulador del agente** (Ajustes → Probar agente) para probar todo sin WhatsApp.

Tecnología: Next.js 14 (React) · Supabase (base de datos, usuarios y tiempo real) · Leaflet + OpenStreetMap (mapa gratis) · Claude (IA) · WhatsApp Cloud API de Meta.

---

## 📋 Lo que vas a necesitar (todo tiene plan gratis para empezar, salvo la IA)

| Cuenta | Para qué | Dónde |
|---|---|---|
| GitHub | Guardar el código | https://github.com/signup |
| Supabase | Base de datos y usuarios | https://supabase.com |
| Vercel | Publicar el sistema en internet | https://vercel.com (entra con tu GitHub) |
| Anthropic | La inteligencia del agente (se paga por uso) | https://console.anthropic.com |
| Meta for Developers | WhatsApp Business API | https://developers.facebook.com |

Y en tu computadora: **Node.js 20 o más nuevo** (https://nodejs.org, botón "LTS") y **GitHub Desktop** (https://desktop.github.com), que es la forma más fácil de subir el código.

---

## Paso 1 · Crear la base de datos (Supabase)

1. Entra a Supabase → **New project**. Ponle nombre (ej. `pizzeria`), una contraseña y región **São Paulo** (la más cercana a Bolivia).
2. Cuando termine de crearse, ve a **SQL Editor → New query**.
3. Abre el archivo `supabase/schema.sql` de esta carpeta, copia **todo**, pégalo y presiona **Run**. Debe decir "Success".
4. Nueva query: copia y ejecuta `supabase/seed.sql` (menú y zonas de ejemplo). Hazlo **una sola vez**.
5. Ve a **Authentication → Sign In / Providers → Email** y desactiva **Confirm email** (así tu equipo entra sin confirmar el correo).
6. Ve a **Project Settings → API** y copia:
   - `Project URL`
   - `anon public` key
   - `service_role` key (¡secreta!)

## Paso 2 · Configurar las claves

1. En esta carpeta, copia el archivo `.env.example` y renómbralo como `.env.local`.
2. Pega los valores de Supabase.
3. En https://console.anthropic.com → **API Keys → Create Key**, cópiala en `ANTHROPIC_API_KEY`. Carga algo de saldo (Billing).
4. Lo de WhatsApp lo completas en el Paso 6. Por ahora puede quedar como está.

> ⚠️ El archivo `.env.local` **nunca** se sube a GitHub (ya está excluido en `.gitignore`).

## Paso 3 · Probarlo en tu computadora

Abre una terminal **en esta carpeta** (en Windows: clic derecho dentro de la carpeta → "Abrir en Terminal") y escribe:

```bash
npm install
npm run dev
```

Abre http://localhost:3000 en el navegador.

1. Te pedirá entrar: haz clic en **Crear una** y registra tu cuenta. **El primer usuario es el administrador.**
2. Ve a **Ajustes → Negocio y agente** y pon el nombre, dirección y la ubicación del local (si estás en el local usa el botón 📍).
3. Revisa **Zonas de envío** y el **Catálogo** con tus precios y costos reales.
4. Ve a **Caja** y abre la caja.
5. Ve a **Ajustes → 🤖 Probar agente** y escribe "Hola, quiero una pizza". Envía una ubicación de prueba (ej. `-17.79, -63.18`) y confirma el pedido. ¡Debería aparecer en Pedidos!

## Paso 4 · Subir el código a GitHub

1. Abre GitHub Desktop → **File → Add local repository** → elige esta carpeta → si te pregunta, **create a repository**.
2. Escribe un mensaje como "Primera versión" → **Commit to main** → **Publish repository** (déjalo **Private**).

## Paso 5 · Publicarlo en internet (Vercel)

1. En Vercel → **Add New → Project** → elige el repositorio `pizzeria-ia` → **Import**.
2. Antes de **Deploy**, abre **Environment Variables** y carga **todas** las variables de tu `.env.local` (una por una, mismo nombre y valor).
3. En `NEXT_PUBLIC_APP_URL` pon la dirección que te da Vercel (ej. `https://pizzeria-ia.vercel.app`).
4. **Deploy**. En 2-3 minutos el sistema está en línea.
5. Cada vez que subas cambios a GitHub, Vercel lo actualiza solo.

## Paso 6 · Conectar WhatsApp (Meta)

1. En https://developers.facebook.com → **Mis apps → Crear app** → tipo **Empresa** → agrega el producto **WhatsApp**.
2. En **WhatsApp → Configuración de la API** verás un número de prueba, el **Phone number ID** y un **token temporal**. Cópialos en Vercel (`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TOKEN`). Agrega tu propio celular como destinatario de prueba.
3. Inventa una palabra secreta y ponla en `WHATSAPP_VERIFY_TOKEN` (en Vercel).
4. En **WhatsApp → Configuración → Webhook → Editar**:
   - URL de devolución de llamada: `https://TU-DIRECCION.vercel.app/api/whatsapp`
   - Token de verificación: la misma palabra secreta
   - Luego, en **Campos del webhook**, suscríbete a **messages**.
5. (Recomendado) Copia el **App Secret** (Configuración de la app → Básica) en `WHATSAPP_APP_SECRET`.
6. En Vercel → Deployments → los tres puntos del último → **Redeploy** (para que tome las variables nuevas).
7. Escribe "Hola" al número de prueba desde tu celular. ¡El agente debería responder!

**Para usar tu número real del negocio:** en Meta Business Suite verifica tu empresa, agrega tu número en WhatsApp Manager y crea un **token permanente** (Usuarios del sistema → Generar token con permisos `whatsapp_business_messaging` y `whatsapp_business_management`). El número no puede estar usándose al mismo tiempo en la app normal de WhatsApp Business.

**QR de cobro:** sube la imagen del QR de tu banco a un lugar público (por ejemplo, Supabase → Storage → bucket público) y pega el link en Ajustes. El agente lo enviará cuando el cliente elija pagar con QR.

## Paso 7 · Tu equipo

- Cada persona entra al sistema, toca **Crear una** y se registra.
- Tú (admin) vas a **Ajustes → Usuarios** y le das su rol:
  - **cajero**: pedidos, caja, catálogo, delivery
  - **cocina**: solo la pantalla de comandas (ideal en una tablet en la cocina)
  - **repartidor**: la app de entregas
- Para repartidores: después de darles el rol, en **Ajustes → Repartidores** crea el repartidor y vincúlalo a su usuario. Ellos abren el sistema en el celular, entran y tocan **Estoy disponible** (deben permitir la ubicación).

---

## 🔁 Cómo funciona un pedido

1. El cliente escribe por WhatsApp → el agente toma el pedido, pide la ubicación, calcula el envío, muestra el resumen y lo crea al confirmar. Aparece en **Pedidos → Nuevos** con la etiqueta **IA**.
2. El cajero revisa (y verifica el pago si fue QR/tarjeta) → **A cocina**. El cliente recibe "tu pedido está en preparación".
3. Cocina toca **✓ Listo** → el sistema asigna automáticamente al repartidor libre que lleva más tiempo esperando. El cliente recibe el link de seguimiento.
4. El repartidor ve el pedido en su celular, abre la ruta, entrega y toca **Entregado**. Si era efectivo, el cobro se registra en la caja.
5. Todo queda en **Finanzas**: ventas, costo de cada producto, comisiones, gastos y utilidad del mes.

Si el agente no puede resolver algo (reclamo, pedido grande), **pasa la conversación a una persona**: aparece en rojo en Pedidos y desde ahí respondes por WhatsApp. Con **Devolver al agente** vuelve a atender la IA.

---

## 🗂️ Estructura del proyecto

```
app/
  login/                 Entrar / crear cuenta
  panel/                 Panel (Inicio, pedidos, cocina, delivery, caja, catalogo, finanzas, ajustes)
  repartidor/            App del repartidor (celular)
  seguir/[token]/        Seguimiento público del cliente
  api/whatsapp/          Webhook de WhatsApp (aquí entra cada mensaje)
  api/pedidos/accion/    Cambios de estado, cobros, asignación de repartidores
  api/enviar/            Respuesta manual por WhatsApp
  api/probar/            Simulador del agente
  api/seguir/[token]/    Datos para la página de seguimiento
components/              Mapa, chat, datos en tiempo real, simulador
lib/agent.js             🤖 El agente IA: instrucciones y herramientas
lib/whatsapp.js          Envío de mensajes de WhatsApp
supabase/schema.sql      Tablas, seguridad y funciones de la base de datos
supabase/seed.sql        Menú y zonas de ejemplo
```

Para cambiar cómo habla el agente sin tocar código: **Ajustes → Instrucciones extra para el agente IA** (promociones, reglas, etc.).

## 💰 Costos mensuales aproximados

- Supabase, Vercel, mapa: **gratis** al empezar (planes gratuitos).
- IA (Anthropic): se paga por uso; depende de cuántas conversaciones haya. Puedes cambiar `ANTHROPIC_MODEL` a un modelo más económico (por ejemplo, de la familia Haiku) si el volumen crece.
- WhatsApp: Meta cobra por tipo de conversación/mensaje según su tarifa vigente; las respuestas a mensajes del cliente dentro de 24 h suelen tener costo bajo o nulo. Revisa la tabla de precios de Meta para Bolivia.

## 🛠️ Si algo falla

- **"supabaseUrl is required"** → falta `.env.local` o las variables en Vercel.
- **El agente no responde en WhatsApp** → en Vercel → tu proyecto → **Logs**, busca errores de `/api/whatsapp`. Revisa el token (el temporal dura 24 h).
- **El mapa no muestra repartidores** → el repartidor debe tocar "Estoy disponible" y permitir la ubicación en el celular.
- **No me deja entrar ("Cuenta pendiente")** → el admin debe asignarte un rol.

## 🚀 Próximas mejoras sugeridas

- Inventario de insumos con recetas (descontar mozzarella, cajas, etc.).
- Facturación electrónica (SIN).
- Confirmación automática de pagos QR con la API del banco.
- Recibir pedidos de PedidosYa por API (si te dan acceso de partner).
- Campañas por WhatsApp a clientes inactivos (plantillas aprobadas por Meta).

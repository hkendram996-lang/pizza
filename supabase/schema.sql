-- =====================================================================
--  Pizzería IA — esquema de base de datos (Supabase / PostgreSQL)
--  Pega TODO este archivo en Supabase > SQL Editor > New query > Run
-- =====================================================================

-- ---------- Usuarios del panel ----------
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  nombre text,
  email text,
  rol text not null default 'pendiente'
    check (rol in ('pendiente','admin','cajero','cocina','repartidor')),
  created_at timestamptz default now()
);

-- El primer usuario que se registra es administrador; los demás quedan
-- "pendiente" hasta que el administrador les asigne un rol en Ajustes.
create or replace function crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, nombre, email, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    new.email,
    case when (select count(*) from profiles) = 0 then 'admin' else 'pendiente' end
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function crear_perfil();

create or replace function es_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and rol <> 'pendiente');
$$;

create or replace function es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and rol = 'admin');
$$;

-- ---------- Configuración del negocio ----------
create table if not exists settings (
  id int primary key default 1 check (id = 1),
  nombre_negocio text not null default 'Mi Pizzería',
  local_lat double precision not null default -17.7838,
  local_lng double precision not null default -63.1812,
  direccion_local text,
  horario text default 'Todos los días de 11:00 a 23:00',
  comision_app numeric not null default 20,       -- % que cobra la app de delivery
  qr_imagen_url text,                             -- link público a la imagen del QR de cobro
  instrucciones_agente text,                      -- reglas extra para el agente IA
  agente_activo boolean not null default true
);

create table if not exists zones (
  id serial primary key,
  nombre text not null,
  radio_km numeric not null,      -- distancia máxima desde el local
  tarifa numeric not null,
  minutos int not null default 35,
  activo boolean not null default true
);

-- ---------- Catálogo ----------
create table if not exists products (
  id serial primary key,
  nombre text not null,
  categoria text not null default 'Pizzas',
  descripcion text,
  precio numeric not null check (precio >= 0),
  costo numeric not null default 0 check (costo >= 0),
  activo boolean not null default true,
  orden int default 0,
  created_at timestamptz default now()
);

-- ---------- Clientes y conversaciones ----------
create table if not exists customers (
  id serial primary key,
  nombre text,
  telefono text unique,
  direccion text,
  lat double precision,
  lng double precision,
  puntos int not null default 0,
  escalado boolean not null default false,   -- true = lo atiende un humano, el agente no responde
  escalado_motivo text,
  created_at timestamptz default now()
);

create table if not exists messages (
  id bigserial primary key,
  telefono text not null,
  rol text not null check (rol in ('cliente','agente','humano','sistema')),
  texto text not null,
  wa_id text unique,               -- id del mensaje de WhatsApp (evita duplicados)
  created_at timestamptz default now()
);
create index if not exists messages_tel_idx on messages (telefono, created_at desc);

-- ---------- Repartidores ----------
create table if not exists riders (
  id serial primary key,
  nombre text not null,
  telefono text,
  color text not null default '#d6402b',
  user_id uuid references auth.users on delete set null,
  estado text not null default 'desconectado' check (estado in ('libre','ocupado','desconectado')),
  activo boolean not null default true,
  lat double precision,
  lng double precision,
  ubicado_at timestamptz,
  libre_desde timestamptz
);

-- ---------- Pedidos ----------
create table if not exists orders (
  id serial primary key,
  customer_id int references customers on delete set null,
  cliente_nombre text not null default 'Cliente',
  telefono text,
  canal text not null default 'Mostrador',          -- WhatsApp, Web, Instagram, PedidosYa, Mostrador, Teléfono
  tipo text not null default 'mostrador' check (tipo in ('delivery','mostrador')),
  estado text not null default 'nuevo'
    check (estado in ('nuevo','cocina','listo','camino','entregado','cancelado')),
  direccion text,
  lat double precision,
  lng double precision,
  zona_id int references zones on delete set null,
  subtotal numeric not null default 0,
  envio numeric not null default 0,
  total numeric not null default 0,
  metodo_pago text not null default 'Efectivo' check (metodo_pago in ('Efectivo','QR','Tarjeta','App')),
  pagado boolean not null default false,
  pagado_at timestamptz,
  rider_id int references riders on delete set null,
  ia boolean not null default false,
  nota text,
  tracking_token uuid not null default gen_random_uuid(),
  created_at timestamptz default now(),
  cocina_at timestamptz,
  listo_at timestamptz,
  camino_at timestamptz,
  entregado_at timestamptz
);
select setval('orders_id_seq', greatest(1000, (select coalesce(max(id), 0) from orders)));
create index if not exists orders_created_idx on orders (created_at desc);
create index if not exists orders_estado_idx on orders (estado);

create table if not exists order_items (
  id bigserial primary key,
  order_id int not null references orders on delete cascade,
  product_id int references products on delete set null,
  nombre text not null,
  precio numeric not null,
  costo numeric not null default 0,
  cantidad int not null default 1 check (cantidad > 0),
  nota text
);

-- ---------- Caja y finanzas ----------
create table if not exists cash_sessions (
  id serial primary key,
  cajero text not null,
  monto_inicial numeric not null default 0,
  abierta_at timestamptz not null default now(),
  cerrada_at timestamptz,
  esperado numeric,
  monto_contado numeric,
  diferencia numeric
);

create table if not exists cash_movements (
  id bigserial primary key,
  session_id int references cash_sessions on delete set null,
  tipo text not null check (tipo in ('ingreso','egreso')),
  concepto text not null,
  monto numeric not null check (monto >= 0),
  metodo text not null default 'Efectivo',
  order_id int references orders on delete set null,
  created_at timestamptz default now()
);

create table if not exists expenses (
  id serial primary key,
  categoria text not null,
  descripcion text,
  monto numeric not null check (monto >= 0),
  fecha date not null default current_date
);

-- =====================================================================
--  Funciones de negocio (solo las llama el servidor con la clave secreta)
-- =====================================================================

-- Distancia en km entre dos puntos
create or replace function distancia_km(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns float8 language sql immutable as $$
  select 6371 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- Zona de envío que corresponde a una ubicación
create or replace function zona_para(p_lat float8, p_lng float8)
returns setof zones language sql stable as $$
  select z.* from zones z, settings s
  where s.id = 1 and z.activo
    and distancia_km(s.local_lat, s.local_lng, p_lat, p_lng) <= z.radio_km
  order by z.radio_km
  limit 1;
$$;

-- Fechas automáticas al cambiar de estado
create or replace function orders_timestamps() returns trigger language plpgsql as $$
begin
  if new.estado is distinct from old.estado then
    if new.estado = 'cocina' then new.cocina_at := now();
    elsif new.estado = 'listo' then new.listo_at := now();
    elsif new.estado = 'camino' then new.camino_at := now();
    elsif new.estado = 'entregado' then new.entregado_at := now();
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_orders_ts on orders;
create trigger trg_orders_ts before update on orders
  for each row execute function orders_timestamps();

-- Crea un pedido calculando precios y envío desde la base (nunca confía en el cliente)
create or replace function crear_pedido(p jsonb) returns orders
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  it jsonb;
  pr products;
  z zones;
  cant int;
  sub numeric := 0;
  env numeric := 0;
begin
  insert into orders (cliente_nombre, telefono, customer_id, canal, tipo, direccion, lat, lng,
                      metodo_pago, ia, nota, estado, cocina_at)
  values (
    coalesce(nullif(p->>'cliente_nombre', ''), 'Cliente'),
    p->>'telefono',
    (p->>'customer_id')::int,
    coalesce(p->>'canal', 'Mostrador'),
    coalesce(p->>'tipo', 'mostrador'),
    p->>'direccion',
    (p->>'lat')::float8,
    (p->>'lng')::float8,
    coalesce(p->>'metodo_pago', 'Efectivo'),
    coalesce((p->>'ia')::boolean, false),
    p->>'nota',
    coalesce(p->>'estado', 'nuevo'),
    case when coalesce(p->>'estado', 'nuevo') = 'cocina' then now() end
  ) returning * into o;

  for it in select * from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) loop
    select * into pr from products where id = (it->>'producto_id')::int and activo;
    if not found then
      raise exception 'El producto % no existe o no está disponible', it->>'producto_id';
    end if;
    cant := greatest(1, coalesce((it->>'cantidad')::int, 1));
    insert into order_items (order_id, product_id, nombre, precio, costo, cantidad, nota)
    values (o.id, pr.id, pr.nombre, pr.precio, pr.costo, cant, it->>'nota');
    sub := sub + pr.precio * cant;
  end loop;

  if sub = 0 then raise exception 'El pedido no tiene productos'; end if;

  if o.tipo = 'delivery' then
    if o.lat is null or o.lng is null then
      raise exception 'Falta la ubicación de entrega';
    end if;
    select * into z from zona_para(o.lat, o.lng);
    if z.id is null then raise exception 'La dirección está fuera de la zona de cobertura'; end if;
    env := z.tarifa;
  end if;

  update orders set subtotal = sub, envio = env, total = sub + env, zona_id = z.id
  where id = o.id returning * into o;
  return o;
end $$;

-- Registra el cobro de un pedido en la caja abierta
create or replace function registrar_cobro(p_order int) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  s_id int;
begin
  select * into o from orders where id = p_order for update;
  if not found or o.pagado then return; end if;
  select id into s_id from cash_sessions where cerrada_at is null order by abierta_at desc limit 1;
  update orders set pagado = true, pagado_at = now() where id = p_order;
  insert into cash_movements (session_id, tipo, concepto, monto, metodo, order_id)
  values (s_id, 'ingreso', 'Pedido #' || p_order, o.total, o.metodo_pago, p_order);
  if o.customer_id is not null then
    update customers set puntos = puntos + floor(o.total / 10) where id = o.customer_id;
  end if;
end $$;

-- Asigna pedidos listos a repartidores libres (el que lleva más tiempo libre primero)
create or replace function asignar_pedidos() returns setof int
language plpgsql security definer set search_path = public as $$
declare
  o record;
  r_id int;
begin
  for o in
    select id from orders
    where estado = 'listo' and tipo = 'delivery' and rider_id is null
    order by listo_at nulls last, id
    for update skip locked
  loop
    select id into r_id from riders
    where estado = 'libre' and activo
    order by libre_desde nulls first
    limit 1 for update skip locked;
    exit when r_id is null;
    update riders set estado = 'ocupado' where id = r_id;
    update orders set estado = 'camino', rider_id = r_id where id = o.id;
    return next o.id;
    r_id := null;
  end loop;
end $$;

-- Cierra una entrega: marca entregado, cobra si era efectivo y libera al repartidor
create or replace function finalizar_entrega(p_order int) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders;
begin
  select * into o from orders where id = p_order for update;
  if not found or o.estado in ('entregado','cancelado') then return; end if;
  update orders set estado = 'entregado' where id = p_order;
  perform registrar_cobro(p_order);
  if o.rider_id is not null then
    update riders set estado = 'libre', libre_desde = now() where id = o.rider_id;
  end if;
end $$;

-- Estas funciones solo las usa el servidor (clave service_role)
revoke all on function crear_pedido(jsonb), registrar_cobro(int), asignar_pedidos(), finalizar_entrega(int)
  from public, anon, authenticated;
grant execute on function crear_pedido(jsonb), registrar_cobro(int), asignar_pedidos(), finalizar_entrega(int)
  to service_role;

-- =====================================================================
--  Seguridad: solo el personal aprobado puede leer y escribir
-- =====================================================================
alter table profiles enable row level security;
alter table settings enable row level security;
alter table zones enable row level security;
alter table products enable row level security;
alter table customers enable row level security;
alter table messages enable row level security;
alter table riders enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table cash_sessions enable row level security;
alter table cash_movements enable row level security;
alter table expenses enable row level security;

drop policy if exists "perfil propio" on profiles;
create policy "perfil propio" on profiles for select to authenticated
  using (id = auth.uid() or es_admin());
drop policy if exists "admin gestiona perfiles" on profiles;
create policy "admin gestiona perfiles" on profiles for update to authenticated
  using (es_admin()) with check (es_admin());

do $$
declare t text;
begin
  foreach t in array array['settings','zones','products','customers','messages','riders',
                           'orders','order_items','cash_sessions','cash_movements','expenses']
  loop
    execute format('drop policy if exists "personal" on %I', t);
    execute format('create policy "personal" on %I for all to authenticated using (es_staff()) with check (es_staff())', t);
  end loop;
end $$;

-- =====================================================================
--  Tiempo real (el panel se actualiza solo)
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['orders','order_items','riders','products','cash_movements',
                           'cash_sessions','messages','customers','zones','settings']
  loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

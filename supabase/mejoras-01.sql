-- =====================================================================
--  Mejoras 01 · Origen del pedido, modificadores y cierre de caja
--  Pega TODO este archivo en Supabase > SQL Editor > New query > Run
--  (se puede ejecutar más de una vez sin romper nada)
-- =====================================================================

-- ---------- 1) Origen del pedido ----------
-- El origen se guarda en orders.canal (WhatsApp, Salón, Para llevar, Mostrador, PedidosYa...)
-- y ahora también el número de mesa cuando es en el salón.
alter table orders add column if not exists mesa text;

-- ---------- 2) Modificadores (borde, extras, "sin cebolla"...) ----------
create table if not exists modifiers (
  id serial primary key,
  grupo text not null default 'Extras',          -- Borde, Extras, Sin...
  nombre text not null,
  precio numeric not null default 0 check (precio >= 0),
  costo numeric not null default 0 check (costo >= 0),
  categoria text,                                -- vacío = sirve para todos los productos
  activo boolean not null default true,
  orden int default 0,
  created_at timestamptz default now()
);
alter table order_items add column if not exists extras jsonb not null default '[]'::jsonb;

alter table modifiers enable row level security;
drop policy if exists "personal" on modifiers;
create policy "personal" on modifiers for all to authenticated using (es_staff()) with check (es_staff());

do $$ begin
  alter publication supabase_realtime add table modifiers;
exception when duplicate_object then null;
end $$;

-- Ejemplos (precios ficticios: cámbialos en Catálogo > Modificadores). Solo si la tabla está vacía.
insert into modifiers (grupo, nombre, precio, costo, categoria, orden)
select * from (values
  ('Borde',  'Borde relleno de queso', 12, 5, 'Pizzas', 1),
  ('Extras', 'Extra queso',             8, 4, 'Pizzas', 2),
  ('Extras', 'Extra hongos',            6, 3, 'Pizzas', 3),
  ('Sin',    'Sin cebolla',             0, 0, 'Pizzas', 10),
  ('Sin',    'Sin aceitunas',           0, 0, 'Pizzas', 11),
  ('Sin',    'Sin picante',             0, 0, 'Pizzas', 12)
) as v(grupo, nombre, precio, costo, categoria, orden)
where not exists (select 1 from modifiers);

-- ---------- 3) Cierre de caja más completo ----------
alter table cash_sessions add column if not exists conteo jsonb;        -- billetes y monedas contados
alter table cash_sessions add column if not exists qr_banco numeric;    -- lo que muestra el banco por QR
alter table cash_sessions add column if not exists tarjeta_banco numeric;
alter table cash_sessions add column if not exists resumen jsonb;       -- ventas por método y por origen
alter table cash_sessions add column if not exists observaciones text;
alter table cash_sessions add column if not exists cerrada_por text;

-- ---------- Crear pedido: ahora con mesa y modificadores ----------
-- El precio de los extras SIEMPRE se calcula aquí, desde la base (nunca se confía en el navegador ni en la IA)
create or replace function crear_pedido(p jsonb) returns orders
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  it jsonb;
  pr products;
  m modifiers;
  cant int;
  sub numeric := 0;
  env numeric := 0;
  z zones;
  ids int[];
  ex jsonb;
  ex_precio numeric;
  ex_costo numeric;
  encontrados int;
begin
  insert into orders (cliente_nombre, telefono, customer_id, canal, tipo, direccion, lat, lng,
                      metodo_pago, ia, nota, estado, cocina_at, mesa)
  values (
    coalesce(nullif(p->>'cliente_nombre', ''), 'Cliente'),
    p->>'telefono',
    (p->>'customer_id')::int,
    coalesce(nullif(p->>'canal', ''), 'Mostrador'),
    coalesce(p->>'tipo', 'mostrador'),
    p->>'direccion',
    (p->>'lat')::float8,
    (p->>'lng')::float8,
    coalesce(p->>'metodo_pago', 'Efectivo'),
    coalesce((p->>'ia')::boolean, false),
    p->>'nota',
    coalesce(p->>'estado', 'nuevo'),
    case when coalesce(p->>'estado', 'nuevo') = 'cocina' then now() end,
    nullif(p->>'mesa', '')
  ) returning * into o;

  for it in select * from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) loop
    select * into pr from products where id = (it->>'producto_id')::int and activo;
    if not found then
      raise exception 'El producto % no existe o no está disponible', it->>'producto_id';
    end if;
    cant := greatest(1, coalesce((it->>'cantidad')::int, 1));

    -- Modificadores elegidos
    ex := '[]'::jsonb; ex_precio := 0; ex_costo := 0;
    select coalesce(array_agg(distinct x::int), '{}') into ids
      from jsonb_array_elements_text(case when jsonb_typeof(it->'extras') = 'array' then it->'extras' else '[]'::jsonb end) x;
    encontrados := 0;
    for m in select * from modifiers where id = any(ids) order by orden, id loop
      if not m.activo or (m.categoria is not null and m.categoria <> pr.categoria) then
        raise exception '"%" no está disponible para %', m.nombre, pr.nombre;
      end if;
      ex := ex || jsonb_build_array(jsonb_build_object('id', m.id, 'grupo', m.grupo, 'nombre', m.nombre, 'precio', m.precio));
      ex_precio := ex_precio + m.precio;
      ex_costo := ex_costo + m.costo;
      encontrados := encontrados + 1;
    end loop;
    if encontrados < coalesce(array_length(ids, 1), 0) then
      raise exception 'Uno de los extras elegidos para % no existe', pr.nombre;
    end if;

    insert into order_items (order_id, product_id, nombre, precio, costo, cantidad, nota, extras)
    values (o.id, pr.id, pr.nombre, pr.precio + ex_precio, pr.costo + ex_costo, cant, nullif(it->>'nota', ''), ex);
    sub := sub + (pr.precio + ex_precio) * cant;
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

revoke all on function crear_pedido(jsonb) from public, anon, authenticated;
grant execute on function crear_pedido(jsonb) to service_role;

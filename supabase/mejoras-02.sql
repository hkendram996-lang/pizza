-- =====================================================================
--  Mejoras 02 · App del mozo
--  Pega TODO este archivo en Supabase > SQL Editor > New query > Run
--  (se puede ejecutar más de una vez sin romper nada)
-- =====================================================================

-- Nuevo rol "mozo"
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.profiles'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%rol%'
  loop
    execute format('alter table profiles drop constraint %I', c);
  end loop;
  alter table profiles add constraint profiles_rol_check
    check (rol in ('pendiente','admin','cajero','cocina','repartidor','mozo'));
end $$;

-- Quién tomó el pedido de la mesa
alter table orders add column if not exists mozo text;
create index if not exists orders_mesa_idx on orders (mesa) where pagado = false;

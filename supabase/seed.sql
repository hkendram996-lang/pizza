-- =====================================================================
--  Datos iniciales de ejemplo. Ejecútalo DESPUÉS de schema.sql.
--  Luego cambia todo desde el panel (Catálogo y Ajustes).
-- =====================================================================

insert into settings (id, nombre_negocio, local_lat, local_lng, direccion_local, horario)
values (1, 'Mi Pizzería', -17.7838, -63.1812, 'Santa Cruz de la Sierra', 'Todos los días de 11:00 a 23:00')
on conflict (id) do nothing;

insert into zones (nombre, radio_km, tarifa, minutos) values
  ('Cerca (hasta 2 km)', 2, 7, 25),
  ('Media (2 a 4 km)', 4, 10, 35),
  ('Lejos (4 a 6 km)', 6, 13, 45),
  ('Muy lejos (6 a 9 km)', 9, 16, 55);

insert into products (nombre, categoria, descripcion, precio, costo, orden) values
  ('Pepperoni familiar', 'Pizzas', 'Salsa de tomate, mozzarella y pepperoni. 8 porciones', 95, 32, 1),
  ('Pepperoni mediana', 'Pizzas', 'Salsa de tomate, mozzarella y pepperoni. 6 porciones', 65, 22, 2),
  ('Hawaiana familiar', 'Pizzas', 'Jamón, piña y mozzarella. 8 porciones', 98, 34, 3),
  ('4 Quesos familiar', 'Pizzas', 'Mozzarella, parmesano, roquefort y queso criollo. 8 porciones', 105, 41, 4),
  ('Margarita familiar', 'Pizzas', 'Tomate, mozzarella y albahaca. 8 porciones', 85, 27, 5),
  ('Cruceña familiar', 'Pizzas', 'Chorizo, choclo, locoto y queso. 8 porciones', 110, 39, 6),
  ('Vegetariana mediana', 'Pizzas', 'Pimentón, champiñones, cebolla y aceitunas. 6 porciones', 62, 21, 7),
  ('Combo 2 medianas + Coca 2L', 'Combos', 'Dos pizzas medianas a elección (pepperoni, margarita o vegetariana) y Coca-Cola 2L', 120, 54, 10),
  ('Combo familiar + pan de ajo', 'Combos', 'Una pizza familiar clásica y pan de ajo', 115, 40, 11),
  ('Coca-Cola 2L', 'Bebidas', null, 18, 10, 20),
  ('Jugo natural 1L', 'Bebidas', 'Maracuyá o naranja', 20, 8, 21),
  ('Cerveza 1L', 'Bebidas', 'Solo para mayores de 18 años', 22, 13, 22),
  ('Pan de ajo', 'Extras', '6 unidades', 25, 7, 30),
  ('Brownie', 'Postres', 'Brownie de chocolate', 20, 6, 40);

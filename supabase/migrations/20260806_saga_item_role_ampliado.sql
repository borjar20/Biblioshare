-- Fase 5 del timeline con los cuatro estados (spec 2026-07-28, §4): el
-- vocabulario de roles narrativos se amplía con los tres que faltaban.
--
-- Esta migración SOLO añade. Retirar `paralela` va aparte
-- (20260807_saga_item_role_sin_paralela.sql) porque es la dirección peligrosa:
-- el bundle desplegado sigue ofreciendo «Paralela» en el <select> del editor de
-- secuencia, y guardarlo con el valor ya retirado reventaría el cast de
-- save_saga_sequence con un 22P02 en la cara del curador. Mismo baile que la
-- sobrecarga del RPC en las fases 2b y 4 (#217, #224).
--
-- Dos nombres que no salen del mockup tal cual, y por qué:
--  · el `nexo` del mockup se llama aquí `crossover`: «nexo» ya nombra en este
--    producto el grupo de miembros directos del universo (groupSagaId is null),
--    y usarlo como rol dejaría dos «nexos» distintos en la misma pantalla.
--  · `principal` NO se añade: es exactamente lo que hoy es role = null, y darle
--    un valor propio serían dos formas de decir lo mismo — la familia del #91
--    en pequeño.
alter type public.saga_item_role add value if not exists 'novela_corta';
alter type public.saga_item_role add value if not exists 'companero';
alter type public.saga_item_role add value if not exists 'crossover';

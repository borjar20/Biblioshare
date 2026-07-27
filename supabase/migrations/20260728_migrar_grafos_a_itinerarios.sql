-- Task 5 (fase 3, issue de rescate del grafo): migra a `saga_routes` lo único
-- que `saga_nodes`/`saga_edges` sabían y el modelo nuevo no, antes de que la
-- Task 7 borre esas dos tablas. Medido contra producción el 2026-07-27.
--
-- QUÉ MIGRA (dos itinerarios, uno por saga):
--   - Cosmere (19 pasos): sus 19 nodos YA tenían `order_no` (1..19) — es una
--     lista, se copia tal cual. El nodo sin `order_no` (Arcanum Ilimitado, un
--     recopilatorio de relatos) NO entra: nunca tuvo hueco en el orden
--     principal, y una posición inventada sería una mentira de curación.
--   - Mundodisco (26 pasos): 0 de sus 26 nodos tenía `order_no`; el orden salió
--     de linealizar sus 28 `saga_edges` con `linearizeGraph`
--     (src/lib/sagas/linearize-graph.ts, Kahn con desempate determinista:
--     hilo que se estaba leyendo > nombre de hilo > posición dentro del hilo).
--     El "hilo" de cada nodo es la sub-saga curada a la que pertenece en
--     `saga_items` (Mundodisco: La Saga de la Muerte/de los Guardias/de los
--     Magos, Revolución Industrial, Húmedo Von Mustachen), y la "posición
--     dentro del hilo" es su `saga_items.position` en esa sub-saga — la MISMA
--     fuente que ya usa la curación de hoy, no un dato nuevo. El resultado
--     completo, con títulos y el juicio de lectura sobre si es un orden
--     recomendable, está en .superpowers/sdd/task-5-report.md.
--
-- QUÉ NO MIGRA:
--   - Trono de Cristal: sus 8 nodos ya tienen `order_no`, y coincide 1:1 con
--     `saga_items.position` de su sub-saga curada (empate del hueco 6
--     incluido: dos nodos con order_no=6, dos ítems con position=6).
--     Materializar una ruta ahí sería una segunda fuente de verdad idéntica a
--     la que ya existe — exactamente el riesgo que el comentario de
--     `saga_routes` (20260723_saga_routes.sql) documenta para las rutas
--     sintéticas.
--   - Maasverse: un único nodo, y sin `order_no` — no hay orden que rescatar
--     (un itinerario de 1 paso no dice nada que la ficha no diga ya).
--
-- Los `item_id` y posiciones de abajo son LITERALES (calculados en TypeScript
-- puro, no en SQL) para que la migración sea revisable sin volver a ejecutar
-- nada. Los slugs no son `lectura` ni `publicacion`: esos dos están
-- reservados por el CHECK `saga_routes_slug_not_reserved` para las rutas
-- sintéticas que ya sintetiza el código.
--
-- REVERSIÓN: borrar la fila de `saga_routes` de cada saga (`saga_route_entries`
-- cuelga de `route_id` con `on delete cascade`, así que sus pasos se van solos).

insert into public.saga_routes (id, saga_id, slug, name, summary, position) values
  (
    '7382f21f-5d9a-460d-9f81-631b60d84e59',
    'ba761e54-ab39-49cd-865c-97bf6ef74d47', -- Cosmere
    'orden-recomendado',
    'Orden recomendado',
    'El orden de publicación curado para todo el Cosmere. Arcanum Ilimitado (recopilatorio de relatos) queda fuera: nunca tuvo un hueco fijo en el orden principal.',
    0
  ),
  (
    '8f28ec27-76d2-49b3-8a58-2366a02e557d',
    'd4c9eb7d-2de8-459b-a8d0-d2785d406c3e', -- Mundodisco
    'orden-recomendado',
    'Orden recomendado',
    'Lee cada sub-serie casi de un tirón (Muerte, Guardia, Magos, Revolución Industrial, Húmedo Von Mustachen), con los cruces entre ellas en su sitio.',
    0
  );

-- Cosmere (19 pasos = sus 19 nodos con order_no, copiados tal cual).
insert into public.saga_route_entries (route_id, position, item_type, item_id) values
  ('7382f21f-5d9a-460d-9f81-631b60d84e59', 1,  'book'::public.item_type, '61aadac9-686d-4f66-9bfd-206193384b3a'), -- Elantris
  ('7382f21f-5d9a-460d-9f81-631b60d84e59', 2,  'book'::public.item_type, '19a64aeb-ebf5-4b2d-8b06-29c741723597'), -- El Imperio Final
  ('7382f21f-5d9a-460d-9f81-631b60d84e59', 3,  'book'::public.item_type, '3cb37864-a798-4eb7-90a2-27ddc3541409'), -- El Pozo de la Ascensión
  ('7382f21f-5d9a-460d-9f81-631b60d84e59', 4,  'book'::public.item_type, '0dfc164f-0544-48ab-9058-7d283f2890b7'), -- El Héroe de las Eras
  ('7382f21f-5d9a-460d-9f81-631b60d84e59', 5,  'book'::public.item_type, '847557bf-fbeb-4201-9e64-1d11e7aa19bc'), -- El Aliento de los Dioses
  ('7382f21f-5d9a-460d-9f81-631b60d84e59', 6,  'book'::public.item_type, '74af1685-94d7-47c4-8255-2d45d4961210'), -- El Camino de los Reyes
  ('7382f21f-5d9a-460d-9f81-631b60d84e59', 7,  'book'::public.item_type, '2951939b-560c-4daf-8c34-6bc0f88f0420'), -- Palabras Radiantes
  ('7382f21f-5d9a-460d-9f81-631b60d84e59', 8,  'book'::public.item_type, 'b7b12564-8c76-4b84-98b0-f1d204e09b0f'), -- Juramentada
  ('7382f21f-5d9a-460d-9f81-631b60d84e59', 9,  'book'::public.item_type, 'd10304eb-c9ea-4616-9600-08c6210c5c34'), -- Esquirla del Amanecer
  ('7382f21f-5d9a-460d-9f81-631b60d84e59', 10, 'book'::public.item_type, '19c19375-e3bf-4e8f-bab4-a50326f953db'), -- El Ritmo de la Guerra
  ('7382f21f-5d9a-460d-9f81-631b60d84e59', 11, 'book'::public.item_type, 'c0e98d8e-2a9b-416e-ae56-94354ae0d918'), -- Aleación de Ley
  ('7382f21f-5d9a-460d-9f81-631b60d84e59', 12, 'book'::public.item_type, 'd9ecf29e-8eac-4b7f-adc4-54c0c596a796'), -- Sombras de Identidad
  ('7382f21f-5d9a-460d-9f81-631b60d84e59', 13, 'book'::public.item_type, 'c7aa662d-bcff-4a65-bc49-af7fc73a87bb'), -- Brazales de Duelo
  ('7382f21f-5d9a-460d-9f81-631b60d84e59', 14, 'book'::public.item_type, 'b3b618bf-0740-45c6-9c40-8c4afca15a2b'), -- El Metal Perdido
  ('7382f21f-5d9a-460d-9f81-631b60d84e59', 15, 'book'::public.item_type, 'b4e175f0-b7dd-4d7f-9112-f1f682986d6f'), -- El Hombre Iluminado
  ('7382f21f-5d9a-460d-9f81-631b60d84e59', 16, 'book'::public.item_type, '07c53f5c-3de4-4347-80a9-10b31fefff6e'), -- Viento y Verdad
  ('7382f21f-5d9a-460d-9f81-631b60d84e59', 17, 'book'::public.item_type, 'e281e067-766b-4b86-9e06-70db7c052693'), -- Trenza del Mar Esmeralda
  ('7382f21f-5d9a-460d-9f81-631b60d84e59', 18, 'book'::public.item_type, '92e59f00-e937-47bf-9bb2-db89c25afc1a'), -- Islas de la Acuaoscura
  ('7382f21f-5d9a-460d-9f81-631b60d84e59', 19, 'book'::public.item_type, '42ae2eae-92ae-4872-ac3e-f5fc6a7eb174'); -- Yumi y el Pintor de Pesadillas

-- Mundodisco (26 pasos = linearizeGraph(nodes, edges); ver cabecera y el informe).
insert into public.saga_route_entries (route_id, position, item_type, item_id) values
  ('8f28ec27-76d2-49b3-8a58-2366a02e557d', 1,  'book'::public.item_type, '7424ef83-9d32-4efc-993b-efa0b41c640e'), -- Mort
  ('8f28ec27-76d2-49b3-8a58-2366a02e557d', 2,  'book'::public.item_type, 'c9c1276d-d487-43e3-9662-28d1221996e1'), -- El Segador
  ('8f28ec27-76d2-49b3-8a58-2366a02e557d', 3,  'book'::public.item_type, '88bbd6eb-3e8c-4109-9a4d-7b974dd0a8ff'), -- Soul Music
  ('8f28ec27-76d2-49b3-8a58-2366a02e557d', 4,  'book'::public.item_type, '66e98083-7d66-41fe-87bb-08ed861033e6'), -- Papá Puerco
  ('8f28ec27-76d2-49b3-8a58-2366a02e557d', 5,  'book'::public.item_type, '0da2cbfe-0bd4-4138-a83c-2bc6837e76ff'), -- Ladrón del Tiempo
  ('8f28ec27-76d2-49b3-8a58-2366a02e557d', 6,  'book'::public.item_type, '02f4c1cc-a84d-4cbf-b90d-4f8b76316fec'), -- ¡Guardias! ¡Guardias!
  ('8f28ec27-76d2-49b3-8a58-2366a02e557d', 7,  'book'::public.item_type, 'fd35f677-2173-4d6d-abf4-d0119ad5d540'), -- Hombres de Armas
  ('8f28ec27-76d2-49b3-8a58-2366a02e557d', 8,  'book'::public.item_type, 'c78e0ee2-be82-4652-8d01-9bd5fa6163f2'), -- Pies de Barro
  ('8f28ec27-76d2-49b3-8a58-2366a02e557d', 9,  'book'::public.item_type, 'f6623556-14eb-47e6-be97-bb28b0bc61f2'), -- ¡Voto a Bríos!
  ('8f28ec27-76d2-49b3-8a58-2366a02e557d', 10, 'book'::public.item_type, 'c2fa6d43-c168-46ed-ba7f-03e2220215cf'), -- El Quinto Elefante
  ('8f28ec27-76d2-49b3-8a58-2366a02e557d', 11, 'book'::public.item_type, '42216405-ecb7-4f2b-bfdf-542d997d9017'), -- Ronda de Noche
  ('8f28ec27-76d2-49b3-8a58-2366a02e557d', 12, 'book'::public.item_type, 'c6627765-3a53-4d45-af6b-111b37ad0a2d'), -- ¡Zas!
  ('8f28ec27-76d2-49b3-8a58-2366a02e557d', 13, 'book'::public.item_type, 'c03629dc-09d5-43d9-9de1-4bb2b24faea1'), -- Snuff
  ('8f28ec27-76d2-49b3-8a58-2366a02e557d', 14, 'book'::public.item_type, 'd72c6241-54af-43ab-8421-07a570f59f02'), -- El Color de la Magia
  ('8f28ec27-76d2-49b3-8a58-2366a02e557d', 15, 'book'::public.item_type, '43b8afff-8d60-4296-a983-708f7f7de865'), -- La Luz Fantástica
  ('8f28ec27-76d2-49b3-8a58-2366a02e557d', 16, 'book'::public.item_type, 'a297fc3e-174d-42f0-b818-5b171cedc34c'), -- Rechicero
  ('8f28ec27-76d2-49b3-8a58-2366a02e557d', 17, 'book'::public.item_type, '1abbd99e-4ff1-4f20-8c3b-2f572921cc14'), -- Eric
  ('8f28ec27-76d2-49b3-8a58-2366a02e557d', 18, 'book'::public.item_type, '8112fbb5-22d1-403a-946f-3966961b1fbd'), -- Imágenes en Acción
  ('8f28ec27-76d2-49b3-8a58-2366a02e557d', 19, 'book'::public.item_type, 'e2d29f56-aa6b-4acf-a7f4-8ab61661cfa8'), -- Tiempos Interesantes
  ('8f28ec27-76d2-49b3-8a58-2366a02e557d', 20, 'book'::public.item_type, 'bc49c496-8514-4da3-ba5f-445da96d4f5f'), -- El País del Fin del Mundo
  ('8f28ec27-76d2-49b3-8a58-2366a02e557d', 21, 'book'::public.item_type, '2614e7cf-ba19-4456-b50b-e389c75d98e8'), -- El Atlético Invisible
  ('8f28ec27-76d2-49b3-8a58-2366a02e557d', 22, 'book'::public.item_type, '8019f809-6b4c-4a95-bc92-097ecbfcdb3f'), -- La Verdad
  ('8f28ec27-76d2-49b3-8a58-2366a02e557d', 23, 'book'::public.item_type, '67bae9a8-45ff-471e-8b04-529e1569203c'), -- Regimiento Monstruoso
  ('8f28ec27-76d2-49b3-8a58-2366a02e557d', 24, 'book'::public.item_type, 'cea01c73-fffd-4d30-b9ab-30a2abd39bd7'), -- Cartas en el Asunto
  ('8f28ec27-76d2-49b3-8a58-2366a02e557d', 25, 'book'::public.item_type, 'fbe19dea-83db-4909-b044-785440255734'), -- Dinero a Mansalva
  ('8f28ec27-76d2-49b3-8a58-2366a02e557d', 26, 'book'::public.item_type, '7f8fac1e-137c-463e-b56c-3ed763ef7da9'); -- A Todo Vapor

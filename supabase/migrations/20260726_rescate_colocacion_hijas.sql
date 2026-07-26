-- supabase/migrations/20260726_rescate_colocacion_hijas.sql
--
-- La fase 1 dejó a propósito sin `position_in_parent` a las sagas hijas cuyo
-- padre tiene grafo: allí la colocación no se deduce de min(position) sino de
-- `saga_nodes.order_no`, y escribir un número deducido habría sido inventar
-- curación. Al retirar el editor de grafo (fase 2a) esa columna se queda sin
-- escritor, así que aquí se rescata el dato al sitio donde ahora vive.
--
-- Las hijas cuyo nodo NO tiene `order_no` se quedan SIN CLASIFICAR a propósito:
-- ningún nodo de Mundodisco tiene order_no (su orden vive solo en 28 aristas),
-- que es el origen del 0/0 que arregló la fase 1. Derivarles un número de las
-- aristas y presentarlo como curado sería exactamente el error que este diseño
-- viene a deshacer; caen en la zona 3 del editor de su padre y las coloca una
-- persona.
update sagas s
   set position_in_parent = n.order_no,
       placement_in_parent = 'fijo'
  from saga_nodes n
 where n.child_saga_id = s.id
   and n.saga_id = s.parent_saga_id
   and n.order_no is not null
   and s.position_in_parent is null;

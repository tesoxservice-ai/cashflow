-- Pasar de "Gastos Generales" a "Otros Gastos Operativos" los movimientos que quedaron con el rubro equivocado.
--
-- Por qué: Gastos Generales es el 13% de las ventas (administración de obra): no se factura y no viene en la
-- planilla de proyección de pagos. Hasta ahora el importador cargaba ALQ SEG HYS OTROS GASTOS (alquileres,
-- seguros, higiene y seguridad) como Gastos Generales, y también hubo cajas chicas y servicios cargados así.
-- Según Operaciones todo eso es "Otros Gastos Operativos". El importador ya está corregido; este script
-- corrige lo cargado antes.
--
-- Qué toca: SOLO la columna rubro de los movimientos (facturas, cajas chicas, débitos) que hoy tienen rubro
-- Gastos Generales. No toca importes, fechas, estados, presupuestos ni ventas. No cambia ningún saldo del Cash
-- Flow (mueve unos $ 0,5 M de gasto proyectado, solo porque esas facturas pasan a descontar de Otros Gastos Operativos).
--
-- Cuando lo analicé (11/11/2026) eran 63 movimientos por $ 112.537.950,13. Si hoy da otra cantidad (porque se
-- cargó algo nuevo con ese rubro), el PASO 3 se frena solo sin tocar nada: avisame y lo revisamos.
--
-- Correr en el proyecto de la app (wfiunzglndquuygenepp). Correr los PASOS 1, 2 y 3 en ese orden, de a uno
-- (seleccionar el bloque y Run).

-- ═════════════════════════════════════════════════════════════════════════════
-- PASO 1 — RESPALDO (no cambia nada). Guarda una copia de lo que se va a modificar.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.movimientos_respaldo_retag_gg_20261111 AS
SELECT m.*
FROM public.movimientos m
JOIN public.rubros r ON r.id = m.rubro_id
WHERE r.nombre = 'Gastos Generales';

-- Sin políticas: nadie puede leerla por la API de la app, solo desde este editor.
ALTER TABLE public.movimientos_respaldo_retag_gg_20261111 ENABLE ROW LEVEL SECURITY;

-- Control: tienen que salir 63 filas y 112537950.13
SELECT count(*) AS filas_respaldadas, sum(monto_bruto) AS monto_respaldado
FROM public.movimientos_respaldo_retag_gg_20261111;


-- ═════════════════════════════════════════════════════════════════════════════
-- PASO 2 — VISTA PREVIA (no cambia nada). Revisá qué se va a pasar de rubro.
-- ═════════════════════════════════════════════════════════════════════════════
SELECT m.categoria, m.estado, count(*) AS movimientos, sum(m.monto_bruto) AS monto
FROM public.movimientos m
JOIN public.rubros r ON r.id = m.rubro_id
WHERE r.nombre = 'Gastos Generales'
GROUP BY m.categoria, m.estado
ORDER BY m.categoria, m.estado;


-- ═════════════════════════════════════════════════════════════════════════════
-- PASO 3 — CAMBIO. Se frena solo (sin cambiar nada) si lo que encuentra no coincide con el respaldo.
-- ═════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_gg    uuid;
  v_ogo   uuid;
  v_resp  int;
  v_hoy   int;
  v_mov   int;
BEGIN
  SELECT id INTO v_gg  FROM public.rubros WHERE nombre = 'Gastos Generales';
  SELECT id INTO v_ogo FROM public.rubros WHERE nombre = 'Otros Gastos Operativos';
  IF v_gg IS NULL OR v_ogo IS NULL THEN
    RAISE EXCEPTION 'No encontré uno de los dos rubros. No se cambió nada.';
  END IF;

  SELECT count(*) INTO v_resp FROM public.movimientos_respaldo_retag_gg_20261111;
  SELECT count(*) INTO v_hoy  FROM public.movimientos WHERE rubro_id = v_gg;
  IF v_resp <> 63 OR v_hoy <> v_resp THEN
    RAISE EXCEPTION 'Hoy hay % movimientos con rubro Gastos Generales y el respaldo tiene % (se esperaban 63). No se cambió nada.', v_hoy, v_resp;
  END IF;

  UPDATE public.movimientos
  SET rubro_id = v_ogo
  WHERE id IN (SELECT id FROM public.movimientos_respaldo_retag_gg_20261111)
    AND rubro_id = v_gg;
  GET DIAGNOSTICS v_mov = ROW_COUNT;

  IF v_mov <> 63 THEN
    RAISE EXCEPTION 'Se esperaba cambiar 63 movimientos y fueron %. Se deshace todo.', v_mov;
  END IF;
  RAISE NOTICE 'Listo: 63 movimientos pasaron de Gastos Generales a Otros Gastos Operativos.';
END $$;

-- Verificación: no tiene que quedar ningún movimiento con rubro Gastos Generales (debe dar 0)
SELECT count(*) AS deberia_dar_0
FROM public.movimientos m
JOIN public.rubros r ON r.id = m.rubro_id
WHERE r.nombre = 'Gastos Generales';

-- DESHACER (solo si hiciera falta volver atrás):
-- UPDATE public.movimientos m
-- SET rubro_id = b.rubro_id
-- FROM public.movimientos_respaldo_retag_gg_20261111 b
-- WHERE m.id = b.id;

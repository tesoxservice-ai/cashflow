-- Borrar presupuestos de Operaciones de 3 rubros, desde octubre 2026 en adelante.
--
-- Rubros:  MO directa con Carg Sociales · Mano de obra indirecta con cargas · Impuestos
-- Períodos: 2026-10-01 en adelante (octubre 2026 → enero 2027 hoy). El historial anterior NO se toca.
--
-- Cuando lo analicé (20/10/2026) eran 87 líneas, $ 647.551.557,65, en 17 obras.
-- Quedan 1.002 líneas (de 1.089).
--
-- Correr en el proyecto de la app (wfiunzglndquuygenepp), NO en otro.
-- Correr los PASOS 1, 2 y 3 en ese orden, de a uno (seleccionar el bloque y Run).

-- ═════════════════════════════════════════════════════════════════════════════
-- PASO 1 — RESPALDO (no borra nada). Guarda una copia de lo que se va a borrar.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.presupuestos_respaldo_20261020 AS
SELECT p.*
FROM public.presupuestos p
JOIN public.rubros r ON r.id = p.rubro_id
WHERE r.nombre IN ('MO directa con Carg Sociales', 'Mano de obra indirecta con cargas', 'Impuestos')
  AND p.periodo >= DATE '2026-10-01';

-- Sin políticas: nadie puede leerla por la API de la app, solo desde este editor.
ALTER TABLE public.presupuestos_respaldo_20261020 ENABLE ROW LEVEL SECURITY;

-- Control: tienen que salir 87 filas y 647551557.65
SELECT count(*) AS filas_respaldadas, sum(monto) AS monto_respaldado
FROM public.presupuestos_respaldo_20261020;


-- ═════════════════════════════════════════════════════════════════════════════
-- PASO 2 — VISTA PREVIA (no borra nada). Revisá que sea lo que querés borrar.
-- ═════════════════════════════════════════════════════════════════════════════
SELECT r.nombre AS rubro, p.periodo, count(*) AS lineas, sum(p.monto) AS monto
FROM public.presupuestos p
JOIN public.rubros r ON r.id = p.rubro_id
WHERE r.nombre IN ('MO directa con Carg Sociales', 'Mano de obra indirecta con cargas', 'Impuestos')
  AND p.periodo >= DATE '2026-10-01'
GROUP BY r.nombre, p.periodo
ORDER BY p.periodo, r.nombre;

-- ¿Algún movimiento apunta a estas líneas? (debería dar 0; si da más, avisame antes del paso 3)
SELECT count(*) AS movimientos_que_referencian
FROM public.movimientos
WHERE presupuesto_id IN (SELECT id FROM public.presupuestos_respaldo_20261020);


-- ═════════════════════════════════════════════════════════════════════════════
-- PASO 3 — BORRAR. Se frena solo (sin borrar nada) si la cantidad o el monto no coinciden.
-- ═════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_borradas int;
  v_antes    int;
  v_despues  int;
BEGIN
  IF (SELECT count(*) FROM public.presupuestos_respaldo_20261020) <> 87
     OR (SELECT round(sum(monto)::numeric, 2) FROM public.presupuestos_respaldo_20261020) <> 647551557.65 THEN
    RAISE EXCEPTION 'El respaldo no coincide con lo analizado (87 líneas / $ 647.551.557,65). No se borró nada.';
  END IF;

  SELECT count(*) INTO v_antes FROM public.presupuestos;

  -- Se borra exactamente lo respaldado, por id.
  DELETE FROM public.presupuestos
  WHERE id IN (SELECT id FROM public.presupuestos_respaldo_20261020);
  GET DIAGNOSTICS v_borradas = ROW_COUNT;

  SELECT count(*) INTO v_despues FROM public.presupuestos;

  IF v_borradas <> 87 OR v_despues <> v_antes - 87 THEN
    RAISE EXCEPTION 'Se esperaban 87 borradas y fueron %. Se deshace todo.', v_borradas;
  END IF;

  RAISE NOTICE 'Listo: % líneas borradas. Presupuestos: % -> %.', v_borradas, v_antes, v_despues;
END $$;

-- Verificación final: no tiene que quedar ninguna de esos rubros desde 2026-10-01
SELECT count(*) AS deberia_dar_0
FROM public.presupuestos p
JOIN public.rubros r ON r.id = p.rubro_id
WHERE r.nombre IN ('MO directa con Carg Sociales', 'Mano de obra indirecta con cargas', 'Impuestos')
  AND p.periodo >= DATE '2026-10-01';


-- ═════════════════════════════════════════════════════════════════════════════
-- DESHACER (solo si hiciera falta): vuelve a insertar lo respaldado, con los mismos ids.
-- ═════════════════════════════════════════════════════════════════════════════
-- INSERT INTO public.presupuestos
-- SELECT * FROM public.presupuestos_respaldo_20261020
-- ON CONFLICT (id) DO NOTHING;

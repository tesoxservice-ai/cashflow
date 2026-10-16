-- Presupuestos: Finanzas pasa a SOLO LECTURA (Santiago escribe con sus políticas propias).
--
-- Correr en el proyecto de la app (wfiunzglndquuygenepp), DESPUÉS de presupuestos_solo_santiago_finanzas.sql.
--
-- Problema: la política "finanzas_all_presupuestos" es ALL para todo el rol 'finanzas', o sea que
-- cualquier usuario de Finanzas podía agregar/editar/borrar presupuestos en la base.
-- Solución: se reemplaza por una de SOLO LECTURA. El código de la app no escribe presupuestos
-- desde Finanzas (solo los lee: Cash Flow, Presupuesto vs. Real, Margen), así que no se rompe nada.
-- Santiago sigue escribiendo por presupuestos_santiago_insert / _update / _delete.
-- Operaciones y Directorio no cambian.
--
-- Para volver atrás (rollback), correr al final del archivo el bloque comentado.

DROP POLICY IF EXISTS finanzas_all_presupuestos ON public.presupuestos;
DROP POLICY IF EXISTS finanzas_select_presupuestos ON public.presupuestos;

CREATE POLICY finanzas_select_presupuestos ON public.presupuestos
  FOR SELECT TO public
  USING (get_my_rol() = 'finanzas');

-- Verificación
SELECT policyname, cmd, roles, qual AS condicion_using, with_check AS condicion_with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'presupuestos'
ORDER BY cmd, policyname;

-- ── ROLLBACK (solo si hiciera falta volver a como estaba) ──
-- DROP POLICY IF EXISTS finanzas_select_presupuestos ON public.presupuestos;
-- CREATE POLICY finanzas_all_presupuestos ON public.presupuestos
--   FOR ALL TO public
--   USING (get_my_rol() = 'finanzas')
--   WITH CHECK (get_my_rol() = 'finanzas');

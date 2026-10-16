-- Presupuestos: desde Finanzas, solo Santiago Verdinelli puede agregar, editar y borrar.
-- Operaciones no cambia: sigue con sus políticas de siempre.
--
-- IMPORTANTE: correr en el proyecto de la app (wfiunzglndquuygenepp), no en otro.
-- Es seguro correrlo más de una vez.
--
-- Qué hace: crea 3 políticas (alta, edición, baja) que habilitan escribir en "presupuestos"
-- únicamente al usuario con el email sverdinelli@psdata.com.ar. No toca las políticas existentes.
-- Al final lista TODAS las políticas de la tabla para revisar que ningún otro rol de Finanzas
-- tenga permiso de escritura (ver nota abajo).

DROP POLICY IF EXISTS presupuestos_santiago_insert ON public.presupuestos;
DROP POLICY IF EXISTS presupuestos_santiago_update ON public.presupuestos;
DROP POLICY IF EXISTS presupuestos_santiago_delete ON public.presupuestos;

CREATE POLICY presupuestos_santiago_insert ON public.presupuestos
  FOR INSERT TO authenticated
  WITH CHECK (lower(auth.jwt() ->> 'email') = 'sverdinelli@psdata.com.ar');

CREATE POLICY presupuestos_santiago_update ON public.presupuestos
  FOR UPDATE TO authenticated
  USING      (lower(auth.jwt() ->> 'email') = 'sverdinelli@psdata.com.ar')
  WITH CHECK (lower(auth.jwt() ->> 'email') = 'sverdinelli@psdata.com.ar');

CREATE POLICY presupuestos_santiago_delete ON public.presupuestos
  FOR DELETE TO authenticated
  USING (lower(auth.jwt() ->> 'email') = 'sverdinelli@psdata.com.ar');

-- Verificación: políticas de la tabla.
-- Nota: si aparece alguna de escritura (INSERT / UPDATE / DELETE / ALL) cuya condición permita
-- el rol 'finanzas' en general, avisame: esa política deja escribir a todo Finanzas y habría que ajustarla.
SELECT policyname, cmd, roles, qual AS condicion_using, with_check AS condicion_with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'presupuestos'
ORDER BY cmd, policyname;

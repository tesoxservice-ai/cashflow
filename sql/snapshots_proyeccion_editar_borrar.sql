-- Fotos de proyección: permitir RENOMBRAR (cambiar el nombre y la nota) y BORRAR fotos.
--
-- Hasta ahora una foto no se podía tocar. Este script habilita dos cosas, y solo dos:
--   * Cambiar el NOMBRE y la NOTA de una foto. Ninguna otra columna se puede modificar (los números de la foto quedan intactos).
--   * Borrar una foto entera.
-- Quién puede: el rol "directorio" y Santiago Verdinelli (sverdinelli@psdata.com.ar), igual que para verlas y guardarlas.
--
-- Es seguro correrlo más de una vez. No borra ni cambia ninguna foto existente.
-- IMPORTANTE: correr en el proyecto de la app (wfiunzglndquuygenepp), no en otro.

-- Permisos de tabla: modificar SOLO nombre y nota (no los números) y borrar.
GRANT UPDATE (nombre, nota) ON public.snapshots_proyeccion TO authenticated;
GRANT DELETE ON public.snapshots_proyeccion TO authenticated;

DROP POLICY IF EXISTS snapshots_proyeccion_update ON public.snapshots_proyeccion;
DROP POLICY IF EXISTS snapshots_proyeccion_delete ON public.snapshots_proyeccion;

CREATE POLICY snapshots_proyeccion_update ON public.snapshots_proyeccion
  FOR UPDATE TO authenticated
  USING (
    lower(auth.jwt() ->> 'email') = 'sverdinelli@psdata.com.ar'
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol = 'directorio')
  )
  WITH CHECK (
    lower(auth.jwt() ->> 'email') = 'sverdinelli@psdata.com.ar'
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol = 'directorio')
  );

CREATE POLICY snapshots_proyeccion_delete ON public.snapshots_proyeccion
  FOR DELETE TO authenticated
  USING (
    lower(auth.jwt() ->> 'email') = 'sverdinelli@psdata.com.ar'
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol = 'directorio')
  );

-- Verificación 1: ahora tiene que haber políticas de select, insert, update y delete.
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'snapshots_proyeccion'
ORDER BY cmd, policyname;

-- Verificación 2: tienen que salir DELETE (tabla) y UPDATE solo en las columnas nombre y nota.
SELECT 'tabla' AS nivel, privilege_type, NULL AS columna
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'snapshots_proyeccion' AND grantee = 'authenticated'
UNION ALL
SELECT 'columna', privilege_type, column_name
FROM information_schema.column_privileges
WHERE table_schema = 'public' AND table_name = 'snapshots_proyeccion' AND grantee = 'authenticated' AND privilege_type = 'UPDATE'
ORDER BY 1, 2, 3;

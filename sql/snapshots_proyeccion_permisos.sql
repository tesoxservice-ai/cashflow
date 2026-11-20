-- Arreglo rápido: la tabla snapshots_proyeccion ya existe pero faltaba el permiso de tabla
-- (error "permission denied for table snapshots_proyeccion"). Es seguro correrlo más de una vez.
-- Da solo lectura y alta a usuarios logueados; las políticas ya limitan quién (directorio y Santiago).
-- No se puede modificar ni borrar.

REVOKE ALL ON public.snapshots_proyeccion FROM anon, authenticated;
GRANT SELECT, INSERT ON public.snapshots_proyeccion TO authenticated;

-- Verificación: debe mostrar solo SELECT e INSERT para "authenticated".
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'snapshots_proyeccion'
ORDER BY grantee, privilege_type;

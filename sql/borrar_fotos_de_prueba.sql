-- Borra las 2 fotos de prueba del 20/11/2026 (las únicas que hay en snapshots_proyeccion).
-- Se borran por id exacto, no por nombre ni fecha. Es permanente.
-- Correr una sola vez en el SQL Editor de Supabase (proyecto wfiunzglndquuygenepp).

DELETE FROM public.snapshots_proyeccion
WHERE id IN (
  'bc725b74-311a-4e15-be7e-305518c2e052',
  '4e83f237-ad0c-4d3c-99d6-292d6ff703c1'
);

-- Verificación: debe dar 0 filas.
SELECT id, nombre, fecha_corte, creado_por FROM public.snapshots_proyeccion;

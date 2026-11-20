-- Historial de proyecciones ("fotos"): guarda cómo estaba la proyección en un momento,
-- para poder comparar versiones (por ejemplo, cada 2 semanas).
--
-- IMPORTANTE: correr en el proyecto de la app (wfiunzglndquuygenepp), no en otro.
-- Es seguro correrlo más de una vez.
--
-- Quién puede qué:
--   * Ver y guardar fotos: el rol "directorio" y Santiago Verdinelli (sverdinelli@psdata.com.ar). Nadie más.
--   * Editar o borrar una foto: NADIE desde la app (no hay políticas de UPDATE ni DELETE).
--     Una foto es una constancia: una vez guardada no se toca.
--   * El guardado es siempre manual (botón "Guardar foto"). No hay nada automático.

CREATE TABLE IF NOT EXISTS public.snapshots_proyeccion (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid        DEFAULT auth.uid(),
  creado_por       text,                      -- nombre de quien la guardó (para mostrar)
  nombre           text        NOT NULL,      -- ej.: "Cierre 18/02"
  nota             text,                      -- comentario libre
  fecha_corte      date        NOT NULL,      -- día al que corresponde la foto (hoy al guardar)
  version          integer     NOT NULL DEFAULT 1,   -- forma del contenido (por si cambia a futuro)
  resumen          jsonb       NOT NULL,      -- números clave (caja hoy, gasto proyectado, ventas, mínimo, etc.)
  mensual          jsonb       NOT NULL,      -- ingresos y egresos por mes y por concepto
  serie            jsonb       NOT NULL,      -- caja y total día por día (para superponer curvas)
  filas            jsonb       NOT NULL       -- movimientos pendientes y proyectados de ese momento
);

CREATE INDEX IF NOT EXISTS snapshots_proyeccion_created_at_idx
  ON public.snapshots_proyeccion (created_at DESC);

ALTER TABLE public.snapshots_proyeccion ENABLE ROW LEVEL SECURITY;

-- Permisos de tabla: solo leer y agregar (nada de modificar ni borrar). Las políticas de abajo
-- limitan además quién puede hacerlo.
REVOKE ALL ON public.snapshots_proyeccion FROM anon, authenticated;
GRANT SELECT, INSERT ON public.snapshots_proyeccion TO authenticated;

DROP POLICY IF EXISTS snapshots_proyeccion_select ON public.snapshots_proyeccion;
DROP POLICY IF EXISTS snapshots_proyeccion_insert ON public.snapshots_proyeccion;

-- Ver: directorio o Santiago.
CREATE POLICY snapshots_proyeccion_select ON public.snapshots_proyeccion
  FOR SELECT TO authenticated
  USING (
    lower(auth.jwt() ->> 'email') = 'sverdinelli@psdata.com.ar'
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol = 'directorio')
  );

-- Guardar: directorio o Santiago, y siempre a nombre propio.
CREATE POLICY snapshots_proyeccion_insert ON public.snapshots_proyeccion
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      lower(auth.jwt() ->> 'email') = 'sverdinelli@psdata.com.ar'
      OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol = 'directorio')
    )
  );

-- Sin políticas de UPDATE ni DELETE: las fotos no se pueden modificar ni borrar desde la app.

-- Verificación 1: políticas de la tabla (deben ser solo SELECT e INSERT).
SELECT policyname, cmd, roles, qual AS condicion_using, with_check AS condicion_with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'snapshots_proyeccion'
ORDER BY cmd, policyname;

-- Verificación 2: la tabla quedó con seguridad activada (rowsecurity = true).
SELECT relname, relrowsecurity AS seguridad_activada
FROM pg_class
WHERE oid = 'public.snapshots_proyeccion'::regclass;

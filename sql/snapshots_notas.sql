-- Fotos de proyección: notas a mano sobre las diferencias entre dos fotos ("por qué cambió esto").
--
-- Una nota pertenece a UNA comparación (foto anterior + foto nueva) y a UNA diferencia de esa comparación (la clave identifica la línea
-- o el grupo que cambió). Así, cuando abrís de nuevo la misma comparación, las explicaciones siguen ahí.
-- Si se borra una de las dos fotos, se borran también sus notas (ya no tienen sentido).
--
-- Quién puede: el rol "directorio" y Santiago Verdinelli (sverdinelli@psdata.com.ar), igual que para ver las fotos.
-- Es seguro correrlo más de una vez. Solo crea una tabla nueva y vacía: no toca ninguna foto.
-- IMPORTANTE: correr en el proyecto de la app (wfiunzglndquuygenepp), no en otro.

CREATE TABLE IF NOT EXISTS public.snapshots_notas (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  foto_a      uuid        NOT NULL REFERENCES public.snapshots_proyeccion(id) ON DELETE CASCADE,  -- la foto anterior
  foto_b      uuid        NOT NULL REFERENCES public.snapshots_proyeccion(id) ON DELETE CASCADE,  -- la foto nueva
  clave       text        NOT NULL,   -- qué diferencia: 'linea:<id>' (una factura) o 'grupo:<...>' (un grupo proyectado)
  texto       text        NOT NULL,
  updated_by  uuid        DEFAULT auth.uid(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (foto_a, foto_b, clave)
);

CREATE INDEX IF NOT EXISTS snapshots_notas_fotos_idx ON public.snapshots_notas (foto_a, foto_b);

ALTER TABLE public.snapshots_notas ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.snapshots_notas FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.snapshots_notas TO authenticated;

DROP POLICY IF EXISTS snapshots_notas_select ON public.snapshots_notas;
DROP POLICY IF EXISTS snapshots_notas_insert ON public.snapshots_notas;
DROP POLICY IF EXISTS snapshots_notas_update ON public.snapshots_notas;
DROP POLICY IF EXISTS snapshots_notas_delete ON public.snapshots_notas;

CREATE POLICY snapshots_notas_select ON public.snapshots_notas
  FOR SELECT TO authenticated
  USING (
    lower(auth.jwt() ->> 'email') = 'sverdinelli@psdata.com.ar'
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol = 'directorio')
  );

CREATE POLICY snapshots_notas_insert ON public.snapshots_notas
  FOR INSERT TO authenticated
  WITH CHECK (
    lower(auth.jwt() ->> 'email') = 'sverdinelli@psdata.com.ar'
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol = 'directorio')
  );

CREATE POLICY snapshots_notas_update ON public.snapshots_notas
  FOR UPDATE TO authenticated
  USING (
    lower(auth.jwt() ->> 'email') = 'sverdinelli@psdata.com.ar'
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol = 'directorio')
  )
  WITH CHECK (
    lower(auth.jwt() ->> 'email') = 'sverdinelli@psdata.com.ar'
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol = 'directorio')
  );

CREATE POLICY snapshots_notas_delete ON public.snapshots_notas
  FOR DELETE TO authenticated
  USING (
    lower(auth.jwt() ->> 'email') = 'sverdinelli@psdata.com.ar'
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol = 'directorio')
  );

-- Verificación 1: las 4 políticas (select, insert, update, delete).
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'snapshots_notas'
ORDER BY cmd, policyname;

-- Verificación 2: la tabla quedó con seguridad activada (seguridad_activada = true).
SELECT relname, relrowsecurity AS seguridad_activada
FROM pg_class
WHERE oid = 'public.snapshots_notas'::regclass;

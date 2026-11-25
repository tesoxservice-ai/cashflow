-- Retenciones a favor: guarda los saldos que Finanzas carga a mano desde el sistema contable.
--
-- Qué guarda (una fila por dato, se pisa cuando se actualiza):
--   clave   'saldo:iva' | 'saldo:ganancias' | 'saldo:iibb_sf' | 'saldo:iibb_caba' | 'saldo:iibb_pba' | 'saldo:iibb_otras' |
--           'saldo:suss' | 'saldo:otras'   -> cuánto hay acumulado a favor de cada retención.
--           'pagar:<el mismo tipo>' (pagar:iva, pagar:iibb_sf, ...) -> cuánto se debe hoy de ese impuesto.
--   monto   en pesos.
--   fecha   a qué día corresponde el dato (el del sistema contable).
--   nota    comentario libre (de dónde salió el número).
--
-- Quién puede qué:
--   * Ver: cualquier usuario con sesión (la pantalla la ven Finanzas y el Directorio).
--   * Cargar, cambiar o borrar: el rol "finanzas", el rol "directorio" y Santiago Verdinelli (sverdinelli@psdata.com.ar).
--
-- Es seguro correrlo más de una vez. Solo crea una tabla nueva y vacía: no toca nada de lo que ya existe.
-- IMPORTANTE: correr en el proyecto de la app (wfiunzglndquuygenepp), no en otro.

CREATE TABLE IF NOT EXISTS public.retenciones_saldos (
  clave       text          PRIMARY KEY,
  monto       numeric(18,2) NOT NULL,
  fecha       date          NOT NULL,
  nota        text,
  updated_by  uuid          DEFAULT auth.uid(),
  updated_at  timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.retenciones_saldos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.retenciones_saldos FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.retenciones_saldos TO authenticated;

DROP POLICY IF EXISTS retenciones_saldos_select ON public.retenciones_saldos;
DROP POLICY IF EXISTS retenciones_saldos_insert ON public.retenciones_saldos;
DROP POLICY IF EXISTS retenciones_saldos_update ON public.retenciones_saldos;
DROP POLICY IF EXISTS retenciones_saldos_delete ON public.retenciones_saldos;

CREATE POLICY retenciones_saldos_select ON public.retenciones_saldos
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY retenciones_saldos_insert ON public.retenciones_saldos
  FOR INSERT TO authenticated
  WITH CHECK (
    lower(auth.jwt() ->> 'email') = 'sverdinelli@psdata.com.ar'
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol IN ('finanzas', 'directorio'))
  );

CREATE POLICY retenciones_saldos_update ON public.retenciones_saldos
  FOR UPDATE TO authenticated
  USING (
    lower(auth.jwt() ->> 'email') = 'sverdinelli@psdata.com.ar'
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol IN ('finanzas', 'directorio'))
  )
  WITH CHECK (
    lower(auth.jwt() ->> 'email') = 'sverdinelli@psdata.com.ar'
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol IN ('finanzas', 'directorio'))
  );

CREATE POLICY retenciones_saldos_delete ON public.retenciones_saldos
  FOR DELETE TO authenticated
  USING (
    lower(auth.jwt() ->> 'email') = 'sverdinelli@psdata.com.ar'
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol IN ('finanzas', 'directorio'))
  );

-- Verificación 1: las 4 políticas (select, insert, update, delete).
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'retenciones_saldos'
ORDER BY cmd, policyname;

-- Verificación 2: la tabla quedó con seguridad activada (seguridad_activada = true).
SELECT relname, relrowsecurity AS seguridad_activada
FROM pg_class
WHERE oid = 'public.retenciones_saldos'::regclass;

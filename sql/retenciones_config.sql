-- Cash Flow · retenciones editables: guarda los ajustes que Finanzas hace a las retenciones e impuestos de los cobros.
--
-- Qué guarda (una fila por ajuste):
--   clave        'cliente:nec' (vale para TODAS las ventas de ese cliente)  o  'venta:fc:<id de la factura>' /
--                'venta:vp:<obra>|<período>' (vale solo para ESA venta). La venta manda sobre el cliente.
--   retenciones  la lista completa de retenciones de ese cliente o venta, por ejemplo:
--                [{"clave":"iibb_sf","etiqueta":"Retención IIBB Santa Fe","base":"total","tasa":0.045,"esIVA":false}]
--                base = neto (sin IVA) | iva | total (con IVA) | monto (monto fijo, en "monto").
--   banco        (opcional) los impuestos del banco sobre lo que acredita: IIBB banco, Ley 25413.
-- Si no hay fila, se usan los valores estándar del código. Borrar la fila = volver a los valores estándar.
--
-- Quién puede qué:
--   * Ver: cualquier usuario con sesión (el Cash Flow y el Directorio las necesitan para calcular).
--   * Cambiar o borrar: el rol "finanzas", el rol "directorio" y Santiago Verdinelli (sverdinelli@psdata.com.ar).
--
-- Es seguro correrlo más de una vez. No toca ningún dato existente: solo crea una tabla nueva y vacía.
-- IMPORTANTE: correr en el proyecto de la app (wfiunzglndquuygenepp), no en otro.

CREATE TABLE IF NOT EXISTS public.retenciones_config (
  clave        text        PRIMARY KEY,
  retenciones  jsonb,
  banco        jsonb,
  updated_by   uuid        DEFAULT auth.uid(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.retenciones_config ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.retenciones_config FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.retenciones_config TO authenticated;

DROP POLICY IF EXISTS retenciones_config_select ON public.retenciones_config;
DROP POLICY IF EXISTS retenciones_config_insert ON public.retenciones_config;
DROP POLICY IF EXISTS retenciones_config_update ON public.retenciones_config;
DROP POLICY IF EXISTS retenciones_config_delete ON public.retenciones_config;

-- Ver: cualquier usuario con sesión.
CREATE POLICY retenciones_config_select ON public.retenciones_config
  FOR SELECT TO authenticated
  USING (true);

-- Cambiar: finanzas, directorio o Santiago.
CREATE POLICY retenciones_config_insert ON public.retenciones_config
  FOR INSERT TO authenticated
  WITH CHECK (
    lower(auth.jwt() ->> 'email') = 'sverdinelli@psdata.com.ar'
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol IN ('finanzas', 'directorio'))
  );

CREATE POLICY retenciones_config_update ON public.retenciones_config
  FOR UPDATE TO authenticated
  USING (
    lower(auth.jwt() ->> 'email') = 'sverdinelli@psdata.com.ar'
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol IN ('finanzas', 'directorio'))
  )
  WITH CHECK (
    lower(auth.jwt() ->> 'email') = 'sverdinelli@psdata.com.ar'
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol IN ('finanzas', 'directorio'))
  );

CREATE POLICY retenciones_config_delete ON public.retenciones_config
  FOR DELETE TO authenticated
  USING (
    lower(auth.jwt() ->> 'email') = 'sverdinelli@psdata.com.ar'
    OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol IN ('finanzas', 'directorio'))
  );

-- Verificación 1: las 4 políticas (select, insert, update, delete).
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'retenciones_config'
ORDER BY cmd, policyname;

-- Verificación 2: la tabla quedó con seguridad activada (seguridad_activada = true).
SELECT relname, relrowsecurity AS seguridad_activada
FROM pg_class
WHERE oid = 'public.retenciones_config'::regclass;

-- Cash Flow · dividir gastos y ventas proyectados en partes (porcentaje + fecha cada una).
--
-- Qué hace: agrega la columna `partes` a las dos tablas donde Finanzas guarda sus ajustes de fecha
--   - gasto_proyectado_fecha_estimada
--   - venta_proyectada_fecha_estimada
-- `partes` guarda la división como una lista, por ejemplo:
--   [{"porcentaje": 50, "fecha": "2026-11-18"}, {"porcentaje": 50, "fecha": "2026-12-02"}]
-- y deja `fecha_estimada` vacía (NULL) cuando la línea está dividida o se le quitó la fecha.
--
-- Es seguro: solo agrega una columna (vacía para todas las filas que ya existen) y permite que
-- `fecha_estimada` quede vacía. No toca ningún dato, presupuesto, venta ni factura. Se puede correr más de una vez.
--
-- Correr ANTES de usar "Editar / dividir" en el Cash Flow. Proyecto de la app (wfiunzglndquuygenepp).

ALTER TABLE public.gasto_proyectado_fecha_estimada ADD COLUMN IF NOT EXISTS partes jsonb;
ALTER TABLE public.venta_proyectada_fecha_estimada ADD COLUMN IF NOT EXISTS partes jsonb;

ALTER TABLE public.gasto_proyectado_fecha_estimada ALTER COLUMN fecha_estimada DROP NOT NULL;
ALTER TABLE public.venta_proyectada_fecha_estimada ALTER COLUMN fecha_estimada DROP NOT NULL;

-- Verificación: tienen que salir 2 filas con is_nullable = YES (fecha_estimada) y 2 filas de `partes` (jsonb).
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('gasto_proyectado_fecha_estimada', 'venta_proyectada_fecha_estimada')
  AND column_name IN ('partes', 'fecha_estimada')
ORDER BY table_name, column_name;

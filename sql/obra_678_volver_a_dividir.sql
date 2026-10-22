-- Obra 678 · Subcontratos · octubre 2026: sacar la fecha manual (9/12/2026) para que vuelva a dividirse
-- en los 4 miércoles de noviembre (4 × $ 60.353.125).
--
-- Por qué: hoy alguien usó "Editar fecha" en esa línea y puso el 9/12/2026. Una fecha puesta a mano siempre
-- manda sobre la división automática, por eso la fila aparece entera. Al borrar esa fecha manual, vuelve a
-- dividirse sola. (No se toca el presupuesto de Operaciones ni ninguna factura.)
--
-- Correr en el proyecto de la app (wfiunzglndquuygenepp). Se frena solo, sin borrar nada, si lo que encuentra
-- no es exactamente esa línea.

-- Respaldo de la fecha manual (por si querés volver a ponerla)
CREATE TABLE IF NOT EXISTS public.respaldo_fecha_estimada_678_20261021 AS
SELECT * FROM public.gasto_proyectado_fecha_estimada
WHERE id = '9a31084f-06df-439a-a643-6d2726f4393a';
ALTER TABLE public.respaldo_fecha_estimada_678_20261021 ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_borradas int;
BEGIN
  IF (SELECT count(*) FROM public.respaldo_fecha_estimada_678_20261021
      WHERE obra_id  = '70be9f6d-fc01-423a-a978-24ec9f8cbe27'
        AND rubro_id = '9a94f4be-7ea9-49a3-ad21-823e72dedaab'
        AND periodo  = DATE '2026-10-01'
        AND fecha_estimada = DATE '2026-12-09') <> 1 THEN
    RAISE EXCEPTION 'El respaldo no es la línea esperada (obra 678 · Subcontratos · oct 2026 · 9/12/2026). No se borró nada.';
  END IF;

  DELETE FROM public.gasto_proyectado_fecha_estimada
  WHERE id = '9a31084f-06df-439a-a643-6d2726f4393a';
  GET DIAGNOSTICS v_borradas = ROW_COUNT;

  IF v_borradas <> 1 THEN
    RAISE EXCEPTION 'Se esperaba borrar 1 fila y fueron %. Se deshace todo.', v_borradas;
  END IF;
  RAISE NOTICE 'Listo: se sacó la fecha manual. La línea vuelve a dividirse en los 4 miércoles de noviembre.';
END $$;

-- Verificación: no tiene que quedar ninguna fecha manual para esa línea (debe dar 0)
SELECT count(*) AS deberia_dar_0
FROM public.gasto_proyectado_fecha_estimada
WHERE obra_id  = '70be9f6d-fc01-423a-a978-24ec9f8cbe27'
  AND rubro_id = '9a94f4be-7ea9-49a3-ad21-823e72dedaab'
  AND periodo  = DATE '2026-10-01';

-- DESHACER (solo si hiciera falta volver a poner el 9/12):
-- INSERT INTO public.gasto_proyectado_fecha_estimada
-- SELECT * FROM public.respaldo_fecha_estimada_678_20261021
-- ON CONFLICT (id) DO NOTHING;

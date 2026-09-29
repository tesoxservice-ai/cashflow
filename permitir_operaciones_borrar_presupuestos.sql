-- Operaciones puede insertar y editar presupuestos, pero no borrarlos: falta
-- la política de DELETE en la tabla `presupuestos` para el rol 'operaciones'.
-- Sin esto, el botón "Eliminar" en Presupuestos no hace nada (el DELETE
-- corre sin error pero no borra ninguna fila, filtrado en silencio por RLS).

CREATE POLICY operaciones_delete_presupuestos ON presupuestos
  FOR DELETE TO public
  USING (get_my_rol() = 'operaciones');

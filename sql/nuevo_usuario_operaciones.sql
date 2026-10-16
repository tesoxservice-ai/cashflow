-- Alta de un perfil de Operaciones.
--
-- PASO 1 (en el panel de Supabase, no en SQL):
--   Authentication > Users > Add user > Create new user
--   Cargá el email y una contraseña, y tildá "Auto Confirm User".
--
-- PASO 2: completá las 3 líneas de abajo (email, nombre, apellido) y corré este script
--   en el SQL Editor. Crea la fila en la tabla "usuarios" con rol 'operaciones'.
--   Es seguro correrlo dos veces: si el perfil ya existe, no lo toca.

DO $$
DECLARE
  v_email    text := 'grositto@psdata.com.ar';   -- el mismo email del paso 1
  v_nombre   text := 'Giuliano';
  v_apellido text := 'Rositto';
  v_id       uuid;
BEGIN
  IF v_nombre = 'COMPLETAR' THEN
    RAISE EXCEPTION 'Completá email, nombre y apellido antes de correr el script.';
  END IF;

  SELECT id INTO v_id FROM auth.users WHERE lower(email) = lower(v_email);
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'No existe un usuario de Auth con el email %. Crealo primero (paso 1).', v_email;
  END IF;

  IF EXISTS (SELECT 1 FROM public.usuarios WHERE id = v_id) THEN
    RAISE NOTICE 'El usuario % ya tiene perfil, no se modificó nada.', v_email;
  ELSE
    INSERT INTO public.usuarios (id, nombre, apellido, rol)
    VALUES (v_id, v_nombre, v_apellido, 'operaciones');
    RAISE NOTICE 'Perfil de Operaciones creado para %.', v_email;
  END IF;
END $$;

-- Verificación: lista los usuarios de Operaciones
SELECT u.nombre, u.apellido, u.rol, a.email
FROM public.usuarios u
JOIN auth.users a ON a.id = u.id
WHERE u.rol = 'operaciones'
ORDER BY u.apellido;

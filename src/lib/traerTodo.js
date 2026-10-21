// src/lib/traerTodo.js
//
// Supabase devuelve como máximo 1000 filas por consulta y, si hay más, corta en silencio: sin error,
// sin aviso. Con ~1.100 presupuestos eso hacía que el Cash Flow, el inicio y el Directorio
// proyectaran de menos (faltaban los últimos que cargó Operaciones).
//
// Esto trae TODAS las filas pidiendo de a 1000. Se le pasa una función que arma la consulta
// (sin .range); tiene que traer un orden estable (ej. .order('id')) para que las páginas no se pisen.
//
//   const { data, error } = await traerTodo(() =>
//     supabase.from('presupuestos').select('id, monto').order('id'))
//
// Devuelve lo mismo que una consulta común: { data, error }.

const PAGINA = 1000

export async function traerTodo(armarConsulta) {
  const todas = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await armarConsulta().range(desde, desde + PAGINA - 1)
    if (error) return { data: null, error }
    todas.push(...(data ?? []))
    if ((data?.length ?? 0) < PAGINA) break
  }
  return { data: todas, error: null }
}

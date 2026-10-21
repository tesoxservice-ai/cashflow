// src/lib/fetchCompleto.js
//
// Red de seguridad contra el límite de 1000 filas de Supabase.
//
// Una consulta que trae más de 1000 filas NO da error: devuelve las primeras 1000 y listo. Así el
// Cash Flow llegó a proyectar $604M de menos, porque había 1.089 presupuestos y se leían 1.000.
//
// Este fetch se conecta al cliente de Supabase (ver supabaseClient.js) y vigila TODAS las lecturas
// de la app, existentes y futuras: si una consulta sin límite propio devuelve justo 1000 filas, es
// que se cortó, y pide el resto de las páginas antes de entregar el resultado. Quien llamó recibe
// todas las filas sin enterarse. Las consultas con .limit() / .range() propios no se tocan.
//
// Para pedir de a páginas a propósito, igual existe traerTodo.js; esto es el seguro por si alguien
// se olvida.

export const MAX_FILAS = 1000
const MAX_PAGINAS = 200 // tope de seguridad: 200.000 filas

const aURL = input => new URL(typeof input === 'string' ? input : (input?.url ?? String(input)))

function encabezado(input, init, nombre) {
  const h = new Headers(init?.headers ?? (typeof input === 'object' ? input?.headers : undefined) ?? {})
  return h.get(nombre)
}

function metodo(input, init) {
  return String(init?.method ?? (typeof input === 'object' ? input?.method : undefined) ?? 'GET').toUpperCase()
}

// ¿Es una lectura de tabla sin límite propio? (las únicas que se pueden cortar sin que nadie lo note)
function esLecturaSinLimite(input, init) {
  if (metodo(input, init) !== 'GET') return false
  const url = aURL(input)
  if (!url.pathname.includes('/rest/v1/')) return false
  if (url.searchParams.has('limit') || url.searchParams.has('offset')) return false
  if (encabezado(input, init, 'range')) return false
  if ((encabezado(input, init, 'accept') ?? '').includes('vnd.pgrst.object')) return false // .single()
  return true
}

const tablaDe = input => aURL(input).pathname.split('/rest/v1/')[1] ?? ''

export function crearFetchCompleto(fetchBase = (...a) => fetch(...a), { alAdvertir = console.warn } = {}) {
  const avisadas = new Set()

  async function pedirPagina(input, init, desde, ordenar) {
    const url = aURL(input)
    if (ordenar && !url.searchParams.has('order')) url.searchParams.set('order', 'id.asc')
    url.searchParams.set('limit', String(MAX_FILAS))
    url.searchParams.set('offset', String(desde))
    const r = await fetchBase(url.toString(), init)
    if (!r.ok) throw new Error(`página ${desde}: HTTP ${r.status}`)
    const filas = await r.json()
    if (!Array.isArray(filas)) throw new Error(`página ${desde}: respuesta inesperada`)
    return filas
  }

  async function juntarTodas(input, init, ordenar) {
    const todas = []
    for (let p = 0; p < MAX_PAGINAS; p++) {
      const filas = await pedirPagina(input, init, p * MAX_FILAS, ordenar)
      todas.push(...filas)
      if (filas.length < MAX_FILAS) return todas
    }
    throw new Error('demasiadas páginas')
  }

  return async function fetchCompleto(input, init) {
    const respuesta = await fetchBase(input, init)
    if (!respuesta.ok || !esLecturaSinLimite(input, init)) return respuesta

    let primera
    try { primera = await respuesta.clone().json() } catch { return respuesta }
    if (!Array.isArray(primera) || primera.length < MAX_FILAS) return respuesta

    // Llegó justo al máximo: se cortó. Se pide todo de nuevo, con un orden estable para que las páginas
    // no se pisen; si la tabla no tiene "id" para ordenar, se pide sin orden.
    let todas
    try { todas = await juntarTodas(input, init, true) } catch {
      try { todas = await juntarTodas(input, init, false) } catch { return respuesta }
    }

    const tabla = tablaDe(input)
    if (!avisadas.has(tabla)) {
      avisadas.add(tabla)
      alAdvertir(`[supabase] "${tabla}" devolvió el máximo de ${MAX_FILAS} filas; se pidieron todas las páginas (${todas.length} filas). Conviene usar traerTodo().`)
    }

    const total = (respuesta.headers.get('content-range') ?? '').split('/')[1]
    const headers = new Headers(respuesta.headers)
    headers.set('content-type', 'application/json')
    headers.set('content-range', `0-${Math.max(todas.length - 1, 0)}/${total && total !== '*' ? total : todas.length}`)
    return new Response(JSON.stringify(todas), { status: 200, statusText: 'OK', headers })
  }
}

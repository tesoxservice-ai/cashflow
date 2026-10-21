// Pruebas de la red de seguridad del límite de 1000 filas. Correr con: npm test
import test from 'node:test'
import assert from 'node:assert/strict'
import { crearFetchCompleto, MAX_FILAS } from './fetchCompleto.js'

const BASE = 'https://proyecto.supabase.co/rest/v1/'

// Servidor falso con el mismo comportamiento que Supabase: corta en MAX_FILAS salvo que se pida
// un limit/offset propio. Guarda las URLs pedidas para poder revisarlas.
function servidorFalso(totalFilas, { sinId = false } = {}) {
  const pedidos = []
  const fetchFalso = async (input) => {
    const url = new URL(String(input))
    pedidos.push(url)
    if (sinId && url.searchParams.get('order') === 'id.asc') return new Response('{"message":"no existe id"}', { status: 400 })
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const limite = Math.min(Number(url.searchParams.get('limit') ?? MAX_FILAS), MAX_FILAS)
    const filas = Array.from({ length: Math.max(0, Math.min(limite, totalFilas - offset)) }, (_, i) => ({ id: offset + i + 1 }))
    return new Response(JSON.stringify(filas), { status: 200, headers: { 'content-type': 'application/json', 'content-range': `${offset}-${offset + filas.length - 1}/*` } })
  }
  return { fetchFalso, pedidos }
}

const leer = async r => r.json()

test('una consulta que se corta en 1000 se completa con todas las filas', async () => {
  const { fetchFalso, pedidos } = servidorFalso(1089)
  const f = crearFetchCompleto(fetchFalso, { alAdvertir: () => {} })
  const filas = await leer(await f(BASE + 'presupuestos?select=id'))
  assert.equal(filas.length, 1089)
  assert.equal(new Set(filas.map(x => x.id)).size, 1089, 'sin filas repetidas')
  assert.ok(pedidos.some(u => u.searchParams.get('order') === 'id.asc'), 'pide con orden estable')
})

test('una consulta de más de 2 páginas trae todo', async () => {
  const { fetchFalso } = servidorFalso(2500)
  const f = crearFetchCompleto(fetchFalso, { alAdvertir: () => {} })
  assert.equal((await leer(await f(BASE + 'movimientos?select=*'))).length, 2500)
})

test('una consulta chica no se toca ni se repite', async () => {
  const { fetchFalso, pedidos } = servidorFalso(794)
  const f = crearFetchCompleto(fetchFalso, { alAdvertir: () => {} })
  assert.equal((await leer(await f(BASE + 'movimientos?select=*'))).length, 794)
  assert.equal(pedidos.length, 1)
})

test('justo 1000 filas: verifica que no haya más', async () => {
  const { fetchFalso } = servidorFalso(1000)
  const f = crearFetchCompleto(fetchFalso, { alAdvertir: () => {} })
  assert.equal((await leer(await f(BASE + 'presupuestos?select=id'))).length, 1000)
})

test('si el programador pide su propio limit o range, se respeta', async () => {
  const { fetchFalso, pedidos } = servidorFalso(5000)
  const f = crearFetchCompleto(fetchFalso, { alAdvertir: () => {} })
  await f(BASE + 'presupuestos?select=id&limit=1000&offset=0')
  await f(BASE + 'presupuestos?select=id', { headers: { Range: '0-999' } })
  assert.equal(pedidos.length, 2)
})

test('las escrituras no se tocan', async () => {
  const { fetchFalso, pedidos } = servidorFalso(5000)
  const f = crearFetchCompleto(fetchFalso, { alAdvertir: () => {} })
  await f(BASE + 'presupuestos', { method: 'POST', body: '[]' })
  assert.equal(pedidos.length, 1)
})

test('si la tabla no tiene id para ordenar, igual trae todo', async () => {
  const { fetchFalso } = servidorFalso(1500, { sinId: true })
  const f = crearFetchCompleto(fetchFalso, { alAdvertir: () => {} })
  assert.equal((await leer(await f(BASE + 'tabla_sin_id?select=*'))).length, 1500)
})

test('avisa una sola vez por tabla', async () => {
  const { fetchFalso } = servidorFalso(1200)
  const avisos = []
  const f = crearFetchCompleto(fetchFalso, { alAdvertir: m => avisos.push(m) })
  await f(BASE + 'presupuestos?select=id'); await f(BASE + 'presupuestos?select=id')
  assert.equal(avisos.length, 1)
  assert.match(avisos[0], /presupuestos/)
})

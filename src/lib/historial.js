// src/lib/historial.js
//
// Traduce un registro del historial (una fila técnica de la tabla `historial`:
// tabla, acción, foto anterior y foto nueva) a algo que Finanzas pueda leer:
//   "Laura modificó el presupuesto de Obra 678 — Importe: $2.000.000 → $2.500.000"
//
// El registro en sí lo hace la base de datos (triggers, ver historial.sql). Acá solo
// se describe. Si se audita una tabla nueva y no está en TABLAS, igual se muestra
// con un formato genérico: no hace falta tocar nada para que aparezca.

const RUBROS_VENTA = {
  abono: 'Abono',
  correctivos: 'Correctivos',
  extras: 'Extras',
  anticipo: 'Anticipo',
  certificados_ejecucion: 'Certificados de ejecución',
  facturacion: 'Facturación',
}

const CAMPOS_RUBRO = { rubro_id: { label: 'Rubro', tipo: 'rubro' } }
const CAMPO_PERIODO = { label: 'Período', tipo: 'periodo' }
const CAMPO_MONTO = { label: 'Importe', tipo: 'monto' }

// Cómo se llama y se lee cada tabla auditada.
//   campos:   etiqueta y tipo de cada columna que vale la pena mostrar
//   contexto: columnas que ayudan a ubicar el registro (se muestran aunque no hayan cambiado)
//   verbo:    (opcional) frase propia para ciertos casos (cerrar, reprogramar, activar...)
export const TABLAS = {
  presupuestos: {
    modulo: 'Presupuestos', singular: 'presupuesto', plural: 'presupuestos', articulo: 'el',
    campos: { ...CAMPOS_RUBRO, concepto: { label: 'Concepto' }, periodo: CAMPO_PERIODO, monto: CAMPO_MONTO, cerrado: { label: 'Cerrado', tipo: 'bool' } },
    contexto: ['rubro_id', 'concepto', 'periodo'],
  },
  ventas_proyectadas: {
    modulo: 'Ventas proyectadas', singular: 'venta proyectada', plural: 'ventas proyectadas', articulo: 'la',
    campos: { rubro: { label: 'Rubro', tipo: 'rubroVenta' }, periodo: CAMPO_PERIODO, monto: CAMPO_MONTO, registrado: { label: 'Registrada por Finanzas', tipo: 'bool' } },
    contexto: ['rubro', 'periodo'],
  },
  obras: {
    modulo: 'Obras', singular: 'obra', plural: 'obras', articulo: 'la',
    campos: {
      codigo: { label: 'Código' }, nombre: { label: 'Nombre' }, cliente: { label: 'Cliente' },
      numero_compra: { label: 'N° de compra' }, fecha_inicio: { label: 'Fecha de inicio', tipo: 'fecha' },
      fecha_fin_estimada: { label: 'Fin estimado', tipo: 'fecha' }, monto_contrato: { label: 'Monto del contrato', tipo: 'monto' },
      moneda: { label: 'Moneda' }, activa: { label: 'Activa', tipo: 'bool' },
    },
    contexto: ['cliente'],
    verbo: (e, ref) => {
      if (e.accion === 'modificar' && e.campos.length === 1 && e.campos[0] === 'activa') {
        return { verbo: ref.activa ? 'activó' : 'desactivó', objeto: 'la obra' }
      }
      return null
    },
  },
  rubros: {
    modulo: 'Rubros', singular: 'rubro', plural: 'rubros', articulo: 'el',
    campos: { nombre: { label: 'Nombre' }, tipo: { label: 'Tipo' }, activo: { label: 'Activo', tipo: 'bool' } },
    contexto: ['tipo'],
  },
  gasto_proyectado_fecha_estimada: {
    modulo: 'Proyección de gastos', singular: 'proyección de gasto', plural: 'proyecciones de gasto', articulo: 'la',
    campos: { ...CAMPOS_RUBRO, periodo: CAMPO_PERIODO, fecha_estimada: { label: 'Fecha estimada', tipo: 'fecha' }, cerrado: { label: 'Cerrada', tipo: 'bool' } },
    contexto: ['rubro_id', 'periodo'],
    verbo: (e, ref) => verboProyeccion(e, ref),
  },
  venta_proyectada_fecha_estimada: {
    modulo: 'Proyección de ventas', singular: 'proyección de venta', plural: 'proyecciones de venta', articulo: 'la',
    campos: { concepto: { label: 'Concepto' }, periodo: CAMPO_PERIODO, fecha_estimada: { label: 'Fecha estimada', tipo: 'fecha' }, cerrado: { label: 'Cerrada', tipo: 'bool' } },
    contexto: ['concepto', 'periodo'],
    verbo: (e, ref) => verboProyeccion(e, ref),
  },
}

// Cerrar / reabrir / reprogramar una proyección.
function verboProyeccion(e, ref) {
  const objeto = 'la proyección'
  if (e.accion === 'crear') return { verbo: ref.cerrado ? 'cerró' : 'reprogramó', objeto }
  if (e.accion === 'eliminar') return { verbo: 'quitó el ajuste de', objeto }
  if (e.campos.includes('cerrado')) return { verbo: ref.cerrado ? 'cerró' : 'reabrió', objeto }
  if (e.campos.includes('fecha_estimada')) return { verbo: 'reprogramó', objeto }
  return null
}

// Columnas que nunca se muestran como dato.
const OCULTAS = new Set(['id', 'created_at', 'updated_at', 'created_by', 'obra_id', 'user_id', '_rubro'])

const prettify = s => {
  const t = String(s).replace(/^_+/, '').replace(/_/g, ' ').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function infoTabla(tabla) {
  return TABLAS[tabla] ?? {
    modulo: prettify(tabla), singular: 'registro', plural: 'registros', articulo: 'el',
    campos: {}, contexto: [],
  }
}

// Módulos para el filtro (tabla -> nombre del módulo).
export const MODULOS = Object.entries(TABLAS).map(([tabla, d]) => ({ tabla, label: d.modulo }))

export const ACCIONES = [
  { value: 'crear', label: 'Altas (se cargó algo nuevo)', corto: 'Alta' },
  { value: 'modificar', label: 'Modificaciones', corto: 'Modificación' },
  { value: 'eliminar', label: 'Bajas (se eliminó algo)', corto: 'Baja' },
]

// ─── Formato de valores ───────────────────────────────────────────────────────

const fmtARS = n => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(Number(n) || 0)

function fmtFecha(str) {
  if (!str) return '—'
  const d = new Date(String(str).slice(0, 10) + 'T00:00:00')
  return Number.isNaN(d.getTime()) ? String(str) : d.toLocaleDateString('es-AR')
}

function fmtPeriodo(str) {
  if (!str) return '—'
  const d = new Date(String(str).slice(0, 10) + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return String(str)
  const t = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }).replace(' de ', ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

const ES_FECHA = /^\d{4}-\d{2}-\d{2}/

// Define cómo se muestra una columna: usa la definición de la tabla y, si no está, adivina por el nombre.
function definicionCampo(def, clave, valor) {
  if (def.campos[clave]) return def.campos[clave]
  if (typeof valor === 'boolean') return { label: prettify(clave), tipo: 'bool' }
  if (/monto|importe|saldo|precio/.test(clave)) return { label: prettify(clave), tipo: 'monto' }
  if (/periodo/.test(clave)) return { label: 'Período', tipo: 'periodo' }
  if (/^fecha|_fecha/.test(clave) || (typeof valor === 'string' && ES_FECHA.test(valor) && valor.length === 10)) return { label: prettify(clave), tipo: 'fecha' }
  return { label: prettify(clave) }
}

function formatear(campo, valor, fila) {
  if (campo.tipo === 'rubro') return fila?._rubro ?? '—'
  if (valor === null || valor === undefined || valor === '') return '—'
  switch (campo.tipo) {
    case 'monto': return fmtARS(valor)
    case 'periodo': return fmtPeriodo(valor)
    case 'fecha': return fmtFecha(valor)
    case 'bool': return valor ? 'Sí' : 'No'
    case 'rubroVenta': return RUBROS_VENTA[valor] ?? String(valor)
    default: return typeof valor === 'object' ? JSON.stringify(valor) : String(valor)
  }
}

// ─── Descripción de una entrada ──────────────────────────────────────────────

// Devuelve todo lo necesario para dibujar una entrada:
//   usuario, rol, frase (verbo + objeto), obra, tono, chips (campos tocados),
//   contexto [{label, valor}], cambios [{label, antes, nuevo}], valores [{label, valor}]
export function describir(e) {
  const def = infoTabla(e.tabla)
  const ref = e.datos_nuevos ?? e.datos_anteriores ?? {}
  const campos = e.campos ?? []

  // Frase
  let verbo, objeto
  const propio = def.verbo ? def.verbo(e, ref) : null
  if (propio) {
    ({ verbo, objeto } = propio)
  } else if (e.accion === 'crear') {
    verbo = 'creó'; objeto = def.articulo === 'la' ? `una nueva ${def.singular}` : `un nuevo ${def.singular}`
  } else if (e.accion === 'eliminar') {
    verbo = 'eliminó'; objeto = `${def.articulo} ${def.singular}`
  } else {
    verbo = 'modificó'; objeto = `${def.articulo} ${def.singular}`
  }

  // Obra
  const esObras = e.tabla === 'obras'
  const obra = e.obra_codigo ? `Obra ${e.obra_codigo}${esObras && ref.nombre ? ' — ' + ref.nombre : ''}` : null
  const conector = esObras ? ':' : (e.accion === 'crear' ? 'para' : 'de')

  // Chips: qué datos se tocaron
  const claves = e.accion === 'modificar' ? campos : []
  const chips = claves
    .filter(c => !OCULTAS.has(c) || c === 'rubro_id')
    .map(c => definicionCampo(def, c, ref[c]).label)
  const chipsUnicos = [...new Set(chips)]

  // Contexto: ubica el registro (no se repite lo que cambió)
  const contexto = []
  for (const c of (e.accion === 'modificar' ? def.contexto : [])) {
    if (campos.includes(c)) continue
    const campo = definicionCampo(def, c, ref[c])
    const valor = formatear(campo, ref[c], ref)
    if (valor !== '—') contexto.push({ label: campo.label, valor })
  }

  // Cambios (solo en modificar)
  const cambios = []
  if (e.accion === 'modificar') {
    for (const c of campos) {
      if (OCULTAS.has(c) && c !== 'rubro_id') continue
      const campo = definicionCampo(def, c, ref[c])
      cambios.push({
        label: campo.label,
        antes: formatear(campo, e.datos_anteriores?.[c], e.datos_anteriores),
        nuevo: formatear(campo, e.datos_nuevos?.[c], e.datos_nuevos),
      })
    }
  }

  // Valores completos (alta o baja)
  const valores = []
  if (e.accion !== 'modificar') {
    const vistos = new Set()
    const orden = [...Object.keys(def.campos), ...Object.keys(ref)]
    for (const c of orden) {
      if (vistos.has(c) || !(c in ref)) continue
      vistos.add(c)
      if (OCULTAS.has(c) && c !== 'rubro_id') continue
      const campo = definicionCampo(def, c, ref[c])
      if (c === 'cerrado' && !ref[c]) continue // 'Cerrado: No' en cada alta o baja es ruido
      const valor = formatear(campo, ref[c], ref)
      if (valor === '—') continue
      valores.push({ label: campo.label, valor })
    }
  }

  const tono = e.accion === 'crear' ? 'emerald' : e.accion === 'eliminar' ? 'rose' : 'amber'
  return { def, verbo, objeto, conector, obra, esObras, chips: chipsUnicos, contexto, cambios, valores, tono }
}

// Junta en un solo bloque las altas / bajas que se hicieron juntas (por ejemplo "Replicar" una
// venta en 5 períodos): mismo lote, mismo usuario, misma tabla y misma acción.
export function agrupar(entradas) {
  const salida = []
  for (const e of entradas) {
    const ult = salida[salida.length - 1]
    const juntable = e.accion !== 'modificar'
    if (ult && juntable && ult.items[0].lote === e.lote && ult.items[0].usuario_id === e.usuario_id
        && ult.items[0].tabla === e.tabla && ult.items[0].accion === e.accion) {
      ult.items.push(e)
    } else {
      salida.push({ items: [e] })
    }
  }
  return salida
}

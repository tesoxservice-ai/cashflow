// components/PanelRetenciones.jsx
// Retenciones: cuánto nos van a retener los clientes con los cobros proyectados y cuánto queda para pagar de impuestos.
// Se usa en Finanzas (/finanzas/retenciones) y en el Directorio (pestaña "Retenciones").
//
// - Lo que se va a retener sale solo del Cash Flow (ventas pendientes con su retención estimada, ver retencionesClientes.js).
// - Lo que se debe de cada impuesto lo carga Finanzas a mano (idealmente con el contador): tabla retenciones_saldos
//   (sql/retenciones_saldos.sql), filas 'pagar:<tipo>'. El saldo acumulado de retenciones NO se muestra: no es confiable sin el contador.
// - Todo es estimado: lo exacto está en los recibos y en las declaraciones juradas.

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import useCajaBase from '../lib/useCajaBase'
import { puedeEditarPresupuestosEnFinanzas } from '../lib/permisos'
import {
  TIPOS, GRUPOS, proyectarRetenciones, resumenPorTipo, resumenImpuestos, ordenarSaldos, proximosMeses, grupoDeTipo,
} from '../lib/retencionesResumen'
import { fmtARS, fmtFecha, hoyISO, CARD } from '../pages/directorio/utilsDirectorio'

const tablaFaltante = e => e && (e.code === '42P01' || e.code === 'PGRST205' || /retenciones_saldos/i.test(e.message ?? ''))
const fmtMes = ym => {
  const t = new Date(ym + '-01T00:00:00').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}
// "729.932.441,66", "729932441,66" o "729932441.66" -> número. Devuelve NaN si no se entiende.
export function aNumero(t) {
  const s = String(t ?? '').replace(/[$\s]/g, '')
  if (s === '') return NaN
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'))
  if (/^-?\d+(,\d+)?$/.test(s)) return Number(s.replace(',', '.'))
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s)
  return NaN
}
const aTexto = n => (n ? String(n).replace('.', ',') : '')

const Th = ({ children, derecha = false }) => (
  <th className={`px-3.5 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider ${derecha ? 'text-right' : 'text-left'}`}>{children}</th>
)
const Td = ({ children, derecha = false, fuerte = false, className = '' }) => (
  <td className={`px-3.5 py-2.5 text-sm tabular-nums ${derecha ? 'text-right' : ''} ${fuerte ? 'font-bold text-slate-900' : 'text-slate-700'} ${className}`}>{children}</td>
)

function Tarjeta({ titulo, valor, detalle, color = 'text-slate-900' }) {
  return (
    <div className={`${CARD} px-5 py-4`}>
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{titulo}</p>
      <p className={`text-xl font-extrabold tabular-nums mt-0.5 ${color}`}>{valor}</p>
      {detalle && <p className="text-xs text-slate-400 mt-0.5">{detalle}</p>}
    </div>
  )
}

export default function PanelRetenciones() {
  const { user, perfil } = useAuth()
  const puedeEditar = perfil?.rol === 'finanzas' || perfil?.rol === 'directorio' || puedeEditarPresupuestosEnFinanzas(user)
  const { combinados, error: errorCaja } = useCajaBase()

  const [filas, setFilas] = useState(null)         // lo cargado en retenciones_saldos
  const [faltaTabla, setFaltaTabla] = useState(false)
  const [errorCarga, setErrorCarga] = useState('')
  const meses = useMemo(() => proximosMeses(new Date(), 12), [])
  const [hasta, setHasta] = useState(meses[2]) // por defecto, hasta fin del tercer mes (con noviembre: fin de enero)
  const [edicion, setEdicion] = useState(null)    // null = solo lectura
  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState('')

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('retenciones_saldos').select('*')
    if (error) {
      setFaltaTabla(!!tablaFaltante(error))
      setErrorCarga(tablaFaltante(error) ? '' : 'No se pudieron cargar los datos.')
      setFilas([])
      return
    }
    setFaltaTabla(false); setErrorCarga(''); setFilas(data ?? [])
  }, [])
  useEffect(() => { cargar() }, [cargar])

  // Solo se usa lo que se debe (pagar:*). Los saldos acumulados 'saldo:*' que pudieran estar en la tabla no se muestran.
  const { pagar, fechaDato: fechaDeudas } = useMemo(() => ordenarSaldos((filas ?? []).filter(f => String(f.clave).startsWith('pagar:'))), [filas])
  const proyeccion = useMemo(() => proyectarRetenciones(combinados), [combinados])
  const hastaMes = hasta === 'hoy' ? '0000-00' : hasta
  const porTipo = useMemo(() => resumenPorTipo({}, proyeccion.meses, hastaMes), [proyeccion, hastaMes])
  const impuestos = useMemo(() => resumenImpuestos(porTipo, pagar), [porTipo, pagar])

  const totalSuma = porTipo.reduce((s, t) => s + t.seSuma, 0)
  const totalIVA = porTipo.filter(t => t.clave === 'iva').reduce((s, t) => s + t.seSuma, 0)
  const hayDeudas = impuestos.some(g => g.debes > 0)
  const aPagar = impuestos.reduce((s, g) => s + Math.max(g.resultado, 0), 0)
  const sobra = impuestos.filter(g => g.debes > 0).reduce((s, g) => s + Math.max(-g.resultado, 0), 0)
  const etiquetaHasta = hasta === 'hoy' ? 'hoy' : `fin de ${fmtMes(hasta).toLowerCase()}`

  // Mes por mes: lo que se retiene cada mes por impuesto y lo acumulado desde hoy.
  const filasMes = useMemo(() => {
    let acumulado = 0
    return Object.keys(proyeccion.meses).sort().map(mes => {
      const t = proyeccion.meses[mes]
      const porGrupo = {}
      Object.entries(t).forEach(([tipo, monto]) => { const g = grupoDeTipo(tipo); porGrupo[g] = (porGrupo[g] ?? 0) + monto })
      const total = Object.values(t).reduce((s, v) => s + v, 0)
      acumulado += total
      return { mes, porGrupo, total, acumulado }
    })
  }, [proyeccion])
  const clientes = useMemo(() => Object.entries(proyeccion.porCliente).sort((a, b) => b[1].total - a[1].total), [proyeccion])

  function empezarEdicion() {
    const pag = {}
    TIPOS.forEach(t => { pag[t.clave] = aTexto(pagar[t.clave]) })
    setEdicion({ pagar: pag, fecha: hoyISO(), nota: '' })
    setErrorGuardar('')
  }
  async function guardar() {
    const filasNuevas = []
    for (const t of TIPOS) {
      const texto = edicion.pagar[t.clave]
      if (String(texto).trim() === '') continue // vacío = no se carga (queda como estaba)
      const n = aNumero(texto)
      if (!Number.isFinite(n) || n < 0) { setErrorGuardar(`Revisá lo que se debe de ${t.etiqueta}: tiene que ser un número (ej.: 97.407.239,52).`); return }
      filasNuevas.push({ clave: `pagar:${t.clave}`, monto: n, fecha: edicion.fecha, nota: edicion.nota.trim() || null })
    }
    if (!edicion.fecha) { setErrorGuardar('Poné la fecha a la que corresponden los datos.'); return }
    if (filasNuevas.length === 0) { setErrorGuardar('No cargaste ningún número.'); return }
    setGuardando(true); setErrorGuardar('')
    const { error } = await supabase.from('retenciones_saldos').upsert(filasNuevas, { onConflict: 'clave' })
    setGuardando(false)
    if (error) {
      setErrorGuardar(tablaFaltante(error) ? 'Falta crear la tabla: correr el script sql/retenciones_saldos.sql.' : 'No se pudo guardar. Probá de nuevo.')
      return
    }
    setEdicion(null)
    await cargar()
  }

  if (errorCaja) return <div className={`${CARD} p-6 text-sm text-rose-600`}>No se pudieron cargar las ventas para proyectar las retenciones.</div>
  if (filas === null || !combinados) return <p className="text-slate-400 text-sm">Cargando retenciones…</p>

  const inputCls = 'w-40 px-2 py-1 text-sm text-right rounded-md border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/25 tabular-nums'

  return (
    <div className="space-y-6">
      {faltaTabla && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold mb-0.5">Falta crear la tabla donde se guarda lo que se debe de cada impuesto.</p>
          Hay que correr el script <b>sql/retenciones_saldos.sql</b> en Supabase. Mientras tanto se ve solo lo que se va a retener con los cobros proyectados.
        </div>
      )}
      {errorCarga && <p className="text-sm text-rose-600">{errorCarga}</p>}

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Proyectar hasta</label>
          <select value={hasta} onChange={e => setHasta(e.target.value)}
            className="px-3 py-2 text-sm rounded-xl border border-slate-200 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/25">
            <option value="hoy">Hoy (sin sumar nada)</option>
            {meses.map(m => <option key={m} value={m}>Fin de {fmtMes(m).toLowerCase()}</option>)}
          </select>
        </div>
        <p className="text-xs text-slate-500 max-w-xl">
          Sale de {proyeccion.ventas} ventas todavía no cobradas, con la retención estimada de cada cliente.
          {fechaDeudas && <> Lo que se debe de cada impuesto fue cargado al <b>{fmtFecha(fechaDeudas)}</b>.</>}
        </p>
        {puedeEditar && !edicion && !faltaTabla && (
          <button onClick={empezarEdicion} className="ml-auto text-sm font-semibold text-white px-4 py-2 rounded-xl" style={{ backgroundColor: '#0e7490' }}>
            Cargar lo que se debe de impuestos
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Tarjeta titulo={`Se va a retener hasta ${etiquetaHasta}`} valor={fmtARS(totalSuma)} color="text-emerald-600" detalle="Con los cobros proyectados" />
        <Tarjeta titulo="De eso, adelanto de IVA" valor={fmtARS(totalIVA)} detalle="Solo NEC retiene IVA" />
        <Tarjeta titulo="Impuestos: vas a pagar" valor={hayDeudas ? fmtARS(aPagar) : '—'} color={aPagar > 0 ? 'text-rose-600' : 'text-slate-900'}
          detalle={!hayDeudas ? 'Cargá lo que se debe de cada impuesto' : sobra > 0 ? `En los que debés, te sobran ${fmtARS(sobra)} de retenciones` : 'Después de descontar las retenciones'} />
      </div>

      {edicion && (
        <div className={`${CARD} p-5`}>
          <p className="text-sm font-bold text-slate-900">Lo que se debe hoy de cada impuesto</p>
          <p className="text-xs text-slate-400 mt-0.5 mb-3">
            Cargalo con lo que te diga tu contador. El IIBB va por provincia: una retención de Santa Fe solo se descuenta del IIBB de Santa Fe.
            Lo que dejes vacío queda como estaba. Se aceptan números como 97.407.239,52.
          </p>
          <div className="max-w-xl">
            {TIPOS.map(t => (
              <label key={t.clave} className="flex items-center justify-between gap-3 py-1 text-sm text-slate-700">
                {t.etiqueta}
                <input className={inputCls} inputMode="decimal" value={edicion.pagar[t.clave]}
                  onChange={e => setEdicion(x => ({ ...x, pagar: { ...x.pagar, [t.clave]: e.target.value } }))} />
              </label>
            ))}
            <label className="flex items-center justify-between gap-3 py-1 mt-3 text-sm text-slate-700">
              Fecha de los datos
              <input type="date" className="px-2 py-1 text-sm rounded-md border border-slate-300 bg-white" value={edicion.fecha}
                onChange={e => setEdicion(x => ({ ...x, fecha: e.target.value }))} />
            </label>
            <label className="block py-1 text-sm text-slate-700">
              Nota (de dónde salieron)
              <input className="mt-1 w-full px-2 py-1 text-sm rounded-md border border-slate-300 bg-white" value={edicion.nota} placeholder="Ej.: Según el contador al 30/11"
                onChange={e => setEdicion(x => ({ ...x, nota: e.target.value }))} />
            </label>
          </div>
          {errorGuardar && <p className="text-sm text-rose-600 font-semibold mt-3">{errorGuardar}</p>}
          <div className="mt-4 flex items-center gap-3">
            <button onClick={guardar} disabled={guardando} className="text-sm font-semibold text-white px-4 py-2 rounded-xl disabled:opacity-50" style={{ backgroundColor: '#0e7490' }}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
            <button onClick={() => { setEdicion(null); setErrorGuardar('') }} disabled={guardando} className="text-sm font-semibold text-slate-500 hover:text-slate-800">Cancelar</button>
          </div>
        </div>
      )}

      <div className={`${CARD} overflow-hidden`}>
        <div className="px-5 pt-4 pb-2"><p className="text-sm font-bold text-slate-900">Cuánto se va a retener, por tipo</p></div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-slate-100 bg-slate-50/70"><Th>Retención</Th><Th derecha>Hasta {etiquetaHasta}</Th></tr></thead>
            <tbody>
              {porTipo.filter(t => t.seSuma !== 0).map(t => (
                <tr key={t.clave} className="border-b border-slate-100/80 last:border-0">
                  <Td>{t.etiqueta}</Td><Td derecha>{fmtARS(t.seSuma)}</Td>
                </tr>
              ))}
              {totalSuma === 0 && <tr><td colSpan={2} className="px-3.5 py-4 text-sm text-slate-400">No hay retenciones proyectadas hasta esa fecha.</td></tr>}
              <tr className="border-t border-slate-200 bg-slate-50/50"><Td fuerte>Total</Td><Td derecha fuerte>{fmtARS(totalSuma)}</Td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="px-5 pt-4 pb-2">
          <p className="text-sm font-bold text-slate-900">¿Cuánto voy a pagar de impuestos?</p>
          <p className="text-xs text-slate-400 mt-0.5">Lo que se debe hoy de cada impuesto, menos lo que se va a retener del mismo tipo {hasta === 'hoy' ? 'hoy' : `hasta ${etiquetaHasta}`}. Solo cuenta lo que cargues como deuda; no incluye impuestos que todavía no se generaron.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-slate-100 bg-slate-50/70"><Th>Impuesto</Th><Th derecha>Se debe hoy</Th><Th derecha>Retenciones que se suman</Th><Th derecha>Resultado</Th></tr></thead>
            <tbody>
              {!hayDeudas && (
                <tr><td colSpan={4} className="px-3.5 py-4 text-sm text-slate-400">Todavía no cargaste lo que se debe de cada impuesto. Con el botón "Cargar lo que se debe de impuestos" lo ponés (idealmente con tu contador) y acá se ve cuánto pagarías.</td></tr>
              )}
              {hayDeudas && impuestos.filter(g => g.debes !== 0).map(g => (
                <tr key={g.clave} className="border-b border-slate-100/80 last:border-0">
                  <Td>{g.etiqueta}</Td><Td derecha>{fmtARS(g.debes)}</Td><Td derecha>{fmtARS(g.aFavor)}</Td>
                  <Td derecha fuerte className={g.estado === 'pagar' ? 'text-rose-600' : g.estado === 'a_favor' ? 'text-emerald-600' : ''}>
                    {g.estado === 'pagar' ? `Pagás ${fmtARS(g.resultado)}` : g.estado === 'a_favor' ? `Te sobra ${fmtARS(-g.resultado)}` : 'Parejo'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="px-5 pt-4 pb-2"><p className="text-sm font-bold text-slate-900">Mes por mes: cuánto se retiene con los cobros proyectados</p></div>
        {filasMes.length === 0 ? <p className="px-5 pb-4 text-sm text-slate-400">No hay cobros proyectados con retenciones.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-slate-100 bg-slate-50/70"><Th>Mes</Th>{GRUPOS.filter(g => g.clave !== 'otras').map(g => <Th key={g.clave} derecha>{g.clave === 'iibb' ? 'IIBB' : g.etiqueta}</Th>)}<Th derecha>Total del mes</Th><Th derecha>Acumulado desde hoy</Th></tr></thead>
              <tbody>
                {filasMes.map(f => (
                  <tr key={f.mes} className="border-b border-slate-100/80 last:border-0">
                    <Td>{fmtMes(f.mes)}</Td>
                    {GRUPOS.filter(g => g.clave !== 'otras').map(g => <Td key={g.clave} derecha>{f.porGrupo[g.clave] ? fmtARS(f.porGrupo[g.clave]) : '—'}</Td>)}
                    <Td derecha fuerte>{fmtARS(f.total)}</Td><Td derecha>{fmtARS(f.acumulado)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="px-5 pt-4 pb-2"><p className="text-sm font-bold text-slate-900">Quién nos retiene: ventas pendientes por cliente</p></div>
        {clientes.length === 0 ? <p className="px-5 pb-4 text-sm text-slate-400">No hay ventas pendientes.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-slate-100 bg-slate-50/70"><Th>Cliente</Th><Th derecha>Ventas pendientes</Th><Th derecha>Va a retener</Th><Th derecha>De eso, IVA</Th></tr></thead>
              <tbody>
                {clientes.map(([nombre, c]) => (
                  <tr key={nombre} className="border-b border-slate-100/80 last:border-0">
                    <Td>{nombre}</Td><Td derecha>{c.ventas}</Td><Td derecha fuerte>{fmtARS(c.total)}</Td><Td derecha>{c.iva ? fmtARS(c.iva) : '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white/60 px-4 py-3 text-xs text-slate-500 space-y-1">
        <p><b>Cómo leerlo:</b> las retenciones no son plata perdida: son un adelanto de impuestos que se descuenta de lo que se debe. La de IVA (solo NEC) es un adelanto de IVA.</p>
        <p><b>Es un estimado.</b> Usa las alícuotas de cada cliente, que se pueden ajustar en el Cash Flow. No incluye las retenciones que ya se acumularon antes de hoy. Lo que figura en AFIP y en las declaraciones juradas puede ser distinto: confirmarlo con el contador.</p>
      </div>
    </div>
  )
}

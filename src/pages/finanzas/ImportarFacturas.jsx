// pages/finanzas/ImportarFacturas.jsx
// Importación masiva de facturas desde el Excel "PROYECCION DE PAGOS" (hoja "Facturas a pagar").
// Exclusivo de Santiago Verdinelli (ver lib/permisos.js).
//
// Flujo: copiar filas en Excel → pegarlas acá → se comparan con lo ya cargado en el Cash Flow →
// vista previa (verde = nueva, rojo = ya cargada, ámbar = revisar, gris = no importable) → confirmar.
// Las facturas se guardan con los mismos campos y reglas que "Nuevo movimiento": como son facturas de egreso con
// obra + rubro + período, el Cash Flow las descuenta solo del gasto proyectado de Operaciones.

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { traerTodo } from '../../lib/traerTodo'
import { analizarPegado, resumir, avisoPresupuesto, construirMovimiento } from '../../lib/importarFacturas'
import SidebarFinanzas, { CLASE_SIDEBAR } from './components/SidebarFinanzas'
import { CARD, TONOS, Icono, ICONOS, ico, CardResumen as CardPremium, CLS_LABEL, CargandoPremium, fmtARS, fmtFecha, hoyISO } from '../directorio/utilsDirectorio'

const ESTILOS = {
  nueva:   { fila: 'bg-emerald-50/70 hover:bg-emerald-50', chip: 'bg-emerald-100 text-emerald-700', texto: 'Nueva' },
  cargada: { fila: 'bg-rose-50/70 hover:bg-rose-50',       chip: 'bg-rose-100 text-rose-700',       texto: 'Ya cargada' },
  revisar: { fila: 'bg-amber-50/70 hover:bg-amber-50',     chip: 'bg-amber-100 text-amber-800',     texto: 'Revisar' },
  omitida: { fila: 'bg-slate-50 hover:bg-slate-100/70 text-slate-500', chip: 'bg-slate-200 text-slate-600', texto: 'No aplica' },
  error:   { fila: 'bg-slate-50 hover:bg-slate-100/70 text-slate-500', chip: 'bg-slate-300 text-slate-700', texto: 'Error' },
}

export default function ImportarFacturas() {
  const { user, perfil } = useAuth()
  const [texto, setTexto] = useState('')
  const [base, setBase] = useState(null)
  const [errorBase, setErrorBase] = useState('')
  const [elegidas, setElegidas] = useState(new Set())
  const [filtro, setFiltro] = useState('todas')
  const [confirmando, setConfirmando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [detalleAbierto, setDetalleAbierto] = useState(null)

  // Todo lo que hace falta para comparar: obras, rubros, cuenta, facturas ya cargadas y presupuestos.
  const cargarBase = useCallback(async () => {
    setErrorBase('')
    try {
      const [obras, rubros, cuentas, movs, pres] = await Promise.all([
        traerTodo(() => supabase.from('obras').select('id, codigo, activa').order('id')),
        traerTodo(() => supabase.from('rubros').select('id, nombre, tipo, activo').order('id')),
        supabase.from('cuentas').select('id, nombre').order('nombre'),
        traerTodo(() => supabase.from('movimientos')
          .select('id, proveedor_cliente, numero_factura, monto_bruto, estado, fecha_pago, periodo, obra_id, rubro_id')
          .eq('categoria', 'factura').eq('tipo', 'egreso').order('id')),
        traerTodo(() => supabase.from('presupuestos').select('id, obra_id, rubro_id, periodo, monto').order('id')),
      ])
      const falla = [obras, rubros, cuentas, movs, pres].find(r => r.error)
      if (falla) throw falla.error
      const codigoDe = Object.fromEntries(obras.data.map(o => [o.id, o.codigo]))
      // Código de obra → id, solo obras activas (hay códigos repetidos con una versión inactiva).
      const obrasPorCodigo = {}
      const repetidas = new Set()
      obras.data.filter(o => o.activa).forEach(o => { if (o.codigo in obrasPorCodigo) repetidas.add(o.codigo); obrasPorCodigo[o.codigo] = o.id })
      repetidas.forEach(c => { delete obrasPorCodigo[c] })
      const rubrosPorNombre = {}
      rubros.data.filter(r => r.tipo === 'obra' && r.activo).forEach(r => { rubrosPorNombre[r.nombre] = r.id })
      const cuenta = cuentas.data.find(c => c.nombre === 'Galicia') ?? (cuentas.data.length === 1 ? cuentas.data[0] : null)
      setBase({
        obrasPorCodigo, rubrosPorNombre, cuentaId: cuenta?.id ?? null,
        existentes: movs.data.map(m => ({ ...m, obraCodigo: codigoDe[m.obra_id] ?? null })),
        presupuestos: pres.data,
      })
      return true
    } catch (e) {
      setErrorBase('No se pudieron cargar los datos del Cash Flow para comparar. Recargá la página.')
      return false
    }
  }, [])

  useEffect(() => { cargarBase() }, [cargarBase])

  const analisis = useMemo(() => {
    if (!base || !texto.trim()) return null
    return analizarPegado(texto, base.existentes, { hoyISO: hoyISO(), obrasPorCodigo: base.obrasPorCodigo, rubrosPorNombre: base.rubrosPorNombre })
  }, [texto, base])

  // Las nuevas arrancan tildadas; las de revisión, no.
  useEffect(() => {
    setElegidas(new Set((analisis?.filas ?? []).filter(f => f.estado === 'nueva').map(f => f.n)))
    setResultado(null)
  }, [analisis])

  // Aviso de presupuesto (igual al del formulario), acumulando lo que ya suman las otras filas del lote.
  const avisos = useMemo(() => {
    const r = {}
    if (!analisis || !base) return r
    const acumulado = {}
    const reales = base.existentes.filter(m => m.obra_id)
    analisis.filas.filter(f => f.estado === 'nueva' || f.estado === 'revisar').forEach(f => {
      const obraId = base.obrasPorCodigo[f.obra], rubroId = base.rubrosPorNombre[f.rubro]
      if (!obraId || !rubroId) return
      const k = `${obraId}|${rubroId}|${f.periodo}`
      const a = avisoPresupuesto(f, obraId, rubroId, base.presupuestos, reales, acumulado[k] ?? 0)
      if (a) r[f.n] = a
      if (elegidas.has(f.n)) acumulado[k] = (acumulado[k] ?? 0) + f.monto
    })
    return r
  }, [analisis, base, elegidas])

  const filas = analisis?.filas ?? []
  const resumen = useMemo(() => resumir(filas), [filas])
  const visibles = filtro === 'todas' ? filas : filas.filter(f => f.estado === filtro || (filtro === 'otras' && (f.estado === 'omitida' || f.estado === 'error')))
  const aImportar = filas.filter(f => elegidas.has(f.n) && (f.estado === 'nueva' || f.estado === 'revisar'))
  const montoAImportar = Math.round(aImportar.reduce((s, f) => s + f.monto, 0) * 100) / 100

  const alternar = n => setElegidas(s => { const x = new Set(s); x.has(n) ? x.delete(n) : x.add(n); return x })

  // Importación: se vuelve a leer lo cargado y se repite la detección de duplicados justo antes de guardar.
  async function importar() {
    setImportando(true); setResultado(null)
    const ok = await cargarBase()
    if (!ok) { setImportando(false); setConfirmando(false); return }
    // Se relee directo de la base (el estado de React todavía no tiene lo nuevo).
    const [obras, movs] = await Promise.all([
      traerTodo(() => supabase.from('obras').select('id, codigo').order('id')),
      traerTodo(() => supabase.from('movimientos')
        .select('id, proveedor_cliente, numero_factura, monto_bruto, estado, fecha_pago, periodo, obra_id, rubro_id')
        .eq('categoria', 'factura').eq('tipo', 'egreso').order('id')),
    ])
    if (obras.error || movs.error) { setResultado({ error: 'No se pudo verificar lo ya cargado. No se importó nada.' }); setImportando(false); setConfirmando(false); return }
    const codigoDe = Object.fromEntries(obras.data.map(o => [o.id, o.codigo]))
    const existentes = movs.data.map(m => ({ ...m, obraCodigo: codigoDe[m.obra_id] ?? null }))
    const nuevo = analizarPegado(texto, existentes, { hoyISO: hoyISO(), obrasPorCodigo: base.obrasPorCodigo, rubrosPorNombre: base.rubrosPorNombre })
    const porN = Object.fromEntries(nuevo.filas.map(f => [f.n, f]))

    const omitidas = []
    const listas = []
    aImportar.forEach(f => {
      const ahora = porN[f.n]
      if (!ahora || ahora.estado === 'cargada' || ahora.estado === 'error' || ahora.estado === 'omitida') omitidas.push({ f, motivo: ahora?.motivos?.[0] ?? 'ya no se puede importar' })
      else listas.push(ahora)
    })

    if (!base.cuentaId) { setResultado({ error: 'No se encontró la cuenta Galicia. No se importó nada.' }); setImportando(false); setConfirmando(false); return }
    let cargadas = 0, error = null
    if (listas.length) {
      const registros = listas.map(f => construirMovimiento(f, {
        obraId: base.obrasPorCodigo[f.obra], rubroId: base.rubrosPorNombre[f.rubro], cuentaId: base.cuentaId, userId: user.id,
      }))
      const { error: err } = await supabase.from('movimientos').insert(registros)
      if (err) error = 'Hubo un error al guardar. No se cargó ninguna factura (se guarda todo junto o nada).'
      else cargadas = registros.length
    }
    setResultado({ cargadas, omitidas, error, monto: cargadas ? Math.round(listas.reduce((s, f) => s + f.monto, 0) * 100) / 100 : 0 })
    setImportando(false); setConfirmando(false)
    await cargarBase() // las recién cargadas pasan a rojo
  }

  const CHIPS = [
    ['todas', `Todas (${resumen.total})`],
    ['nueva', `Nuevas (${resumen.nueva})`],
    ['cargada', `Ya cargadas (${resumen.cargada})`],
    ['revisar', `Revisar (${resumen.revisar})`],
    ['otras', `No importables (${resumen.omitida + resumen.error})`],
  ]

  return (
    <div className={`min-h-screen ${CLASE_SIDEBAR}`} style={{ backgroundColor: '#f0f7fa' }}>
      <SidebarFinanzas perfil={perfil} activo="importar" />
      <main className="px-5 sm:px-8 py-8 lg:py-10 max-w-[1600px] space-y-6">

        <div className="flex items-start gap-4">
          <span className={`w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center ${TONOS.teal}`}><Icono {...ICONOS.subir} className="w-6 h-6" /></span>
          <div>
            <h1 className="text-slate-900 text-2xl font-extrabold tracking-tight">Importar facturas</h1>
            <p className="text-slate-400 text-sm mt-0.5">Copiá las filas de "Facturas a pagar" del Excel, pegalas acá y cargá de una vez las que todavía no están en el Cash Flow.</p>
          </div>
        </div>

        {errorBase && <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3">{errorBase}</div>}

        {/* Pegar */}
        <div className={`${CARD} p-5 sm:p-6`}>
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <label className={`${CLS_LABEL} !mb-0`}>1 · Pegá las filas copiadas del Excel (con o sin la fila de encabezados)</label>
            {texto && (
              <button onClick={() => { setTexto(''); setResultado(null); setFiltro('todas') }}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 transition-colors">
                Limpiar
              </button>
            )}
          </div>
          <textarea value={texto} onChange={e => setTexto(e.target.value)} spellCheck={false} rows={texto ? 5 : 7}
            placeholder={'Seleccioná en Excel las filas (columnas A a O: FACTURA … APROBADOR), copiá con Ctrl+C y pegá acá con Ctrl+V.'}
            className="w-full font-mono text-[11.5px] leading-relaxed px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-700 placeholder:text-slate-300
                       focus:outline-none focus:ring-2 focus:ring-teal-500/25 focus:border-teal-400 whitespace-pre overflow-x-auto" />
          {!base && !errorBase && <p className="text-xs text-slate-400 mt-2">Cargando lo ya cargado en el Cash Flow para comparar…</p>}
          {analisis && analisis.faltan.length > 0 && (
            <p className="text-xs text-red-600 mt-2">Faltan columnas necesarias: {analisis.faltan.join(', ')}. Copiá también la fila de encabezados o todas las columnas A–O.</p>
          )}
          {analisis && !analisis.conEncabezado && <p className="text-xs text-slate-400 mt-2">Sin fila de encabezados: se asumió el orden de la hoja (A a O).</p>}
        </div>

        {!analisis && base && (
          <div className={`${CARD} p-5 sm:p-6`}>
            <h2 className="text-slate-900 font-bold text-sm mb-3">Cómo se interpreta cada fila</h2>
            <ul className="text-sm text-slate-500 space-y-1.5 list-disc pl-5">
              <li><b className="text-slate-700">Fecha de pago:</b> columna <i>cash flow</i>. <b className="text-slate-700">Período:</b> columna <i>Periodo Facturado</i>.</li>
              <li>Solo se importan las filas con <b className="text-slate-700">ESTADO PAGO = PENDIENTE</b>. Las marcadas <i>OK</i> o sin estado no se tocan.</li>
              <li>Rubros: GASTOS OPERATIVOS y EPP → Otros Gastos Operativos · ALQ SEG HYS OTROS GASTOS → Gastos Generales · SUBCONTRATO, MATERIALES, VEHICULOS, IMPUESTOS → su rubro.</li>
              <li>Se cargan como <b className="text-slate-700">egreso proyectado</b>, cuenta Galicia, igual que desde "Nuevo movimiento". Descuentan solas del gasto proyectado de Operaciones.</li>
              <li>Una factura es <b className="text-slate-700">duplicada</b> si coinciden proveedor + número de factura + obra + importe. Mismo importe con distinto número <b className="text-slate-700">no</b> lo es. Ante la duda queda en <span className="text-amber-700 font-semibold">Revisar</span>.</li>
            </ul>
          </div>
        )}

        {analisis && filas.length > 0 && (
          <>
            {/* Resumen */}
            <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
              <CardPremium label="Detectadas" valor={String(resumen.total)} icono={ico('lista')} tono="teal" color="text-slate-900" subLabel="Filas pegadas" />
              <CardPremium label="Nuevas" valor={String(resumen.nueva)} icono={ico('subir')} tono="emerald" color="text-emerald-600" subLabel={fmtARS(resumen.montoNuevas)} />
              <CardPremium label="Ya cargadas" valor={String(resumen.cargada)} icono={ico('bajar')} tono="rose" color="text-rose-600" subLabel="No se importan" />
              <CardPremium label="A revisar" valor={String(resumen.revisar)} icono={ico('calendario')} tono="amber" color="text-amber-600" subLabel="Decidís vos" />
              <CardPremium label="No importables" valor={String(resumen.omitida + resumen.error)} icono={ico('billetera')} tono="violet" color="text-slate-900" subLabel="Pagadas, vacías o con error" />
            </div>

            {/* Vista previa */}
            <div className={`${CARD} overflow-hidden`}>
              <div className="px-5 pt-5 pb-3 flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-slate-900 font-bold text-sm">2 · Revisá la vista previa</h2>
                <div className="inline-flex flex-wrap rounded-xl border border-slate-200 bg-slate-50/70 p-0.5">
                  {CHIPS.map(([k, t]) => (
                    <button key={k} onClick={() => setFiltro(k)}
                      className={`px-3 py-1.5 rounded-[10px] text-xs font-semibold transition-colors ${filtro === k ? 'bg-teal-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-slate-100 bg-slate-50/60">
                      {['', 'Estado', 'Fila', 'Proveedor', 'Nº factura', 'Obra', 'Rubro', 'Período', 'Fecha pago', 'Importe', 'Detalle'].map((h, i) => (
                        <th key={i} className={`px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap ${h === 'Importe' ? 'text-right' : 'text-left'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map(f => {
                      const e = ESTILOS[f.estado]
                      const importable = f.estado === 'nueva' || f.estado === 'revisar'
                      const abierto = detalleAbierto === f.n
                      return (
                        <FilaTabla key={f.n} f={f} e={e} importable={importable} marcada={elegidas.has(f.n)} onMarcar={() => alternar(f.n)}
                          aviso={avisos[f.n]} abierto={abierto} onAbrir={() => setDetalleAbierto(abierto ? null : f.n)} />
                      )
                    })}
                    {visibles.length === 0 && <tr><td colSpan={11} className="px-5 py-10 text-center text-slate-400 text-sm">No hay filas en este filtro.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Confirmar */}
            <div className={`${CARD} p-5 sm:p-6 flex items-center justify-between gap-4 flex-wrap`}>
              <div>
                <p className="text-slate-900 font-bold text-sm">3 · Confirmar</p>
                <p className="text-slate-400 text-xs mt-0.5">
                  {aImportar.length
                    ? <>Se van a cargar <b className="text-slate-700">{aImportar.length}</b> factura{aImportar.length === 1 ? '' : 's'} por <b className="text-slate-700">{fmtARS(montoAImportar)}</b>
                        {aImportar.some(f => f.estado === 'revisar') && <> (incluye {aImportar.filter(f => f.estado === 'revisar').length} que marcaste de "Revisar")</>}. Antes de guardar se vuelve a comprobar que ninguna esté ya cargada.</>
                    : 'No hay facturas seleccionadas para importar.'}
                </p>
              </div>
              <button disabled={!aImportar.length || importando || !base?.cuentaId} onClick={() => setConfirmando(true)}
                className="inline-flex items-center gap-2 text-white text-sm font-semibold px-6 py-3 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_6px_16px_rgba(14,116,144,0.28)] hover:brightness-90"
                style={{ backgroundColor: '#0e7490' }}>
                Importar {aImportar.length || ''} factura{aImportar.length === 1 ? '' : 's'}
              </button>
            </div>
          </>
        )}

        {analisis && filas.length === 0 && <div className={`${CARD} p-6 text-sm text-slate-500`}>No se detectó ninguna fila. Revisá que hayas copiado desde la hoja "Facturas a pagar".</div>}

        {/* Resultado */}
        {resultado && (
          <div className={`${CARD} p-5 sm:p-6 border-l-4 ${resultado.error ? 'border-l-rose-400' : 'border-l-emerald-400'}`}>
            {resultado.error ? (
              <p className="text-rose-700 text-sm font-semibold">{resultado.error}</p>
            ) : (
              <p className="text-emerald-700 text-sm font-semibold">
                Listo: se cargaron {resultado.cargadas} factura{resultado.cargadas === 1 ? '' : 's'} por {fmtARS(resultado.monto)}.
              </p>
            )}
            {resultado.omitidas?.length > 0 && (
              <div className="mt-3">
                <p className="text-amber-700 text-sm font-semibold">{resultado.omitidas.length} no se cargaron porque ya estaban cargadas (alguien las cargó mientras revisabas):</p>
                <ul className="text-xs text-slate-500 mt-1 list-disc pl-5">
                  {resultado.omitidas.map(({ f, motivo }) => <li key={f.n}>Fila {f.n} · {f.proveedor} · {f.nro ?? 'sin nº'} · {fmtARS(f.monto)} — {motivo}</li>)}
                </ul>
              </div>
            )}
            {!resultado.error && <p className="text-slate-400 text-xs mt-2">Las facturas cargadas ya figuran en rojo en la tabla y descuentan del gasto proyectado en el Cash Flow.</p>}
          </div>
        )}
      </main>

      {confirmando && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-[0_24px_60px_rgba(15,23,42,0.25)] w-full max-w-md p-6">
            <h3 className="text-slate-900 font-extrabold text-base">¿Cargar {aImportar.length} factura{aImportar.length === 1 ? '' : 's'}?</h3>
            <p className="text-slate-500 text-sm mt-2">Por <b className="text-slate-800">{fmtARS(montoAImportar)}</b>, como egresos proyectados en el Cash Flow. Se guardan todas juntas o ninguna.</p>
            <div className="flex gap-3 mt-5">
              <button onClick={importar} disabled={importando}
                className="flex-1 text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-60 inline-flex items-center justify-center gap-2"
                style={{ backgroundColor: '#0e7490' }}>
                {importando && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {importando ? 'Verificando y cargando…' : 'Sí, cargar'}
              </button>
              <button onClick={() => setConfirmando(false)} disabled={importando}
                className="flex-1 border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-600 text-sm font-semibold py-2.5 rounded-xl">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FilaTabla({ f, e, importable, marcada, onMarcar, aviso, abierto, onAbrir }) {
  const hayDetalle = f.motivos.length > 0 || f.coincidencias.length > 0 || aviso
  return (
    <>
      <tr className={`border-b border-white/70 transition-colors ${e.fila}`}>
        <td className="px-4 py-3">
          {importable
            ? <input type="checkbox" checked={marcada} onChange={onMarcar} className="w-4 h-4 accent-teal-700 cursor-pointer" aria-label="Importar esta factura" />
            : <span className="block w-4" />}
        </td>
        <td className="px-4 py-3 whitespace-nowrap"><span className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg ${e.chip}`}>{e.texto}</span></td>
        <td className="px-4 py-3 text-slate-400 tabular-nums">{f.n}</td>
        <td className="px-4 py-3 font-semibold text-slate-800 max-w-[260px] truncate" title={f.proveedor}>{f.proveedor || '—'}</td>
        <td className="px-4 py-3 whitespace-nowrap">{f.nro ?? '—'}</td>
        <td className="px-4 py-3 whitespace-nowrap">{f.obraExcel || '—'}</td>
        <td className="px-4 py-3 whitespace-nowrap">{f.rubro ?? f.rubroExcel ?? '—'}</td>
        <td className="px-4 py-3 whitespace-nowrap">{f.periodo ? f.periodo.slice(0, 7) : '—'}</td>
        <td className="px-4 py-3 whitespace-nowrap">{f.fechaPago ? fmtFecha(f.fechaPago) : '—'}</td>
        <td className="px-4 py-3 text-right font-semibold tabular-nums whitespace-nowrap">{f.monto != null ? fmtARS(f.monto) : '—'}</td>
        <td className="px-4 py-3 text-xs">
          {hayDetalle
            ? <button onClick={onAbrir} className="text-left underline-offset-2 hover:underline">{abierto ? 'Ocultar' : (f.motivos[0] ?? (aviso ? 'Supera el presupuesto' : 'Ver detalle'))}{aviso && !abierto && ' · supera presupuesto'}</button>
            : <span className="text-slate-300">—</span>}
        </td>
      </tr>
      {abierto && (
        <tr className={`border-b border-white/70 ${e.fila}`}>
          <td />
          <td colSpan={10} className="px-4 pb-3 text-xs space-y-1">
            {f.motivos.map((m, i) => <p key={i}>• {m}</p>)}
            {aviso && <p className="text-amber-700">• Con esta factura el gasto real supera lo presupuestado para esta obra, rubro y período ({fmtARS(aviso.gastado + aviso.nuevo)} de {fmtARS(aviso.presupuestado)}). No bloquea la carga.</p>}
            {f.coincidencias.length > 0 && <div className="pt-1"><p className="font-semibold">Ya en el Cash Flow:</p>{f.coincidencias.map((c, i) => <p key={i} className="text-slate-500">· {c}</p>)}</div>}
          </td>
        </tr>
      )}
    </>
  )
}

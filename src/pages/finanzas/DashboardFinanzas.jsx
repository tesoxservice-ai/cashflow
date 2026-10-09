// pages/finanzas/DashboardFinanzas.jsx
// Inicio de Finanzas. Ruta: /finanzas
//
// Barra lateral con todos los módulos y, en el centro, la evolución de la caja
// (el mismo gráfico del panel del Directorio, solo lectura) con los indicadores
// de posición debajo.

import { useState, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import SidebarFinanzas, { CLASE_SIDEBAR } from './components/SidebarFinanzas'
import GraficoCashflow from '../directorio/GraficoCashflow'
import { opcionesMetrica, serieMetrica } from '../directorio/escenarios'
import { CARD, Icono, ICONOS, ico, CardResumen, fmtARS, fmtFecha, hoyISO, fechaFutura } from '../directorio/utilsDirectorio'
import useCajaBase from '../../lib/useCajaBase'

const RANGOS = [[30, '30 días'], [60, '60 días'], [90, '90 días'], [180, '6 meses'], [365, '1 año']]

function Segmentado({ opciones, valor, onChange }) {
  return (
    <div className="inline-flex max-w-full flex-wrap rounded-xl border border-slate-200 bg-slate-50/70 p-0.5 text-[11px] sm:text-xs font-semibold">
      {opciones.map(([v, texto]) => (
        <button key={v} onClick={() => onChange(v)}
          className={`px-2 sm:px-3 py-1.5 rounded-[10px] whitespace-nowrap transition-colors
            ${valor === v ? 'bg-emerald-100 text-emerald-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          {texto}
        </button>
      ))}
    </div>
  )
}

export default function DashboardFinanzas() {
  const { perfil } = useAuth()
  const { base, resultado, cargando, error } = useCajaBase()
  const [horizonte, setHorizonte] = useState(90)
  const [metricaSel, setMetrica] = useState('banco')

  const opciones = useMemo(() => (base ? opcionesMetrica(base) : []), [base])
  const metrica = opciones.some(o => o.id === metricaSel) ? metricaSel : 'banco'
  const tituloMetrica = opciones.find(o => o.id === metrica)?.titulo ?? 'Caja (bancos)'

  const n = horizonte + 1
  const valores = useMemo(() => (resultado ? serieMetrica(resultado, metrica).slice(0, n) : []), [resultado, metrica, n])
  const fechas = useMemo(() => (base ? base.fechas.slice(0, n) : []), [base, n])

  // Punto más alto y más bajo del período que se está mirando
  const extremos = useMemo(() => {
    if (!valores.length) return null
    let mx = 0, mn = 0
    valores.forEach((v, i) => { if (v > valores[mx]) mx = i; if (v < valores[mn]) mn = i })
    return { max: { valor: valores[mx], fecha: fechas[mx] }, min: { valor: valores[mn], fecha: fechas[mn] } }
  }, [valores, fechas])

  const colorDe = v => (v >= 0 ? 'text-slate-900' : 'text-red-600')
  const hoyLargo = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const hoyTexto = hoyLargo.charAt(0).toUpperCase() + hoyLargo.slice(1)

  return (
    <div className={`min-h-screen ${CLASE_SIDEBAR}`} style={{ backgroundColor: '#f0f7fa' }}>
      <SidebarFinanzas perfil={perfil} activo="inicio" />

      <main className="px-5 sm:px-8 py-8 lg:py-10">
        <div className="max-w-[1600px] space-y-6">

          {/* Encabezado */}
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <p className="text-slate-500 text-sm font-medium mb-0.5">Bienvenido,</p>
              <h1 className="text-slate-900 text-3xl font-extrabold tracking-tight leading-none">
                {perfil ? `${perfil.nombre} ${perfil.apellido}` : '—'}
              </h1>
              <p className="text-slate-400 text-sm mt-2">Posición de caja y evolución proyectada, en tiempo real.</p>
            </div>
            <span className="inline-flex items-center gap-2 bg-white border border-slate-100 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-500 shadow-sm">
              <Icono {...ICONOS.calendario} className="w-4 h-4 text-slate-400" />
              {hoyTexto}
            </span>
          </div>

          {error && <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}

          {/* Gráfico de la caja */}
          <div className={`${CARD} p-5 sm:p-6`}>
            <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
              <div>
                <h2 className="text-slate-900 font-bold text-base flex items-center gap-2">
                  Evolución del saldo proyectado
                  <span className="text-slate-300 cursor-help"
                    title="Lo que hay hoy en el banco, más los ingresos y egresos reales y proyectados de cada fecha.">
                    <Icono {...ICONOS.info} className="w-4 h-4" />
                  </span>
                </h2>
                <p className="text-slate-400 text-xs mt-1">
                  {tituloMetrica} · desde el {fmtFecha(hoyISO())} hasta {fmtFecha(fechaFutura(horizonte))}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {opciones.length > 0 && (
                  <Segmentado opciones={opciones.map(o => [o.id, o.texto])} valor={metrica} onChange={setMetrica} />
                )}
                <Segmentado opciones={RANGOS} valor={horizonte} onChange={setHorizonte} />
              </div>
            </div>

            {cargando ? (
              <div className="flex items-center justify-center h-64 text-slate-400 text-sm gap-3">
                <span className="w-4 h-4 border-2 border-slate-200 border-t-cyan-600 rounded-full animate-spin" />
                Calculando la caja…
              </div>
            ) : (
              <GraficoCashflow fechas={fechas} actual={valores} />
            )}
          </div>

          {/* Indicadores */}
          {resultado && base && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {[
                  { dias: 0, label: 'Saldo hoy', icono: 'billetera', sub: tituloMetrica },
                  { dias: 30, label: 'Posición a 30 días', icono: 'tendencia' },
                  { dias: 60, label: 'Posición a 60 días', icono: 'calendario' },
                  { dias: 90, label: 'Posición a 90 días', icono: 'calendario' },
                ].map(c => {
                  const v = serieMetrica(resultado, metrica)[c.dias]
                  return (
                    <CardResumen key={c.label} label={c.label} valor={fmtARS(v)} icono={ico(c.icono)} tono="teal"
                      color={colorDe(v)} subLabel={c.sub ?? `Al ${fmtFecha(fechaFutura(c.dias))}`} />
                  )
                })}
              </div>

              {extremos && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <CardResumen label="Punto más alto del período" valor={fmtARS(extremos.max.valor)} icono={ico('subir')} tono="emerald"
                    color="text-emerald-600" subLabel={`El ${fmtFecha(extremos.max.fecha)}`} />
                  <CardResumen label="Punto más bajo del período" valor={fmtARS(extremos.min.valor)} icono={ico('bajar')} tono="rose"
                    color={extremos.min.valor >= 0 ? 'text-emerald-600' : 'text-red-600'} subLabel={`El ${fmtFecha(extremos.min.fecha)}`} />
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

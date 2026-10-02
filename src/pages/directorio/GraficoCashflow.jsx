// pages/directorio/GraficoCashflow.jsx
// Gráfico del Cash Flow del Directorio. Muestra una sola línea "principal"
// (verde sobre cero, roja bajo cero): la real, o la del escenario simulado que
// se está mirando. Cuando hay un escenario activo, la real queda de referencia,
// finita y gris. Al hacer click en una fecha se elige ese día para simular.

import { useState } from 'react'
import { fmtARS, fmtFecha, fmtEje, ticksBonitos, trazoSuave } from './utilsDirectorio'

const COLOR_POS = '#059669' // emerald-600 — saldo positivo
const COLOR_NEG = '#dc2626' // red-600 — saldo negativo
const COLOR_REF = '#94a3b8' // slate-400 — línea real cuando se mira un escenario

// fechas:  un día por posición (hoy .. fin del rango)
// actual:  saldo real de cada día
// activa:  { nombre, valores } escenario que se está mirando (o null: se mira lo real)
// extras:  otros escenarios para comparar [{ id, nombre, color, valores }] (opcionales)
// fechaSel / onSelect: fecha elegida para simular (ISO) y callback al hacer click
export default function GraficoCashflow({ fechas, actual, activa = null, extras = [], fechaSel, onSelect }) {
  const [hoverIdx, setHoverIdx] = useState(null)
  const n = fechas.length

  if (n < 2) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
        No hay datos suficientes para graficar.
      </div>
    )
  }

  // Coordenadas del SVG (se estira al ancho del contenedor). Las etiquetas, el
  // punto y la burbuja son HTML encima, para que no se deformen al estirar.
  const W = 760, H = 240
  const padT = 10, padB = 10

  const principal = activa ? activa.valores : actual
  const todos = [...principal, ...(activa ? actual : []), ...extras.flatMap(s => s.valores)]
  const ticks = ticksBonitos(Math.min(0, ...todos), Math.max(0, ...todos))
  const dMin = ticks[0], dMax = ticks[ticks.length - 1]
  const spanD = Math.max(dMax - dMin, 1)

  const xOf = i => (i / (n - 1)) * W
  const yOf = v => padT + (1 - (v - dMin) / spanD) * (H - padT - padB)

  const coords = principal.map((v, i) => ({ x: xOf(i), y: yOf(v) }))
  const yZero = yOf(0)
  const yTope = yOf(dMax)
  const yFondo = yOf(dMin)

  const linePath = trazoSuave(coords)
  const areaPath = `M ${coords[0].x.toFixed(1)} ${yZero.toFixed(1)} L ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)} ` +
    linePath.replace(/^M [^C]*/, '') +
    ` L ${coords[n - 1].x.toFixed(1)} ${yZero.toFixed(1)} Z`

  const pathDe = valores => trazoSuave(valores.map((v, i) => ({ x: xOf(i), y: yOf(v) })))
  const pathRef = activa ? pathDe(actual) : null
  const lineasExtras = extras.map(s => ({ ...s, path: pathDe(s.valores) }))

  // Etiquetas del eje X: fecha corta si el rango es corto, mes y año si es largo.
  const dias = n - 1
  const etiquetasX = Array.from({ length: 6 }, (_, k) => {
    const i = Math.round((dias * k) / 5)
    const d = new Date(fechas[i] + 'T00:00:00')
    const texto = dias <= 100
      ? d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
      : d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }).replace('.', '')
    return { pct: (i / dias) * 100, texto, k }
  })

  const idxSel = fechaSel ? fechas.indexOf(fechaSel) : -1
  const hovered = hoverIdx !== null
  const idxPunto = hovered ? hoverIdx : n - 1
  const valorPunto = principal[idxPunto]
  const colorPunto = valorPunto >= 0 ? COLOR_POS : COLOR_NEG
  const leftPct = (idxPunto / (n - 1)) * 100
  const topPct = (coords[idxPunto].y / H) * 100

  function idxDeEvento(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const rel = (e.clientX - rect.left) / rect.width
    return Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1))))
  }

  // La burbuja va arriba del punto; si queda muy cerca de un borde, se corre para no cortarse.
  const burbujaAbajo = topPct < 28 + extras.length * 8
  const alineacion = leftPct > 82 ? 'translateX(-100%)' : leftPct < 18 ? 'translateX(0)' : 'translateX(-50%)'

  const uid = 'saldo'

  return (
    <div className="relative pl-16 pr-3 pt-2">
      {/* Área del gráfico */}
      <div className={`relative h-60 ${onSelect ? 'cursor-pointer' : ''}`}
        onMouseMove={e => setHoverIdx(idxDeEvento(e))}
        onMouseLeave={() => setHoverIdx(null)}
        onClick={e => onSelect?.(fechas[idxDeEvento(e)])}>

        {/* Líneas de guía + eje Y */}
        {ticks.map(t => (
          <div key={t} className="absolute left-0 right-0 border-t border-dashed pointer-events-none"
            style={{ top: `${(yOf(t) / H) * 100}%`, borderColor: t === 0 ? '#cbd5e1' : '#e8edf3' }}>
            <span className="absolute -left-16 -translate-y-1/2 w-14 text-right text-[11px] text-slate-400 tabular-nums">
              {fmtEje(t)}
            </span>
          </div>
        ))}

        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
          <defs>
            <clipPath id={`${uid}-arriba`}><rect x="0" y="0" width={W} height={yZero} /></clipPath>
            <clipPath id={`${uid}-abajo`}><rect x="0" y={yZero} width={W} height={H - yZero} /></clipPath>
            <linearGradient id={`${uid}-gpos`} gradientUnits="userSpaceOnUse" x1="0" y1={yTope} x2="0" y2={yZero}>
              <stop offset="0%" stopColor={COLOR_POS} stopOpacity="0.28" />
              <stop offset="100%" stopColor={COLOR_POS} stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id={`${uid}-gneg`} gradientUnits="userSpaceOnUse" x1="0" y1={yZero} x2="0" y2={yFondo}>
              <stop offset="0%" stopColor={COLOR_NEG} stopOpacity="0.02" />
              <stop offset="100%" stopColor={COLOR_NEG} stopOpacity="0.28" />
            </linearGradient>
          </defs>

          {/* Área: degradé verde arriba de cero, rojo abajo */}
          <path d={areaPath} fill={`url(#${uid}-gpos)`} clipPath={`url(#${uid}-arriba)`} />
          <path d={areaPath} fill={`url(#${uid}-gneg)`} clipPath={`url(#${uid}-abajo)`} />

          {/* Referencia: la línea real, finita, cuando se mira un escenario */}
          {pathRef && (
            <path d={pathRef} fill="none" stroke={COLOR_REF} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"
              vectorEffect="non-scaling-stroke" opacity="0.85" />
          )}

          {/* Escenarios que se eligió comparar */}
          {lineasExtras.map(l => (
            <path key={l.id} d={l.path} fill="none" stroke={l.color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round"
              vectorEffect="non-scaling-stroke" />
          ))}

          {/* Línea principal: verde arriba de cero, roja abajo */}
          <path d={linePath} fill="none" stroke={COLOR_POS} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round"
            vectorEffect="non-scaling-stroke" clipPath={`url(#${uid}-arriba)`} />
          <path d={linePath} fill="none" stroke={COLOR_NEG} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round"
            vectorEffect="non-scaling-stroke" clipPath={`url(#${uid}-abajo)`} />
        </svg>

        {/* Guía muy suave al pasar el mouse */}
        {hovered && (
          <div className="absolute top-0 bottom-0 border-l border-slate-200 pointer-events-none" style={{ left: `${leftPct}%` }} />
        )}

        {/* Fecha elegida para simular: solo un anillo sobre la línea */}
        {idxSel >= 0 && (
          <span className="absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-slate-700 bg-white/70 pointer-events-none"
            style={{ left: `${(idxSel / (n - 1)) * 100}%`, top: `${(coords[idxSel].y / H) * 100}%` }} />
        )}

        {/* Punto + burbuja (al final del gráfico, o donde esté el mouse) */}
        <div className="absolute pointer-events-none z-10" style={{ left: `${leftPct}%`, top: `${topPct}%` }}>
          <span className="absolute w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-md"
            style={{ backgroundColor: colorPunto }} />
          <div className="absolute bg-white rounded-xl border border-slate-100 px-3 py-2 whitespace-nowrap
                          shadow-[0_6px_24px_rgba(15,23,42,0.12)]"
            style={{ transform: alineacion, ...(burbujaAbajo ? { top: 14 } : { bottom: 14 }), left: 0 }}>
            <div className="text-[11px] text-slate-400 font-medium">
              {fmtFecha(fechas[idxPunto])}{activa && <span className="text-slate-500"> · {activa.nombre}</span>}
            </div>
            <div className={`text-sm font-bold tabular-nums ${valorPunto >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
              {fmtARS(valorPunto)}
            </div>
            {extras.map(s => (
              <div key={s.id} className="flex items-center gap-2 mt-0.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-[11px] text-slate-500">{s.nombre}</span>
                <span className={`text-xs font-bold tabular-nums ${s.valores[idxPunto] >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
                  {fmtARS(s.valores[idxPunto])}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Eje X */}
      <div className="relative h-6 mt-3">
        {etiquetasX.map(({ pct, texto, k }) => (
          <span key={k} className={`absolute text-[11px] text-slate-400 tabular-nums whitespace-nowrap ${k % 2 === 1 ? 'hidden sm:block' : ''}`}
            style={{ left: `${pct}%`, transform: k === 0 ? 'translateX(0)' : k === 5 ? 'translateX(-100%)' : 'translateX(-50%)' }}>
            {texto}
          </span>
        ))}
      </div>
    </div>
  )
}

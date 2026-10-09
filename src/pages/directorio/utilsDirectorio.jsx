// pages/directorio/utilsDirectorio.jsx
// Piezas compartidas por el panel del Directorio y el Simulador FIMA:
// formato de montos y fechas, helpers de gráficos y componentes de diseño.

export const fmtARS = n => new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 2,
}).format(n ?? 0)


export function fmtFecha(str) {
  if (!str) return '—'
  return new Date(str + 'T00:00:00').toLocaleDateString('es-AR')
}

export function hoyISO() {
  const h = new Date()
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`
}

export function fechaFutura(dias) {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}


// Eje Y compacto: $ 1.500 M, $ -100 M, $ 250 mil
export function fmtEje(v) {
  const abs = Math.abs(v)
  const n = (x) => x.toLocaleString('es-AR', { maximumFractionDigits: 1 })
  const texto = abs >= 1e6 ? `${n(abs / 1e6)} M` : abs >= 1e3 ? `${n(abs / 1e3)} mil` : n(abs)
  return `${v < 0 ? '-' : ''}$ ${texto}`
}

// Marcas "redondas" para el eje Y (1, 2, 2.5, 5 × 10^n) que cubren de min a max.
export function ticksBonitos(min, max, cantidad = 5) {
  const span = Math.max(max - min, 1)
  const paso0 = span / (cantidad - 1)
  const pot = Math.pow(10, Math.floor(Math.log10(paso0)))
  const f = paso0 / pot
  const paso = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pot
  const ini = Math.floor(min / paso) * paso
  const fin = Math.ceil(max / paso) * paso
  const ticks = []
  for (let v = ini; v <= fin + paso / 2; v += paso) ticks.push(Math.abs(v) < paso / 1e6 ? 0 : v)
  return ticks
}

// Un punto por día: el saldo de cierre de cada día, arrastrado hasta el siguiente
// movimiento (el saldo no cambia entre movimientos).
export function serieDiaria(puntos) {
  const porDia = new Map()
  puntos.forEach(p => porDia.set(p.fecha, p.saldo))
  const fechas = [...porDia.keys()].sort()
  if (fechas.length === 0) return []
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const serie = []
  const cursor = new Date(fechas[0] + 'T00:00:00')
  const fin = new Date(fechas[fechas.length - 1] + 'T00:00:00')
  let saldo = porDia.get(fechas[0])
  while (cursor <= fin) {
    const f = iso(cursor)
    if (porDia.has(f)) saldo = porDia.get(f)
    serie.push({ fecha: f, saldo })
    cursor.setDate(cursor.getDate() + 1)
  }
  return serie
}

// Curva suave que nunca se pasa de los datos (interpolación monótona).
export function trazoSuave(c) {
  const n = c.length
  const dx = [], m = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(c[i + 1].x - c[i].x)
    m.push((c[i + 1].y - c[i].y) / (c[i + 1].x - c[i].x || 1))
  }
  const t = [m[0]]
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2)
  t.push(m[n - 2])
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue }
    const a = t[i] / m[i], b = t[i + 1] / m[i]
    const h = Math.hypot(a, b)
    if (h > 3) { t[i] = (3 * a / h) * m[i]; t[i + 1] = (3 * b / h) * m[i] }
  }
  let d = `M ${c[0].x.toFixed(1)} ${c[0].y.toFixed(1)}`
  for (let i = 0; i < n - 1; i++) {
    const k = dx[i] / 3
    d += ` C ${(c[i].x + k).toFixed(1)} ${(c[i].y + t[i] * k).toFixed(1)}, ${(c[i + 1].x - k).toFixed(1)} ${(c[i + 1].y - t[i + 1] * k).toFixed(1)}, ${c[i + 1].x.toFixed(1)} ${c[i + 1].y.toFixed(1)}`
  }
  return d
}


// Tarjeta base del panel: blanca, bordes redondeados y sombra suave.
export const CARD = 'bg-white border border-slate-100 rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_20px_rgba(15,23,42,0.05)]'

// Colores de los íconos de las cards (fondo suave + ícono del mismo tono)
export const TONOS = {
  teal:    'bg-teal-50 text-teal-600',
  indigo:  'bg-indigo-50 text-indigo-600',
  violet:  'bg-violet-50 text-violet-600',
  sky:     'bg-sky-50 text-sky-600',
  amber:   'bg-amber-50 text-amber-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  rose:    'bg-rose-50 text-rose-600',
}

export function Icono({ d, d2, className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
      {d2 && <path strokeLinecap="round" strokeLinejoin="round" d={d2} />}
    </svg>
  )
}

export const ICONOS = {
  billetera: { d: 'M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3' },
  tendencia: { d: 'M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941' },
  calendario: { d: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5' },
  torta: { d: 'M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z', d2: 'M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z' },
  capas: { d: 'M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3' },
  subir: { d: 'M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25' },
  bajar: { d: 'M4.5 4.5l15 15m0 0V8.25m0 11.25H8.25' },
  lista: { d: 'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12' },
  buscar: { d: 'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z' },
  info: { d: 'M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z' },
}
export const ico = nombre => <Icono {...ICONOS[nombre]} />

// Card de un indicador. Con `icono` lleva el mosaico de color a la izquierda.
// `color` es la clase del número (por defecto, oscuro; rojo cuando es negativo).
export function CardResumen({ label, valor, color, subLabel, icono, tono = 'teal' }) {
  return (
    <div className={`${CARD} p-4 sm:p-5 flex items-center gap-3.5 min-w-0 transition-shadow hover:shadow-md`}>
      {icono && (
        <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${TONOS[tono] ?? TONOS.teal}`}>
          {icono}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-slate-500 leading-snug">{label}</p>
        <p className={`text-xl font-bold tabular-nums tracking-tight whitespace-nowrap mt-0.5 ${color ?? 'text-slate-900'}`}>{valor}</p>
        {subLabel && <p className="text-xs text-slate-400 mt-0.5 leading-snug">{subLabel}</p>}
      </div>
    </div>
  )
}


// ─── Estilo premium compartido por los módulos de Finanzas ────────────────────

// Etiqueta de un campo (chiquita, en mayúscula) y el campo mismo (foco turquesa).
export const CLS_LABEL = 'block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5'
export const CLS_CAMPO = 'w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 text-slate-900 bg-white transition-shadow focus:outline-none focus:ring-2 focus:ring-teal-500/25 focus:border-teal-400'

// Botón principal (turquesa con sombra) y botón secundario (blanco con borde).
export const CLS_BOTON_PRIMARIO = 'inline-flex items-center justify-center gap-2 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors shadow-[0_6px_16px_rgba(14,116,144,0.28)] disabled:opacity-50 disabled:cursor-not-allowed'
export const CLS_BOTON_SECUNDARIO = 'inline-flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

// Pantalla vacía: ícono en un mosaico suave, título y una línea de ayuda.
export function EstadoVacioPremium({ titulo, descripcion, icono = 'tendencia' }) {
  return (
    <div className={`${CARD} flex flex-col items-center justify-center py-16 px-6 text-center`}>
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${TONOS.teal}`}>
        <Icono {...ICONOS[icono]} className="w-7 h-7" />
      </div>
      <p className="text-slate-800 font-bold text-sm">{titulo}</p>
      {descripcion && <p className="text-slate-400 text-xs mt-1 max-w-sm">{descripcion}</p>}
    </div>
  )
}

// Cargando: un círculo girando con un texto.
export function CargandoPremium({ texto = 'Cargando…' }) {
  return (
    <div className="flex items-center justify-center py-24 gap-3 text-slate-400">
      <span className="w-5 h-5 border-2 border-slate-200 border-t-cyan-600 rounded-full animate-spin" />
      <span className="text-sm">{texto}</span>
    </div>
  )
}

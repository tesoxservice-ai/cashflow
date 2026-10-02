// pages/directorio/PanelEscenarios.jsx
// Piezas de la simulación que viven pegadas al gráfico de Cash Flow:
//  - BarraEscenarios: los escenarios (crear, elegir, mostrar/ocultar, borrar) y sus cambios.
//  - PanelFecha: qué simular en el día elegido en el gráfico.
//  - AlertasEscenario: avisos si el escenario deja un fondo o la caja en negativo.
//
// Todo es simulación: no escribe nada en la base (ver escenarios.js).

import { useState } from 'react'
import { fmtARS, fmtFecha, Icono, ICONOS, CARD, TONOS } from './utilsDirectorio'
import { parseMonto, sumarDias, cantidadAcciones, DIAS_MAX } from './escenarios'

const selCls = `w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 text-slate-900 bg-white
  transition-shadow focus:outline-none focus:ring-2 focus:ring-teal-500/25 focus:border-teal-400`
const labelCls = 'block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5'
const botonSec = 'px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors'
const botonChico = 'text-xs font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-100 rounded-lg px-3 py-1.5 transition-colors'

function Chip({ tono, children }) {
  const cls = {
    emerald: 'bg-emerald-50 text-emerald-700', rose: 'bg-rose-50 text-rose-700',
    violet: 'bg-violet-50 text-violet-700', slate: 'bg-slate-100 text-slate-600', indigo: 'bg-indigo-50 text-indigo-700',
  }[tono]
  return <span className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap ${cls}`}>{children}</span>
}

function fechaLarga(iso) {
  const t = new Date(iso + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

const nombreFondoDe = (base, id) => base.fondosLista.find(f => (f.id ?? 'por-defecto') === id)?.nombre ?? 'Fondo'

// Texto corto de cada cambio de un escenario.
function descripcionCambio(base, id, c) {
  const m = base.indice.get(id)
  if (!m) return null
  const quien = `${m.etiqueta || 'Movimiento'} · ${fmtARS(m.monto)}`
  if (c.accion === 'no_cumple') return { tono: 'rose', texto: `No se cumple: ${quien} (${fmtFecha(m.fecha)})` }
  const partes = []
  if (c.fecha && c.fecha !== m.fecha) partes.push(`pasa al ${fmtFecha(c.fecha)}`)
  if (c.monto !== undefined && Number(c.monto) !== m.monto) partes.push(`monto ${fmtARS(c.monto)}`)
  return { tono: 'violet', texto: `${m.etiqueta || 'Movimiento'} (${fmtFecha(m.fecha)}): ${partes.join(' y ') || 'sin cambios'}` }
}

// ══════════════════════════════════════════════════════════════
// Barra de escenarios
// ══════════════════════════════════════════════════════════════
export function BarraEscenarios({ esc, base, colorDe }) {
  const { escenarios, activo, activoId, setActivoId, visibles, alternarVisible, crear, eliminar, renombrar, aplicar, destino, guardado } = esc

  function pedirEliminar(e) {
    if (cantidadAcciones(e) > 0 && !window.confirm(`¿Borrar "${e.nombre}"? Es solo una simulación, pero no se puede recuperar.`)) return
    eliminar(e.id)
  }

  return (
    <div className="mb-4 pb-4 border-b border-slate-100 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setActivoId('actual')}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${!activo ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
          Real
        </button>

        {escenarios.map(e => {
          const esActivo = e.id === activoId
          const comparando = visibles.includes(e.id)
          return (
            <div key={e.id} className={`inline-flex items-center rounded-xl border text-xs font-semibold transition-colors ${esActivo ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
              <button onClick={() => setActivoId(e.id)} className="inline-flex items-center gap-2 pl-3 pr-2 py-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorDe(e.id) }} />
                {e.nombre}
              </button>
              <button onClick={() => alternarVisible(e.id)} disabled={esActivo}
                title={esActivo ? 'Es el escenario que estás mirando en el gráfico' : comparando ? 'Dejar de comparar en el gráfico' : 'Comparar en el gráfico'}
                className={`px-1.5 py-1.5 ${esActivo ? 'opacity-30 cursor-default' : comparando ? 'text-emerald-600' : 'text-slate-300 hover:text-slate-500'}`}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              <button onClick={() => pedirEliminar(e)} title="Borrar escenario"
                className="pr-2.5 pl-1 py-1.5 text-slate-300 hover:text-rose-500">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )
        })}

        <button onClick={() => crear()}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-dashed border-slate-300 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:border-slate-400 transition-colors">
          <span className="text-sm leading-none">+</span> Nuevo escenario
        </button>

        {escenarios.length > 0 && destino !== 'cargando' && (
          <span className={`ml-auto text-[11px] font-medium ${guardado === 'error' ? 'text-amber-600' : 'text-slate-400'}`}
            title={destino === 'local' ? 'No se pudo usar el guardado en la nube: los escenarios quedan en este navegador.' : 'Tus escenarios se guardan en tu cuenta y los ves desde cualquier dispositivo.'}>
            {destino === 'local' ? 'Guardado solo en este navegador'
              : guardado === 'guardando' ? 'Guardando…'
              : guardado === 'error' ? 'No se pudo guardar en la nube — se reintenta solo'
              : 'Guardado en tu cuenta'}
          </span>
        )}
      </div>

      {activo ? (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <input value={activo.nombre} onChange={e => renombrar(activo.id, e.target.value)} maxLength={40}
              className="px-2.5 py-1.5 text-sm font-semibold rounded-lg border border-slate-200 text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/25 max-w-[220px]" />
            <button onClick={() => crear(activo)} className={botonSec}>Duplicar</button>
            {cantidadAcciones(activo) > 0 && (
              <button onClick={() => aplicar(e => ({ ...e, cambios: {}, nuevos: [] }))} className={botonSec}>Quitar todos los cambios</button>
            )}
          </div>
          {cantidadAcciones(activo) === 0 ? (
            <p className="text-xs text-slate-400">Tocá una fecha en el gráfico para simular un rescate o inversión en FIMA, o para marcar que un pago no se cumple.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {Object.entries(activo.cambios ?? {}).map(([id, c]) => {
                const d = descripcionCambio(base, id, c)
                if (!d) return null
                return (
                  <ChipQuitable key={id} tono={d.tono}
                    onQuitar={() => aplicar(e => { const cambios = { ...e.cambios }; delete cambios[id]; return { ...e, cambios } })}>
                    {d.texto}
                  </ChipQuitable>
                )
              })}
              {(activo.nuevos ?? []).map(nv => (
                <ChipQuitable key={nv.id} tono={nv.tipo === 'inversion' ? 'indigo' : 'emerald'}
                  onQuitar={() => aplicar(e => ({ ...e, nuevos: e.nuevos.filter(x => x.id !== nv.id) }))}>
                  {nv.tipo === 'inversion' ? 'Invertir en' : 'Rescatar de'} {nombreFondoDe(base, nv.fondoId)} · {fmtARS(nv.monto)} ({fmtFecha(nv.fecha)})
                </ChipQuitable>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-400">
          Estás viendo lo real. Tocá una fecha en el gráfico para armar un escenario: simular un rescate o inversión en FIMA, o marcar que un pago no se cumple.
          Nada de esto se guarda en el sistema.
        </p>
      )}
    </div>
  )
}

function ChipQuitable({ tono, onQuitar, children }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Chip tono={tono}>
        {children}
        <button onClick={onQuitar} title="Quitar este cambio" className="ml-2 -mr-1 opacity-60 hover:opacity-100">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </Chip>
    </span>
  )
}

// ══════════════════════════════════════════════════════════════
// Panel del día elegido en el gráfico
// ══════════════════════════════════════════════════════════════
export function PanelFecha({ fecha, hoy, base, esc, resultados, onCerrar }) {
  const { activo, aplicar } = esc
  const iDia = base.fechas.indexOf(fecha)
  const delDia = base.porFecha.get(fecha) ?? []
  const rReal = resultados.actual
  const rEsc = activo ? resultados[activo.id] : null

  return (
    <div className={`${CARD} p-5 sm:p-6 border-indigo-100`}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <p className="text-[11px] font-semibold text-indigo-500 uppercase tracking-wider">Simular en esta fecha</p>
          <h3 className="text-slate-900 font-bold text-base">{fechaLarga(fecha)}</h3>
          <p className="text-xs text-slate-400 mt-1">
            {activo ? <>Los cambios se agregan a <b className="text-slate-600">{activo.nombre}</b>.</> : 'Al agregar un cambio se crea un escenario nuevo.'}
          </p>
        </div>
        <button onClick={onCerrar} className={botonSec}>Cerrar</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Dato etiqueta="Caja real ese día" valor={rReal.banco[iDia]} />
        <Dato etiqueta={`Caja en ${activo ? activo.nombre : 'el escenario'}`} valor={rEsc ? rEsc.banco[iDia] : null} dif={rEsc ? rEsc.banco[iDia] - rReal.banco[iDia] : 0} />
        {base.fondoIds.map(id => (
          <Dato key={id} etiqueta={`${nombreFondoDe(base, id)}${activo ? ' en ' + activo.nombre : ''}`}
            valor={rEsc ? rEsc.fondos[id][iDia] : rReal.fondos[id][iDia]}
            dif={rEsc ? rEsc.fondos[id][iDia] - rReal.fondos[id][iDia] : 0} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* FIMA */}
        <FormFima fecha={fecha} base={base}
          onAgregar={nv => aplicar(e => ({ ...e, nuevos: [...(e.nuevos ?? []), nv] }))} />

        {/* Pagos de ese día */}
        <div>
          <p className="text-sm font-bold text-slate-800 mb-3">Movimientos de este día</p>
          {delDia.length === 0 ? (
            <p className="text-sm text-slate-400">No hay movimientos proyectados para esta fecha.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white">
              {delDia.map(m => (
                <FilaMovimiento key={m.id} m={m} hoy={hoy} cambio={activo?.cambios?.[m.id]}
                  onCambiar={cambio => aplicar(e => {
                    const cambios = { ...(e.cambios ?? {}) }
                    if (!cambio) delete cambios[m.id]; else cambios[m.id] = cambio
                    return { ...e, cambios }
                  })} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function Dato({ etiqueta, valor, dif }) {
  return (
    <div className="rounded-xl bg-slate-50/70 border border-slate-100 px-4 py-3">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{etiqueta}</p>
      {valor === null ? (
        <p className="text-sm text-slate-300 mt-0.5">—</p>
      ) : (
        <>
          <p className={`font-bold tabular-nums mt-0.5 ${valor < 0 ? 'text-red-600' : 'text-slate-900'}`}>{fmtARS(valor)}</p>
          {dif !== undefined && Math.abs(dif) >= 0.005 && (
            <p className={`text-xs font-semibold tabular-nums ${dif > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {dif > 0 ? '+' : '-'}{fmtARS(Math.abs(dif))} <span className="font-normal text-slate-400">vs real</span>
            </p>
          )}
        </>
      )}
    </div>
  )
}

// Rescatar o invertir en FIMA en la fecha elegida.
function FormFima({ fecha, base, onAgregar }) {
  const [tipo, setTipo] = useState('rescate')
  const [fondoId, setFondoId] = useState(base.fondoIds[0])
  const [montoTxt, setMontoTxt] = useState('')
  const [error, setError] = useState('')
  const monto = parseMonto(montoTxt)

  function agregar() {
    if (!(monto > 0)) return setError('Ingresá un monto mayor a 0.')
    setError('')
    onAgregar({ id: crypto.randomUUID?.() ?? String(Date.now()), tipo, fondoId, monto, fecha })
    setMontoTxt('')
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
      <p className="text-sm font-bold text-slate-800 mb-3">FIMA</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Operación</label>
          <select value={tipo} onChange={e => setTipo(e.target.value)} className={selCls}>
            <option value="rescate">Rescatar de FIMA</option>
            <option value="inversion">Invertir en FIMA</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Fondo</label>
          <select value={fondoId} onChange={e => setFondoId(e.target.value)} className={selCls}>
            {base.fondosLista.map(f => {
              const id = f.id ?? 'por-defecto'
              return <option key={id} value={id}>{f.nombre}</option>
            })}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Monto</label>
          <input value={montoTxt} onChange={e => setMontoTxt(e.target.value)} onKeyDown={e => e.key === 'Enter' && agregar()}
            placeholder="Ej: 30.000.000 o 30M" className={selCls} />
          <p className="text-[11px] text-slate-400 mt-1">{monto > 0 ? fmtARS(monto) : ' '}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-1">
        {error && <span className="text-xs text-rose-600 font-medium">{error}</span>}
        <button onClick={agregar} className="ml-auto px-4 py-2 text-sm font-semibold text-white rounded-xl bg-violet-600 hover:bg-violet-700">
          Agregar al escenario
        </button>
      </div>
    </div>
  )
}

// Un movimiento del día: no se cumple / reprogramar / mantener.
function FilaMovimiento({ m, hoy, cambio, onCambiar }) {
  const [reprogramando, setReprogramando] = useState(false)
  const [fecha, setFecha] = useState(cambio?.fecha ?? '')
  const [montoTxt, setMontoTxt] = useState(String(cambio?.monto ?? m.monto).replace('.', ','))
  const [error, setError] = useState('')
  const monto = parseMonto(montoTxt)
  const ingreso = m.tipo === 'ingreso'

  function guardar() {
    if (!fecha || fecha < hoy) return setError('Elegí una fecha de hoy en adelante.')
    if (fecha > sumarDias(hoy, DIAS_MAX)) return setError('La simulación llega hasta 1 año desde hoy.')
    if (m.esFima && !(monto > 0)) return setError('Ingresá un monto mayor a 0.')
    const nuevoMonto = m.esFima ? monto : m.monto
    if (fecha === m.fecha && nuevoMonto === m.monto) { onCambiar(null); setReprogramando(false); return }
    onCambiar({ accion: 'modificar', fecha, ...(m.esFima ? { monto: nuevoMonto } : {}) })
    setReprogramando(false); setError('')
  }

  return (
    <li className="p-3.5">
      <div className="flex items-start gap-3 flex-wrap">
        <span className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center ${ingreso ? TONOS.emerald : TONOS.rose}`}>
          <Icono {...(ingreso ? ICONOS.subir : ICONOS.bajar)} className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold text-slate-800 ${cambio ? 'line-through opacity-60' : ''}`}>{m.etiqueta || 'Movimiento'}</p>
          <p className="text-xs text-slate-400">
            {m.esFima ? (m.tipo === 'egreso' ? 'Inversión FIMA' : 'Rescate FIMA') : ingreso ? 'Ingreso' : 'Egreso'}
            {m.obra && ` · Obra ${m.obra}`}{m.numeroFactura && ` · Nº ${m.numeroFactura}`}
          </p>
        </div>
        <p className={`text-sm font-bold tabular-nums ${ingreso ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtARS(m.monto)}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-2.5 pl-11">
        {cambio?.accion === 'no_cumple' && <Chip tono="rose">No se cumple</Chip>}
        {cambio?.accion === 'modificar' && (
          <Chip tono="violet">
            {cambio.fecha && cambio.fecha !== m.fecha && `→ ${fmtFecha(cambio.fecha)}`}
            {cambio.monto !== undefined && Number(cambio.monto) !== m.monto && ` · ${fmtARS(cambio.monto)}`}
          </Chip>
        )}
        {cambio ? (
          <button onClick={() => { onCambiar(null); setReprogramando(false) }} className={botonChico}>Mantener</button>
        ) : (
          <button onClick={() => onCambiar({ accion: 'no_cumple' })}
            className="text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-100 rounded-lg px-3 py-1.5 transition-colors">
            No se cumple
          </button>
        )}
        {!reprogramando && (
          <button onClick={() => setReprogramando(true)} className={botonChico}>Reprogramar</button>
        )}
      </div>

      {reprogramando && (
        <div className="mt-3 ml-11 rounded-xl bg-violet-50/60 border border-violet-100 p-3 space-y-3">
          <div className={`grid grid-cols-1 ${m.esFima ? 'sm:grid-cols-2' : ''} gap-3`}>
            <div>
              <label className={labelCls}>Nueva fecha</label>
              <input type="date" min={hoy} value={fecha} onChange={e => setFecha(e.target.value)} className={selCls} />
            </div>
            {m.esFima && (
              <div>
                <label className={labelCls}>Monto</label>
                <input value={montoTxt} onChange={e => setMontoTxt(e.target.value)} className={selCls} />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {error && <span className="text-xs text-rose-600 font-medium">{error}</span>}
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => { setReprogramando(false); setError('') }} className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700">Cancelar</button>
              <button onClick={guardar} className="px-3.5 py-1.5 text-xs font-semibold text-white rounded-lg bg-violet-600 hover:bg-violet-700">Aplicar</button>
            </div>
          </div>
        </div>
      )}
    </li>
  )
}

// ══════════════════════════════════════════════════════════════
// Avisos del escenario activo (fondo o caja en negativo)
// ══════════════════════════════════════════════════════════════
export function AlertasEscenario({ base, alertas }) {
  if (!alertas.length) return null
  return (
    <div className="space-y-3">
      {alertas.map((a, k) => (
        <div key={k} className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3">
          {a.tipo === 'fondo'
            ? <>En este escenario <b>{nombreFondoDe(base, a.fondoId)}</b> quedaría con saldo negativo desde el {fmtFecha(a.fecha)}: el rescate supera lo disponible en el fondo.</>
            : <>En este escenario la caja pasaría a negativo desde el {fmtFecha(a.fecha)}.</>}
        </div>
      ))}
    </div>
  )
}

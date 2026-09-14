// pages/finanzas/components/SaldosIniciales.jsx
// Panel colapsable que muestra el saldo inicial de cada cuenta
// y permite actualizarlo con una edición inline por fila.
//
// Props:
//   cuentas    → array [{ id, nombre, tipo }] de todas las cuentas activas
//   userId     → id del usuario logueado (para created_by)
//   onActualizado → fn() sin args, notifica al padre para que
//                   recalcule el saldo total del cash flow

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../supabaseClient'

// ── Utilidad de formato ────────────────────────────────────────
const fmtARS = n => new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 2,
}).format(n ?? 0)

function fmtFecha(str) {
  if (!str) return '—'
  return new Date(str + 'T00:00:00').toLocaleDateString('es-AR')
}

// Fecha de hoy en formato YYYY-MM-DD para el input date
function hoyISO() {
  const h = new Date()
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`
}

export default function SaldosIniciales({ cuentas, userId, onActualizado }) {
  const [abierto,   setAbierto]   = useState(true)
  const [saldos,    setSaldos]    = useState([]) // últimos saldos por cuenta_id
  const [cargando,  setCargando]  = useState(true)

  // Edición inline: { cuentaId, monto, fecha }
  const [editando,  setEditando]  = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error,     setError]     = useState('')

  // ── Carga el último saldo inicial de cada cuenta ─────────────
  const cargarSaldos = useCallback(async () => {
    setCargando(true)

    // Para cada cuenta buscamos el saldo más reciente (por fecha DESC)
    // Hacemos una sola query y agrupamos en JS para evitar N+1
    const { data, error: err } = await supabase
      .from('saldos_iniciales')
      .select('id, cuenta_id, monto, fecha, created_at')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })

    if (!err) {
      // Nos quedamos con el primero de cada cuenta (el más reciente)
      const mapa = {}
      ;(data ?? []).forEach(s => {
        if (!mapa[s.cuenta_id]) mapa[s.cuenta_id] = s
      })
      setSaldos(Object.values(mapa))
    }
    setCargando(false)
  }, [])

  useEffect(() => { cargarSaldos() }, [cargarSaldos])

  // ── Iniciar edición de una cuenta ─────────────────────────────
  function handleIniciarEdicion(cuentaId) {
    const saldoActual = saldos.find(s => s.cuenta_id === cuentaId)
    setEditando({
      cuentaId,
      monto: saldoActual ? String(saldoActual.monto) : '',
      fecha:  hoyISO(),
    })
    setError('')
  }

  // ── Guardar nuevo saldo inicial ───────────────────────────────
  async function handleGuardar() {
    setError('')

    if (editando.monto === '' || isNaN(Number(editando.monto))) {
      setError('Ingresá un monto válido.')
      return
    }
    if (!editando.fecha) {
      setError('Seleccioná una fecha de corte.')
      return
    }

    setGuardando(true)

    // Insertamos un nuevo registro (el histórico queda preservado;
    // siempre usamos el más reciente para el cálculo)
    const { error: err } = await supabase.from('saldos_iniciales').insert({
      cuenta_id:  editando.cuentaId,
      monto:      Number(editando.monto),
      fecha:      editando.fecha,
      created_by: userId,
    })

    if (err) {
      setError('Error al guardar el saldo.')
      setGuardando(false)
      return
    }

    setEditando(null)
    setGuardando(false)
    await cargarSaldos()
    onActualizado()
  }

  // ── Total de todos los saldos iniciales ───────────────────────
  const totalSaldos = cuentas.reduce((acc, c) => {
    const s = saldos.find(s => s.cuenta_id === c.id)
    return acc + Number(s?.monto ?? 0)
  }, 0)

  // ── RENDER ────────────────────────────────────────────────────
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">

      {/* ── Cabecera colapsable ────────────────────────────────── */}
      <button
        onClick={() => setAbierto(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4
                   hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {/* Ícono banco */}
          <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg
                          flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24"
                 strokeWidth={1.6} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6
                   2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25
                   2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25
                   2.25v10.5A2.25 2.25 0 004.5 19.5z" />
            </svg>
          </div>
          <div>
            <p className="text-slate-800 font-semibold text-sm">Saldos iniciales</p>
            <p className="text-slate-500 text-xs mt-0.5">
              Total disponible:{' '}
              <span className="font-semibold text-slate-700">{fmtARS(totalSaldos)}</span>
            </p>
          </div>
        </div>

        {/* Chevron animado */}
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform duration-200
                      ${abierto ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* ── Contenido ─────────────────────────────────────────── */}
      {abierto && (
        <div className="border-t border-slate-100">
          {cargando ? (
            <div className="flex items-center gap-2 text-slate-500 text-sm px-5 py-4">
              <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-500
                               rounded-full animate-spin" />
              Cargando saldos…
            </div>
          ) : (
            <>
              {/* Tabla de cuentas */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Cuenta
                      </th>
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Tipo
                      </th>
                      <th className="px-5 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Saldo inicial
                      </th>
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Fecha de corte
                      </th>
                      <th className="px-5 py-2.5 w-28" />
                    </tr>
                  </thead>
                  <tbody>
                    {cuentas.map(cuenta => {
                      const saldo = saldos.find(s => s.cuenta_id === cuenta.id)
                      const estaEditando = editando?.cuentaId === cuenta.id

                      return (
                        <tr key={cuenta.id}
                            className={`border-b border-slate-100 last:border-0
                                        ${estaEditando ? 'bg-blue-50' : 'hover:bg-slate-50/60'}`}>
                          {/* Nombre */}
                          <td className="px-5 py-3 text-slate-700 font-medium">
                            {cuenta.nombre}
                          </td>
                          {/* Tipo badge */}
                          <td className="px-5 py-3">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                              ${cuenta.tipo === 'banco'
                                ? 'bg-slate-100 text-slate-600'
                                : 'bg-blue-50 text-blue-700 border border-blue-100'}`}>
                              {cuenta.tipo === 'banco' ? 'Banco' : 'Fondo inversión'}
                            </span>
                          </td>

                          {estaEditando ? (
                            // ── Edición inline ──────────────────
                            <>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="0,00"
                                  value={editando.monto}
                                  onChange={e => setEditando(v => ({ ...v, monto: e.target.value }))}
                                  className="w-36 px-2.5 py-1.5 text-sm rounded-lg border
                                             border-blue-300 text-slate-900 text-right
                                             focus:outline-none focus:ring-2 focus:ring-blue-500
                                             bg-white"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="date"
                                  value={editando.fecha}
                                  onChange={e => setEditando(v => ({ ...v, fecha: e.target.value }))}
                                  className="px-2.5 py-1.5 text-sm rounded-lg border
                                             border-blue-300 text-slate-900
                                             focus:outline-none focus:ring-2 focus:ring-blue-500
                                             bg-white"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={handleGuardar}
                                    disabled={guardando}
                                    className="inline-flex items-center gap-1 text-xs font-medium
                                               bg-blue-600 hover:bg-blue-700 disabled:opacity-50
                                               text-white px-2.5 py-1.5 rounded-md transition-colors"
                                  >
                                    {guardando && (
                                      <span className="w-3 h-3 border-2 border-white/30
                                                       border-t-white rounded-full animate-spin" />
                                    )}
                                    {guardando ? 'Guardando…' : 'Guardar'}
                                  </button>
                                  <button
                                    onClick={() => { setEditando(null); setError('') }}
                                    disabled={guardando}
                                    className="text-xs font-medium bg-slate-200 hover:bg-slate-300
                                               text-slate-700 px-2.5 py-1.5 rounded-md transition-colors"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </td>
                            </>
                          ) : (
                            // ── Modo lectura ────────────────────
                            <>
                              <td className="px-5 py-3 text-right font-medium tabular-nums
                                             text-slate-800">
                                {saldo ? fmtARS(saldo.monto) : (
                                  <span className="text-slate-400 text-xs">Sin saldo cargado</span>
                                )}
                              </td>
                              <td className="px-5 py-3 text-slate-500 text-xs">
                                {saldo ? fmtFecha(saldo.fecha) : '—'}
                              </td>
                              <td className="px-5 py-3 text-right">
                                <button
                                  onClick={() => handleIniciarEdicion(cuenta.id)}
                                  disabled={!!editando}
                                  className="text-xs font-medium text-blue-600 hover:text-blue-800
                                             disabled:opacity-40 disabled:cursor-not-allowed
                                             transition-colors"
                                >
                                  {saldo ? 'Actualizar' : 'Cargar saldo'}
                                </button>
                              </td>
                            </>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Error inline */}
              {error && (
                <p className="text-red-600 text-xs px-5 py-2 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                  {error}
                </p>
              )}

              {/* Total al pie */}
              <div className="flex items-center justify-end gap-3 px-5 py-3
                              border-t border-slate-100 bg-slate-50">
                <span className="text-xs text-slate-500">Total saldos iniciales</span>
                <span className="text-sm font-bold text-slate-800 tabular-nums">
                  {fmtARS(totalSaldos)}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

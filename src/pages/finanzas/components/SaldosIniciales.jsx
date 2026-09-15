// components/finanzas/SaldosIniciales.jsx
// Rediseño visual coherente con el sistema de diseño PSDATA.
// Lógica sin cambios.

import { useState, useEffect } from 'react'
import { supabase } from '../../../supabaseClient'

const fmtARS = n => new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 2,
}).format(n ?? 0)

function fmtFecha(str) {
  if (!str) return '—'
  return new Date(str + 'T00:00:00').toLocaleDateString('es-AR')
}

const TIPO_BADGE = {
  banco:           { label: 'Banco',           cls: 'bg-blue-50 text-blue-700 border-blue-100' },
  fondo_inversion: { label: 'Fondo inversión',  cls: 'bg-violet-50 text-violet-700 border-violet-100' },
  caja:            { label: 'Caja',             cls: 'bg-amber-50 text-amber-700 border-amber-100' },
}

function BadgeTipo({ tipo }) {
  const cfg = TIPO_BADGE[tipo] ?? { label: tipo, cls: 'bg-slate-100 text-slate-600 border-slate-200' }
  return (
    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

// ─── Modal de carga/actualización de saldo ────────────────────────────────────
function ModalSaldo({ cuenta, saldoActual, userId, onCerrar, onGuardado }) {
  const [monto,      setMonto]      = useState(saldoActual ? String(saldoActual.monto) : '')
  const [fecha,      setFecha]      = useState(() => new Date().toISOString().split('T')[0])
  const [guardando,  setGuardando]  = useState(false)
  const [error,      setError]      = useState('')

  async function handleGuardar(e) {
    e.preventDefault(); setError('')
    if (!monto || isNaN(Number(monto))) { setError('Ingresá un monto válido.'); return }
    if (!fecha)                          { setError('Ingresá una fecha.'); return }
    setGuardando(true)
    const { error: err } = await supabase.from('saldos_iniciales').insert({
      cuenta_id: cuenta.id, monto: Number(monto), fecha, created_by: userId,
    })
    if (err) { setError('Error al guardar. Intentá de nuevo.'); setGuardando(false); return }
    setGuardando(false); onGuardado()
  }

  const esActualizar = !!saldoActual

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-slate-900 font-extrabold text-base">
              {esActualizar ? 'Actualizar saldo' : 'Cargar saldo inicial'}
            </h3>
            <p className="text-slate-400 text-sm mt-0.5">{cuenta.nombre}</p>
          </div>
          <button onClick={onCerrar} className="text-slate-300 hover:text-slate-500 transition-colors mt-0.5">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleGuardar} noValidate className="space-y-4">
          <div>
            <label className={lbCls}>
              Monto actual
              {esActualizar && (
                <span className="text-slate-300 font-normal ml-1">
                  (anterior: {fmtARS(saldoActual.monto)})
                </span>
              )}
            </label>
            <input type="number" step="0.01" placeholder="0,00"
              value={monto} onChange={e => setMonto(e.target.value)}
              className={inCls} autoFocus />
          </div>
          <div>
            <label className={lbCls}>Fecha de corte</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={inCls} />
          </div>

          {error && (
            <p className="text-red-600 text-xs flex items-center gap-1.5">
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={guardando}
              className="flex-1 text-white text-sm font-semibold py-2.5 rounded-xl
                         transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2 shadow-sm"
              style={{ backgroundColor: '#0e7490' }}
              onMouseEnter={e => !guardando && (e.currentTarget.style.backgroundColor = '#164e63')}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0e7490'}>
              {guardando && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {guardando ? 'Guardando…' : esActualizar ? 'Actualizar' : 'Guardar'}
            </button>
            <button type="button" onClick={onCerrar} disabled={guardando}
              className="flex-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-50
                         text-slate-700 text-sm font-semibold py-2.5 rounded-xl transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function SaldosIniciales({ cuentas, userId, onActualizado }) {
  const [expandido,     setExpandido]     = useState(true)
  const [saldos,        setSaldos]        = useState([])
  const [cargando,      setCargando]      = useState(true)
  const [modalCuenta,   setModalCuenta]   = useState(null)
  const [saldoModal,    setSaldoModal]    = useState(null)

  useEffect(() => {
    async function cargarSaldos() {
      setCargando(true)
      const { data } = await supabase
        .from('saldos_iniciales')
        .select('id, cuenta_id, monto, fecha, created_at')
        .order('fecha',      { ascending: false })
        .order('created_at', { ascending: false })
      // El más reciente por cuenta
      const mapa = {}
      ;(data ?? []).forEach(s => { if (!mapa[s.cuenta_id]) mapa[s.cuenta_id] = s })
      setSaldos(Object.values(mapa))
      setCargando(false)
    }
    cargarSaldos()
  }, [])

  function getSaldoCuenta(cuentaId) {
    return saldos.find(s => s.cuenta_id === cuentaId) ?? null
  }

  const totalSaldos = saldos.reduce((acc, s) => acc + Number(s.monto ?? 0), 0)

  function abrirModal(cuenta) {
    const saldoActual = getSaldoCuenta(cuenta.id)
    setModalCuenta(cuenta)
    setSaldoModal(saldoActual)
  }

  async function handleGuardado() {
    setModalCuenta(null)
    setSaldoModal(null)
    // Recargar saldos
    const { data } = await supabase
      .from('saldos_iniciales')
      .select('id, cuenta_id, monto, fecha, created_at')
      .order('fecha',      { ascending: false })
      .order('created_at', { ascending: false })
    const mapa = {}
    ;(data ?? []).forEach(s => { if (!mapa[s.cuenta_id]) mapa[s.cuenta_id] = s })
    setSaldos(Object.values(mapa))
    onActualizado()
  }

  return (
    <>
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm mb-6 overflow-hidden">

        {/* Header */}
        <button
          onClick={() => setExpandido(v => !v)}
          className="w-full flex items-center justify-between px-6 py-4
                     hover:bg-slate-50/60 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: '#e0f2fe', color: '#0e7490' }}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75
                     3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5
                     4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 21z" />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-slate-800 font-bold text-sm">Saldos iniciales</p>
              <p className="text-slate-400 text-xs mt-0.5">
                Total disponible:{' '}
                <span className="font-semibold" style={{ color: '#0e7490' }}>
                  {cargando ? '…' : fmtARS(totalSaldos)}
                </span>
              </p>
            </div>
          </div>

          <svg
            className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${expandido ? '' : 'rotate-180'}`}
            fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
          </svg>
        </button>

        {/* Tabla expandible */}
        {expandido && (
          <div className="border-t border-slate-100">
            {cargando ? (
              <div className="flex items-center justify-center py-10 gap-3 text-slate-400">
                <span className="w-4 h-4 border-2 border-slate-200 border-t-cyan-600 rounded-full animate-spin" />
                <span className="text-sm">Cargando saldos…</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50/80">
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Cuenta</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Tipo</th>
                      <th className="text-right px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Saldo inicial</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Fecha de corte</th>
                      <th className="px-6 py-3 w-36" />
                    </tr>
                  </thead>
                  <tbody>
                    {cuentas.map(cuenta => {
                      const saldo = getSaldoCuenta(cuenta.id)
                      return (
                        <tr key={cuenta.id}
                          className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors">
                          <td className="px-6 py-4 text-slate-800 font-semibold text-sm">{cuenta.nombre}</td>
                          <td className="px-6 py-4">
                            <BadgeTipo tipo={cuenta.tipo} />
                          </td>
                          <td className="px-6 py-4 text-right tabular-nums">
                            {saldo
                              ? <span className="font-bold text-slate-900 text-sm">{fmtARS(saldo.monto)}</span>
                              : <span className="text-slate-300 text-sm">Sin saldo cargado</span>}
                          </td>
                          <td className="px-6 py-4 text-slate-400 text-sm">
                            {saldo ? fmtFecha(saldo.fecha) : '—'}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => abrirModal(cuenta)}
                              className="text-sm font-semibold transition-colors"
                              style={{ color: '#0e7490' }}
                              onMouseEnter={e => e.currentTarget.style.color = '#164e63'}
                              onMouseLeave={e => e.currentTarget.style.color = '#0e7490'}>
                              {saldo ? 'Actualizar' : 'Cargar saldo'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-100">
                      <td colSpan={4} className="px-6 py-3 text-right text-xs font-semibold text-slate-400">
                        Total saldos iniciales
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className="text-sm font-extrabold tabular-nums" style={{ color: '#0e7490' }}>
                          {fmtARS(totalSaldos)}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {modalCuenta && (
        <ModalSaldo
          cuenta={modalCuenta}
          saldoActual={saldoModal}
          userId={userId}
          onCerrar={() => { setModalCuenta(null); setSaldoModal(null) }}
          onGuardado={handleGuardado}
        />
      )}
    </>
  )
}

const lbCls = 'block text-xs font-semibold text-slate-500 mb-1.5'
const inCls = `w-full px-3 py-2 text-sm rounded-xl border border-slate-200
  text-slate-900 placeholder:text-slate-300 bg-white
  focus:outline-none focus:ring-2 focus:border-transparent`
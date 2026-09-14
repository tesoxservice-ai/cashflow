// pages/finanzas/components/ModalNotas.jsx
// Modal de notas de crédito y débito para un movimiento de tipo 'factura'.
//
// Props:
//   movimiento  → objeto completo del movimiento (necesitamos id y monto_bruto)
//   onCerrar    → función para cerrar el modal
//   userId      → id del usuario logueado (para created_by)
//
// Muestra:
//   - Lista de notas existentes con subtipo, número, monto y concepto
//   - Total ajustado = monto_bruto + débitos - créditos
//   - Formulario inline para agregar una nota nueva
//   - Botón eliminar por nota

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../supabaseClient'

// ── Utilidad de formato de moneda ──────────────────────────────
function fmt(n) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', minimumFractionDigits: 2,
  }).format(n ?? 0)
}

// ── Estado vacío del formulario de alta ───────────────────────
const NOTA_VACIA = { tipo_nota: 'credito', numero_nota: '', monto: '', concepto: '' }

export default function ModalNotas({ movimiento, onCerrar, userId }) {
  const [notas,        setNotas]        = useState([])
  const [cargando,     setCargando]     = useState(true)
  const [form,         setForm]         = useState(NOTA_VACIA)
  const [guardando,    setGuardando]    = useState(false)
  const [eliminando,   setEliminando]   = useState(null) // uuid
  const [error,        setError]        = useState('')

  // ── Carga notas del movimiento ─────────────────────────────
  const cargarNotas = useCallback(async () => {
    setCargando(true)
    const { data, error: err } = await supabase
      .from('notas')
      .select('id, tipo_nota, numero_nota, monto, concepto, created_at')
      .eq('movimiento_id', movimiento.id)
      .order('created_at', { ascending: true })
    if (!err) setNotas(data ?? [])
    setCargando(false)
  }, [movimiento.id])

  useEffect(() => { cargarNotas() }, [cargarNotas])

  // ── Totales ────────────────────────────────────────────────
  const totalDebitos  = notas.filter(n => n.tipo_nota === 'debito').reduce((s, n) => s + Number(n.monto), 0)
  const totalCreditos = notas.filter(n => n.tipo_nota === 'credito').reduce((s, n) => s + Number(n.monto), 0)
  const montoAjustado = Number(movimiento.monto_bruto ?? 0) + totalDebitos - totalCreditos

  // ── Guardar nota nueva ─────────────────────────────────────
  async function handleGuardar(e) {
    e.preventDefault()
    setError('')
    if (!form.monto || isNaN(Number(form.monto)) || Number(form.monto) <= 0) {
      setError('Ingresá un monto válido mayor a cero.')
      return
    }
    setGuardando(true)
    const { error: err } = await supabase.from('notas').insert({
      movimiento_id: movimiento.id,
      tipo_nota:     form.tipo_nota,
      numero_nota:   form.numero_nota.trim() || null,
      monto:         Number(form.monto),
      concepto:      form.concepto.trim() || null,
      created_by:    userId,
    })
    if (err) { setError('Error al guardar la nota.'); setGuardando(false); return }
    setForm(NOTA_VACIA)
    setGuardando(false)
    await cargarNotas()
  }

  // ── Eliminar nota ──────────────────────────────────────────
  async function handleEliminar(id) {
    setEliminando(id)
    await supabase.from('notas').delete().eq('id', id)
    setEliminando(null)
    await cargarNotas()
  }

  // ── Etiquetas de tipo de nota ──────────────────────────────
  const labelTipo = t => t === 'credito' ? 'Nota de crédito' : 'Nota de débito'
  const clsTipo   = t => t === 'credito'
    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
    : 'bg-orange-50 text-orange-700 border border-orange-100'

  return (
    /* Overlay oscuro */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={e => { if (e.target === e.currentTarget) onCerrar() }}
    >
      {/* Panel del modal */}
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh]
                      flex flex-col overflow-hidden">

        {/* ── Cabecera ────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4
                        border-b border-slate-200 shrink-0">
          <div>
            <h2 className="text-slate-900 font-semibold text-base">
              Notas de la factura
            </h2>
            <p className="text-slate-500 text-xs mt-0.5">
              {movimiento.proveedor_cliente ?? '—'}
              {movimiento.numero_factura ? ` · Nº ${movimiento.numero_factura}` : ''}
            </p>
          </div>
          <button
            onClick={onCerrar}
            className="text-slate-400 hover:text-slate-700 transition-colors"
            aria-label="Cerrar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24"
                 strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Cuerpo scrolleable ──────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Resumen de montos */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <ResumenItem label="Monto bruto"     valor={fmt(movimiento.monto_bruto)} />
            <ResumenItem label="Total débitos"   valor={fmt(totalDebitos)}  color="text-orange-600" />
            <ResumenItem label="Total créditos"  valor={fmt(totalCreditos)} color="text-emerald-600" />
            <ResumenItem label="Monto ajustado"  valor={fmt(montoAjustado)} bold />
          </div>

          {/* Lista de notas */}
          {cargando ? (
            <div className="flex items-center gap-2 text-slate-500 text-sm py-4">
              <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-500
                               rounded-full animate-spin" />
              Cargando notas…
            </div>
          ) : notas.length === 0 ? (
            <p className="text-slate-400 text-sm py-2">
              Esta factura no tiene notas todavía.
            </p>
          ) : (
            <div className="space-y-2">
              {notas.map(n => (
                <div key={n.id}
                     className="flex items-start justify-between gap-3
                                bg-slate-50 border border-slate-200
                                rounded-lg px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {/* Badge tipo */}
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${clsTipo(n.tipo_nota)}`}>
                        {labelTipo(n.tipo_nota)}
                      </span>
                      {/* Número de nota */}
                      {n.numero_nota && (
                        <span className="text-xs text-slate-500">Nº {n.numero_nota}</span>
                      )}
                    </div>
                    {n.concepto && (
                      <p className="text-slate-600 text-xs mt-0.5 truncate">{n.concepto}</p>
                    )}
                  </div>
                  {/* Monto */}
                  <span className={`text-sm font-semibold tabular-nums shrink-0
                    ${n.tipo_nota === 'credito' ? 'text-emerald-700' : 'text-orange-700'}`}>
                    {n.tipo_nota === 'credito' ? '−' : '+'}{fmt(n.monto)}
                  </span>
                  {/* Eliminar */}
                  {eliminando === n.id ? (
                    <span className="w-4 h-4 border-2 border-red-300 border-t-red-500
                                     rounded-full animate-spin shrink-0" />
                  ) : (
                    <button
                      onClick={() => handleEliminar(n.id)}
                      className="text-slate-300 hover:text-red-500 transition-colors shrink-0"
                      title="Eliminar nota"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24"
                           strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round"
                          d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107
                             1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244
                             2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456
                             0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114
                             1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964
                             51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5
                             0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Formulario para agregar nota ────────────────────── */}
          <div className="border-t border-slate-200 pt-5">
            <h3 className="text-slate-700 font-medium text-sm mb-4">Agregar nota</h3>
            <form onSubmit={handleGuardar} noValidate className="space-y-3">
              {/* Fila 1: Tipo · Número · Monto */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Tipo</label>
                  <select
                    value={form.tipo_nota}
                    onChange={e => setForm(f => ({ ...f, tipo_nota: e.target.value }))}
                    className={selectCls}
                  >
                    <option value="credito">Nota de crédito</option>
                    <option value="debito">Nota de débito</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Número de nota
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: NC-0001"
                    value={form.numero_nota}
                    onChange={e => setForm(f => ({ ...f, numero_nota: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Monto *
                  </label>
                  <input
                    type="number" min="0.01" step="0.01"
                    placeholder="0,00"
                    value={form.monto}
                    onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                    className={inputCls + ' text-right'}
                  />
                </div>
              </div>
              {/* Concepto */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Concepto
                </label>
                <input
                  type="text"
                  placeholder="Motivo de la nota"
                  value={form.concepto}
                  onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))}
                  className={inputCls}
                />
              </div>

              {error && (
                <p className="text-red-600 text-xs flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={guardando}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700
                           disabled:opacity-50 text-white text-sm font-medium
                           px-4 py-2 rounded-lg transition-colors"
              >
                {guardando && (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white
                                   rounded-full animate-spin" />
                )}
                {guardando ? 'Guardando…' : 'Agregar nota'}
              </button>
            </form>
          </div>

        </div>
      </div>
    </div>
  )
}

// ── Helpers de clases ──────────────────────────────────────────
const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-200
  text-slate-900 placeholder:text-slate-400
  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`

const selectCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-200
  text-slate-900 bg-white
  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`

// ── Subcomponente: celda de resumen de monto ──────────────────
function ResumenItem({ label, valor, color = 'text-slate-800', bold = false }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className={`text-sm tabular-nums ${color} ${bold ? 'font-bold' : 'font-medium'}`}>
        {valor}
      </p>
    </div>
  )
}

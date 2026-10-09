// pages/finanzas/components/FormularioMovimiento.jsx
// Formulario de alta de movimientos. Es dinámico: los campos
// que se muestran cambian según la categoría seleccionada.
//
// Props:
//   obras     → array [{ id, codigo, nombre }]
//   rubros    → array [{ id, nombre, tipo }]
//   cuentas   → array [{ id, nombre, tipo }]
//   debitos   → array de debitos_automaticos_config activos
//   userId    → id del usuario logueado
//   onGuardado → callback sin args, se llama tras INSERT exitoso
//   onCancelar → callback para cerrar el panel
//   fondos    → array [{ id, nombre, activo }] de fondos de inversión (para
//     los movimientos FIMA: con un solo fondo se asigna solo, con varios se elige)

import { useState, useEffect } from 'react'
import { supabase } from '../../../supabaseClient'
import { CARD, TONOS, Icono, ICONOS, CLS_LABEL, CLS_CAMPO } from '../../directorio/utilsDirectorio'

// ─────────────────────────────────────────────────────────────
// Constantes de dominio
// ─────────────────────────────────────────────────────────────

// Categorías disponibles con su label y el tipo de movimiento
// que generan (ingreso / egreso)
const CATEGORIAS = [
  { value: 'factura',           label: 'Factura a pagar',          tipo: 'egreso'  },
  { value: 'ingreso_cliente',   label: 'Ventas',                    tipo: 'ingreso' },
  { value: 'sueldo',            label: 'Sueldo',                    tipo: 'egreso'  },
  { value: 'impuesto',          label: 'Impuesto / Comisión bancaria', tipo: 'egreso' },
  { value: 'debito_automatico', label: 'Débito automático',         tipo: 'egreso'  },
  { value: 'fima',              label: 'Movimiento FIMA',           tipo: null      }, // depende del subtipo
  { value: 'reintegro_impuestos', label: 'Reintegro impuestos',     tipo: 'ingreso' },
  { value: 'reintegro_seguros',   label: 'Reintegro seguros',       tipo: 'ingreso' },
  { value: 'reintegro_otros',     label: 'Otros reintegros',        tipo: 'ingreso' },
  { value: 'otro',              label: 'Otro',                      tipo: 'egreso'  },
]

const CATEGORIAS_REINTEGRO = ['reintegro_impuestos', 'reintegro_seguros', 'reintegro_otros']

// Conceptos fijos para "Impuesto / Comisión bancaria" (se repiten siempre,
// se eligen de una lista en vez de escribirlos a mano cada vez).
const CONCEPTOS_IMPUESTO = [
  'IVA',
  'COM. GESTION',
  'TRANSF.FDOS',
  'COMISION SERVICIO DE CUENTA',
  'INTERESES SOBRE SALDOS',
  'IMPUESTO DE SELLOS',
  'COM. CAJA DE SEGURIDAD',
  'ING. BRUTOS S/ CRED',
  'REG.RECAU.SIRCREB',
  'PERCEP. IVA',
  'IMP. ING. BRUTOS',
  'IMP. DEB. LEY 25413 GRAL.',
  'IMP. CRE. LEY 25413',
  'DEV.IMP.DEB.LEY 25413-ALIC.GENERAL',
]

const FORMAS_PAGO = [
  { value: 'transferencia',     label: 'Transferencia'     },
  { value: 'echeq',             label: 'eCheq'             },
  { value: 'debito_automatico', label: 'Débito automático' },
]

// Mismos rubros que ve Operaciones al cargar presupuestos, más "Ventas"
// (que se usa para la categoría Ventas / ingreso_cliente).
const RUBROS_PERMITIDOS_FINANZAS = [
  'Materiales',
  'Subcontratos',
  'MO directa con Carg Sociales',
  'Mano de obra indirecta con cargas',
  'Vehículos',
  'Otros Gastos Operativos',
  'Gastos Generales',
  'Impuestos',
  'Ventas',
]

// Desde diciembre de 2024 (fijo) hasta 24 meses después de hoy
function generarPeriodos() {
  const periodos = []
  const hoy = new Date()
  const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 24, 1)
  for (let d = new Date(2024, 11, 1); d <= fin; d.setMonth(d.getMonth() + 1)) {
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    periodos.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  return periodos
}
const PERIODOS = generarPeriodos()

function periodoActual() {
  const h = new Date()
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-01`
}

// Estado inicial del formulario (todos los campos posibles)
const FORM_VACIO = {
  categoria:          '',
  // FIMA subtipo
  fima_subtipo:       'rescate', // 'rescate' (ingreso) | 'suscripcion' (egreso)
  // Campos comunes
  proveedor_cliente:  '',
  numero_factura:     '',
  fecha_factura:      '',
  obra_id:            '',
  rubro_id:           '',
  forma_pago:         'transferencia',
  numero_op:          '',
  fecha_pago:         '',
  periodo:            PERIODOS[0].value,
  cuenta_id:          '', // solo se usa si hay más de una cuenta activa (ver cuentaUnica)
  fondo_id:           '', // solo se usa en FIMA si hay más de un fondo (ver fondoUnico)
  monto_bruto:        '',
  concepto:           '',
  // Débito automático específico
  debito_config_id:   '',
}

// ══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function FormularioMovimiento({
  obras, rubros, cuentas, debitos, userId, onGuardado, onCancelar, fondos = [],
}) {
  const [form,         setForm]         = useState(FORM_VACIO)
  const [guardando,    setGuardando]    = useState(false)
  const [error,        setError]        = useState('')
  const [advertencia,  setAdvertencia]  = useState(null) // objeto con info de presupuesto

  // Actualiza un campo del form
  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }))

  // ── Cuando cambia la categoría: resetea el form excepto categoría ──
  function handleCategoria(cat) {
    // Impuestos/comisiones bancarias son del mes en que se cargan, no hay
    // que elegir período a mano cada vez.
    const periodo = cat === 'impuesto' ? periodoActual() : FORM_VACIO.periodo
    setForm({ ...FORM_VACIO, categoria: cat, periodo })
    setError('')
    setAdvertencia(null)
  }

  // ── Cuando cambia el config de débito automático ──────────────
  function handleDebitoConfig(id) {
    const config = debitos.find(d => d.id === id)
    if (!config) { set('debito_config_id', ''); return }
    // Pre-completamos nombre, monto estimado y día del mes
    const [anio, mes] = form.periodo.split('-')
    const diaStr = String(config.dia_del_mes).padStart(2, '0')
    const fechaPago = `${anio}-${mes}-${diaStr}`
    setForm(f => ({
      ...f,
      debito_config_id:  config.id,
      proveedor_cliente: config.nombre,
      monto_bruto:       String(config.monto_estimado),
      rubro_id:          config.rubro_id ?? '',
      obra_id:           config.obra_id  ?? '',
      fecha_pago:        fechaPago,
    }))
  }

  // ── Cuando cambia la obra: resetea el rubro ───────────────────
  function handleObra(obraId) {
    setForm(f => ({ ...f, obra_id: obraId, rubro_id: '' }))
    setAdvertencia(null)
  }

  // ── Rubros filtrados según la obra seleccionada ───────────────
  // Si hay obra → mostrar rubros tipo 'obra'
  // Si no hay obra → mostrar rubros tipo 'general'
  const rubrosFiltrados = rubros.filter(r =>
    r.activo && RUBROS_PERMITIDOS_FINANZAS.includes(r.nombre)
    && (form.obra_id ? r.tipo === 'obra' : r.tipo === 'general')
  )

  // ── Cuenta: hoy solo existe Galicia, así que se asigna sola y no
  // se le hace elegir nada a Finanzas. Si el día de mañana hay más de
  // una cuenta activa, esto vuelve a pedir que se elija.
  const cuentaUnica = cuentas.filter(c => c.activa).length === 1 ? cuentas.find(c => c.activa) : null

  // ── Fondo (solo movimientos FIMA): con un solo fondo se asigna solo; con
  // varios, Finanzas elige a cuál pertenece el movimiento.
  const fondosActivos = fondos.filter(f => f.activo !== false)
  const fondoUnico = fondosActivos.length === 1 ? fondosActivos[0] : null

  // ── Verificación de presupuesto (solo para facturas con obra+rubro) ──
  useEffect(() => {
    if (
      form.categoria !== 'factura' ||
      !form.obra_id  ||
      !form.rubro_id ||
      !form.monto_bruto ||
      isNaN(Number(form.monto_bruto))
    ) {
      setAdvertencia(null)
      return
    }

    let cancelado = false

    async function verificarPresupuesto() {
      const periodoDate = form.periodo

      // Total presupuestado para esa obra/rubro/período
      const { data: pres } = await supabase
        .from('presupuestos')
        .select('monto')
        .eq('obra_id',  form.obra_id)
        .eq('rubro_id', form.rubro_id)
        .eq('periodo',  periodoDate)

      const presupuestado = (pres ?? []).reduce((s, p) => s + Number(p.monto), 0)
      if (presupuestado === 0) { if (!cancelado) setAdvertencia(null); return }

      // Total ya gastado en movimientos
      const { data: movs } = await supabase
        .from('movimientos')
        .select('monto_bruto')
        .eq('obra_id',   form.obra_id)
        .eq('rubro_id',  form.rubro_id)
        .eq('categoria', 'factura')
        .eq('periodo',   periodoDate)

      const gastado = (movs ?? []).reduce((s, m) => s + Number(m.monto_bruto), 0)
      const nuevo   = Number(form.monto_bruto)

      if (cancelado) return

      if ((gastado + nuevo) > presupuestado) {
        const rubroNombre = rubros.find(r => r.id === form.rubro_id)?.nombre ?? 'este rubro'
        const obraNombre  = obras.find(o => o.id === form.obra_id)?.nombre   ?? 'esta obra'
        const periodoLabel = PERIODOS.find(p => p.value === form.periodo)?.label ?? form.periodo
        setAdvertencia({ presupuestado, gastado, nuevo, rubroNombre, obraNombre, periodoLabel })
      } else {
        setAdvertencia(null)
      }
    }

    // Debounce simple: espera 400ms tras el último cambio para no spamear Supabase
    const timer = setTimeout(verificarPresupuesto, 400)
    return () => { cancelado = true; clearTimeout(timer) }
  }, [form.obra_id, form.rubro_id, form.monto_bruto, form.periodo, form.categoria, obras, rubros])

  // ── SUBMIT ─────────────────────────────────────────────────────
  async function handleGuardar(e) {
    e.preventDefault()
    setError('')

    // Validaciones comunes
    if (!form.categoria)   { setError('Seleccioná una categoría.'); return }
    if (!form.periodo)     { setError('Seleccioná un período.'); return }
    if (!form.fecha_pago)  { setError('Elegí la fecha de pago (sin fecha el movimiento no entra bien al Cash Flow).'); return }
    const cuentaId = cuentaUnica?.id ?? form.cuenta_id
    if (!cuentaId)          { setError('Seleccioná una cuenta.'); return }
    const fondoId = form.categoria === 'fima' ? (fondoUnico?.id ?? (form.fondo_id || null)) : null
    if (form.categoria === 'fima' && fondosActivos.length > 1 && !fondoId) { setError('Seleccioná el fondo.'); return }
    if (!form.monto_bruto || isNaN(Number(form.monto_bruto)) || Number(form.monto_bruto) <= 0) {
      setError('Ingresá un monto válido mayor a cero.')
      return
    }

    // Determinamos tipo según categoría / subtipo FIMA
    let tipo = CATEGORIAS.find(c => c.value === form.categoria)?.tipo
    if (form.categoria === 'fima') {
      tipo = form.fima_subtipo === 'rescate' ? 'ingreso' : 'egreso'
    }

    // El rubro de una Venta siempre es "Ventas" -- se asigna solo, no se elige.
    let rubroId = form.rubro_id || null
    if (form.categoria === 'ingreso_cliente') {
      const rubroVentas = rubros.find(r => r.nombre === 'Ventas' && r.tipo === (form.obra_id ? 'obra' : 'general'))
      rubroId = rubroVentas?.id ?? null
    }

    // Construimos el payload limpio (solo campos relevantes)
    const payload = {
      tipo,
      categoria:         form.categoria,
      periodo:           form.periodo,
      cuenta_id:         cuentaId,
      monto_bruto:       Number(form.monto_bruto),
      estado:            'proyectado',
      created_by:        userId,
      // Opcionales según categoría
      proveedor_cliente: form.proveedor_cliente.trim()  || null,
      numero_factura:    form.numero_factura.trim()     || null,
      fecha_factura:     form.fecha_factura             || null,
      obra_id:           form.obra_id                   || null,
      rubro_id:          rubroId,
      concepto:          form.concepto.trim()           || null,
      forma_pago:        form.forma_pago                || null,
      numero_op:         form.numero_op.trim()          || null,
      fecha_pago:        form.fecha_pago                || null,
    }

    // fondo_id solo se manda cuando hay un fondo (la columna es nueva).
    if (fondoId) payload.fondo_id = fondoId

    setGuardando(true)
    const { error: err } = await supabase.from('movimientos').insert(payload)
    if (err) { setError('Error al guardar el movimiento.'); setGuardando(false); return }

    setForm(FORM_VACIO)
    setAdvertencia(null)
    setGuardando(false)
    onGuardado()
  }

  const cat = form.categoria

  // ── RENDER ──────────────────────────────────────────────────────
  return (
    <div className={`${CARD} p-5 sm:p-6 mb-6`}>
      <div className="flex items-start justify-between gap-3 mb-6">
        <div className="flex items-center gap-3.5">
          <span className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center ${TONOS.teal}`}>
            <Icono {...ICONOS.lista} className="w-5 h-5" />
          </span>
          <div>
            <h2 className="text-slate-900 font-bold text-base leading-tight">Nuevo movimiento</h2>
            <p className="text-slate-400 text-xs mt-0.5">Elegí la categoría y completá los datos. Los campos con * son obligatorios.</p>
          </div>
        </div>
        <button onClick={onCancelar}
          className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
          aria-label="Cerrar">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleGuardar} noValidate className="space-y-4">

        {/* ── Selector de categoría (siempre visible) ────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Campo label="Categoría *">
            <select value={cat} onChange={e => handleCategoria(e.target.value)} className={selectCls}>
              <option value="">— Seleccioná —</option>
              {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Campo>

          {/* Subtipo FIMA */}
          {cat === 'fima' && (
            <Campo label="Operación *">
              <select value={form.fima_subtipo} onChange={e => set('fima_subtipo', e.target.value)} className={selectCls}>
                <option value="rescate">Rescate (ingreso)</option>
                <option value="suscripcion">Suscripción (egreso)</option>
              </select>
            </Campo>
          )}

          {/* Fondo FIMA: solo se muestra si hay más de uno para elegir */}
          {cat === 'fima' && fondosActivos.length > 1 && (
            <Campo label="Fondo *">
              <select value={form.fondo_id} onChange={e => set('fondo_id', e.target.value)} className={selectCls}>
                <option value="">— Seleccioná —</option>
                {fondosActivos.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
              </select>
            </Campo>
          )}

          {/* Selector de config de débito automático */}
          {cat === 'debito_automatico' && (
            <Campo label="Débito configurado *">
              <select
                value={form.debito_config_id}
                onChange={e => handleDebitoConfig(e.target.value)}
                className={selectCls}
              >
                <option value="">— Seleccioná —</option>
                {debitos.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.nombre} (día {d.dia_del_mes})
                  </option>
                ))}
              </select>
            </Campo>
          )}
        </div>

        {/* ── Campos dinámicos según categoría ─────────────────── */}
        {cat && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

            {/* Proveedor / Cliente / Origen del reintegro */}
            {(cat === 'factura' || cat === 'ingreso_cliente' || cat === 'otro' || CATEGORIAS_REINTEGRO.includes(cat)) && (
              <Campo label={cat === 'ingreso_cliente' ? 'Cliente' : CATEGORIAS_REINTEGRO.includes(cat) ? 'Origen' : 'Proveedor'}>
                <input type="text"
                  placeholder={cat === 'ingreso_cliente' ? 'Nombre del cliente' : CATEGORIAS_REINTEGRO.includes(cat) ? 'Ej: AFIP, aseguradora...' : 'Nombre del proveedor'}
                  value={form.proveedor_cliente}
                  onChange={e => set('proveedor_cliente', e.target.value)}
                  className={inputCls} />
              </Campo>
            )}

            {/* Número de factura / recibo */}
            {(cat === 'factura' || cat === 'ingreso_cliente') && (
              <Campo label={cat === 'ingreso_cliente' ? 'Nº Factura / Recibo' : 'Número de factura'}>
                <input type="text" placeholder="Ej: FA-00012"
                  value={form.numero_factura}
                  onChange={e => set('numero_factura', e.target.value)}
                  className={inputCls} />
              </Campo>
            )}

            {/* Fecha de factura */}
            {cat === 'factura' && (
              <Campo label="Fecha de factura">
                <input type="date" value={form.fecha_factura}
                  onChange={e => set('fecha_factura', e.target.value)} className={inputCls} />
              </Campo>
            )}

            {/* Obra (factura, ingreso_cliente, otro) */}
            {(cat === 'factura' || cat === 'ingreso_cliente' || cat === 'otro') && (
              <Campo label="Obra">
                <select value={form.obra_id} onChange={e => handleObra(e.target.value)} className={selectCls}>
                  <option value="">— Sin obra / General —</option>
                  {obras.filter(o => o.activa).map(o => (
                    <option key={o.id} value={o.id}>{o.codigo} · {o.nombre}</option>
                  ))}
                </select>
              </Campo>
            )}

            {/* Rubro (solo para factura) */}
            {cat === 'factura' && (
              <Campo label="Rubro">
                <select value={form.rubro_id} onChange={e => set('rubro_id', e.target.value)} className={selectCls}>
                  <option value="">— Sin rubro —</option>
                  {rubrosFiltrados.map(r => (
                    <option key={r.id} value={r.id}>{r.nombre}</option>
                  ))}
                </select>
              </Campo>
            )}

            {/* Forma de pago (factura) */}
            {cat === 'factura' && (
              <Campo label="Forma de pago">
                <select value={form.forma_pago} onChange={e => set('forma_pago', e.target.value)} className={selectCls}>
                  {FORMAS_PAGO.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </Campo>
            )}

            {/* Número de OP (factura) */}
            {cat === 'factura' && (
              <Campo label="Número de OP">
                <input type="text" placeholder="Ej: OP-2026-001"
                  value={form.numero_op}
                  onChange={e => set('numero_op', e.target.value)} className={inputCls} />
              </Campo>
            )}

            {/* Fecha de pago */}
            {cat !== '' && (
              <Campo label="Fecha de pago *">
                <input type="date" value={form.fecha_pago}
                  onChange={e => set('fecha_pago', e.target.value)} className={inputCls} />
              </Campo>
            )}

            {/* Período */}
            <Campo label="Período *">
              <select value={form.periodo} onChange={e => set('periodo', e.target.value)} className={selectCls}>
                {PERIODOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </Campo>

            {/* Cuenta: solo se muestra si hay que elegir (más de una cuenta activa) */}
            {!cuentaUnica && (
              <Campo label="Cuenta *">
                <select value={form.cuenta_id} onChange={e => set('cuenta_id', e.target.value)} className={selectCls}>
                  <option value="">— Seleccioná —</option>
                  {cuentas.filter(c => c.activa).map(c => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </Campo>
            )}

            {/* Monto bruto */}
            <Campo label="Monto bruto *">
              <input type="number" min="0.01" step="0.01" placeholder="0,00"
                value={form.monto_bruto}
                onChange={e => set('monto_bruto', e.target.value)}
                className={inputCls + ' text-right'} />
            </Campo>

            {/* Concepto */}
            <Campo label="Concepto">
              {cat === 'impuesto' ? (
                <select value={form.concepto} onChange={e => set('concepto', e.target.value)} className={selectCls}>
                  <option value="">— Seleccioná —</option>
                  {CONCEPTOS_IMPUESTO.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : (
                <input type="text" placeholder="Descripción libre"
                  value={form.concepto}
                  onChange={e => set('concepto', e.target.value)}
                  className={inputCls} />
              )}
            </Campo>

          </div>
        )}

        {/* ── Advertencia de presupuesto ────────────────────────── */}
        {advertencia && (
          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200
                          text-amber-800 text-sm rounded-xl px-4 py-3">
            <svg className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="font-medium">
                Esta factura supera el presupuesto de {advertencia.rubroNombre} para {advertencia.obraNombre} en {advertencia.periodoLabel}.
              </p>
              <p className="text-xs mt-1 text-amber-700">
                Presupuestado: {fmtARS(advertencia.presupuestado)} · Gastado: {fmtARS(advertencia.gastado)} · Este movimiento: {fmtARS(advertencia.nuevo)}
              </p>
            </div>
          </div>
        )}

        {/* ── Error general ────────────────────────────────────── */}
        {error && (
          <p className="text-red-600 text-sm flex items-center gap-1.5">
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            {error}
          </p>
        )}

        {/* ── Botones ────────────────────────────────────────────── */}
        {cat && (
          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={guardando}
              className="inline-flex items-center gap-2 text-white text-sm font-semibold px-6 py-2.5 rounded-xl
                         transition-colors disabled:opacity-50 shadow-[0_6px_16px_rgba(14,116,144,0.28)] hover:brightness-90"
              style={{ backgroundColor: '#0e7490' }}>
              {guardando && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {guardando ? 'Guardando…' : 'Guardar movimiento'}
            </button>
            {advertencia && (
              <span className="text-xs text-amber-600 font-medium">
                ⚠️ Podés guardar igual — es solo una advertencia
              </span>
            )}
          </div>
        )}

      </form>
    </div>
  )
}

// ── Utilidades ────────────────────────────────────────────────
const fmtARS = n => new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 2,
}).format(n ?? 0)

const inputCls  = CLS_CAMPO + ' placeholder:text-slate-300'

const selectCls = CLS_CAMPO

// Wrapper de campo con label
function Campo({ label, children }) {
  return (
    <div>
      <label className={CLS_LABEL}>{label}</label>
      {children}
    </div>
  )
}

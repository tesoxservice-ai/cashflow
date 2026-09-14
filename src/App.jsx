// App.jsx
// Componente raíz de la aplicación.
// Define todas las rutas con React Router y aplica
// las guardas de autenticación mediante ProtectedRoute.
//
// Árbol de rutas:
//   /                             → redirige a /login
//   /login                        → Login (pública)
//   /operaciones                  → DashboardOperaciones (rol 'operaciones')
//   /operaciones/presupuestos     → Presupuestos         (rol 'operaciones')
//   /operaciones/obras            → Obras                (rol 'operaciones')
//   /finanzas                     → DashboardFinanzas    (rol 'finanzas')
//   /finanzas/obras               → Obras                (rol 'finanzas')
//   /finanzas/movimientos         → Movimientos          (rol 'finanzas')
//   /finanzas/cashflow            → CashFlow             (rol 'finanzas')
//   /finanzas/presupuesto         → PresupuestoVsReal    (rol 'finanzas')
//   /finanzas/exportar            → Exportar             (rol 'finanzas')
//   *                             → redirige a /login (ruta no encontrada)

import { Routes, Route, Navigate } from 'react-router-dom'

import Login                  from './pages/Login'
import DashboardOperaciones   from './pages/operaciones/DashboardOperaciones'
import Presupuestos           from './pages/operaciones/Presupuestos'
import DashboardFinanzas      from './pages/finanzas/DashboardFinanzas'
import Obras                  from './pages/finanzas/Obras'
import Movimientos            from './pages/finanzas/Movimientos'
import CashFlow               from './pages/finanzas/CashFlow'
import PresupuestoVsReal      from './pages/finanzas/PresupuestoVsReal'
import Exportar               from './pages/finanzas/Exportar'
import ProtectedRoute         from './components/ProtectedRoute'

export default function App() {
  return (
    <Routes>
      {/* ── Ruta raíz: redirige siempre al login ─────────────── */}
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* ── Login: ruta pública ───────────────────────────────── */}
      <Route path="/login" element={<Login />} />

      {/* ── Dashboard Operaciones: solo rol 'operaciones' ─────── */}
      <Route
        path="/operaciones"
        element={
          <ProtectedRoute rolRequerido="operaciones">
            <DashboardOperaciones />
          </ProtectedRoute>
        }
      />

      {/* ── Módulo Presupuestos: solo rol 'operaciones' ───────── */}
      <Route
        path="/operaciones/presupuestos"
        element={
          <ProtectedRoute rolRequerido="operaciones">
            <Presupuestos />
          </ProtectedRoute>
        }
      />

      {/* ── Módulo Obras desde Operaciones: rol 'operaciones' ─── */}
      <Route
        path="/operaciones/obras"
        element={
          <ProtectedRoute rolRequerido="operaciones">
            <Obras />
          </ProtectedRoute>
        }
      />

      {/* ── Dashboard Finanzas: solo rol 'finanzas' ───────────── */}
      <Route
        path="/finanzas"
        element={
          <ProtectedRoute rolRequerido="finanzas">
            <DashboardFinanzas />
          </ProtectedRoute>
        }
      />

      {/* ── Módulo Obras desde Finanzas: rol 'finanzas' ───────── */}
      <Route
        path="/finanzas/obras"
        element={
          <ProtectedRoute rolRequerido="finanzas">
            <Obras />
          </ProtectedRoute>
        }
      />

      {/* ── Módulo Movimientos: solo rol 'finanzas' ───────────── */}
      <Route
        path="/finanzas/movimientos"
        element={
          <ProtectedRoute rolRequerido="finanzas">
            <Movimientos />
          </ProtectedRoute>
        }
      />

      {/* ── Módulo CashFlow: solo rol 'finanzas' ─────────────── */}
      <Route
        path="/finanzas/cashflow"
        element={
          <ProtectedRoute rolRequerido="finanzas">
            <CashFlow />
          </ProtectedRoute>
        }
      />

      {/* ── Módulo Presupuesto vs Real: solo rol 'finanzas' ──── */}
      <Route
        path="/finanzas/presupuesto"
        element={
          <ProtectedRoute rolRequerido="finanzas">
            <PresupuestoVsReal />
          </ProtectedRoute>
        }
      />

      {/* ── Módulo Exportar: solo rol 'finanzas' ─────────────── */}
      <Route
        path="/finanzas/exportar"
        element={
          <ProtectedRoute rolRequerido="finanzas">
            <Exportar />
          </ProtectedRoute>
        }
      />

      {/* ── Ruta comodín: cualquier path desconocido → login ──── */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

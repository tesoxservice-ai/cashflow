// App.jsx
// Árbol de rutas completo con Ventas Proyectadas para ambos roles.

import { Routes, Route, Navigate } from 'react-router-dom'

import Login                        from './pages/Login'
import DashboardOperaciones         from './pages/operaciones/DashboardOperaciones'
import Presupuestos                 from './pages/operaciones/Presupuestos'
import PresupuestoVsRealOperaciones from './pages/operaciones/PresupuestoVsReal'
import VentasProyectadasOp          from './pages/operaciones/VentasProyectadas'
import DashboardFinanzas            from './pages/finanzas/DashboardFinanzas'
import Obras                        from './pages/finanzas/Obras'
import Movimientos                  from './pages/finanzas/Movimientos'
import CashFlow                     from './pages/finanzas/CashFlow'
import PresupuestoVsReal            from './pages/finanzas/PresupuestoVsReal'
import VentasProyectadasFin         from './pages/finanzas/VentasProyectadas'
import Exportar                     from './pages/finanzas/Exportar'
import MargenPorObra                from './pages/MargenPorObra'
import DashboardDirectorio          from './pages/directorio/Dashboard'
import ProtectedRoute               from './components/ProtectedRoute'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />

      {/* ── Operaciones ───────────────────────────────────────── */}
      <Route path="/operaciones" element={
        <ProtectedRoute rolRequerido="operaciones"><DashboardOperaciones /></ProtectedRoute>
      } />
      <Route path="/operaciones/presupuestos" element={
        <ProtectedRoute rolRequerido="operaciones"><Presupuestos /></ProtectedRoute>
      } />
      <Route path="/operaciones/obras" element={
        <ProtectedRoute rolRequerido="operaciones"><Obras /></ProtectedRoute>
      } />
      <Route path="/operaciones/presupuesto" element={
        <ProtectedRoute rolRequerido="operaciones"><PresupuestoVsRealOperaciones /></ProtectedRoute>
      } />
      <Route path="/operaciones/ventas" element={
        <ProtectedRoute rolRequerido="operaciones"><VentasProyectadasOp /></ProtectedRoute>
      } />
      <Route path="/operaciones/margen" element={
        <ProtectedRoute rolRequerido="operaciones"><MargenPorObra /></ProtectedRoute>
      } />

      {/* ── Finanzas ──────────────────────────────────────────── */}
      <Route path="/finanzas" element={
        <ProtectedRoute rolRequerido="finanzas"><DashboardFinanzas /></ProtectedRoute>
      } />
      <Route path="/finanzas/obras" element={
        <ProtectedRoute rolRequerido="finanzas"><Obras /></ProtectedRoute>
      } />
      <Route path="/finanzas/movimientos" element={
        <ProtectedRoute rolRequerido="finanzas"><Movimientos /></ProtectedRoute>
      } />
      <Route path="/finanzas/cashflow" element={
        <ProtectedRoute rolRequerido="finanzas"><CashFlow /></ProtectedRoute>
      } />
      <Route path="/finanzas/presupuesto" element={
        <ProtectedRoute rolRequerido="finanzas"><PresupuestoVsReal /></ProtectedRoute>
      } />
      <Route path="/finanzas/ventas" element={
        <ProtectedRoute rolRequerido="finanzas"><VentasProyectadasFin /></ProtectedRoute>
      } />
      <Route path="/finanzas/exportar" element={
        <ProtectedRoute rolRequerido="finanzas"><Exportar /></ProtectedRoute>
      } />
      <Route path="/finanzas/margen" element={
        <ProtectedRoute rolRequerido="finanzas"><MargenPorObra /></ProtectedRoute>
      } />

      {/* ── Directorio (solo lectura) ─────────────────────────── */}
      <Route path="/directorio" element={
        <ProtectedRoute rolRequerido="directorio"><DashboardDirectorio /></ProtectedRoute>
      } />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
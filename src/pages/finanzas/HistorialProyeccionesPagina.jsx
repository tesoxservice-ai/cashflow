// pages/finanzas/HistorialProyeccionesPagina.jsx
// Historial de proyecciones dentro de Finanzas. Solo lo abre Santiago Verdinelli
// (el Directorio lo ve en su propio panel). Ruta: /finanzas/historial-proyecciones

import { useAuth } from '../../context/AuthContext'
import SidebarFinanzas, { CLASE_SIDEBAR } from './components/SidebarFinanzas'
import HistorialProyecciones from '../../components/HistorialProyecciones'

export default function HistorialProyeccionesPagina() {
  const { perfil } = useAuth()
  return (
    <div className={`min-h-screen flex flex-col ${CLASE_SIDEBAR}`} style={{ backgroundColor: '#f0f7fa' }}>
      <SidebarFinanzas perfil={perfil} activo="proyecciones" />
      <main className="flex-1 w-full max-w-6xl px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-slate-900 text-2xl font-extrabold tracking-tight">Historial de proyecciones</h1>
          <p className="text-slate-400 text-sm mt-0.5 max-w-2xl">
            Fotos de cómo estaba la proyección en cada momento, para ver cuánto cambió entre una y otra.
          </p>
        </div>
        <HistorialProyecciones />
      </main>
    </div>
  )
}

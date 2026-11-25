// pages/finanzas/RetencionesPagina.jsx
// Retenciones a favor dentro de Finanzas (el Directorio lo ve en su propio panel). Ruta: /finanzas/retenciones

import { useAuth } from '../../context/AuthContext'
import SidebarFinanzas, { CLASE_SIDEBAR } from './components/SidebarFinanzas'
import PanelRetenciones from '../../components/PanelRetenciones'

export default function RetencionesPagina() {
  const { perfil } = useAuth()
  return (
    <div className={`min-h-screen flex flex-col ${CLASE_SIDEBAR}`} style={{ backgroundColor: '#f0f7fa' }}>
      <SidebarFinanzas perfil={perfil} activo="retenciones" />
      <main className="flex-1 w-full max-w-6xl px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-slate-900 text-2xl font-extrabold tracking-tight">Retenciones</h1>
          <p className="text-slate-400 text-sm mt-0.5 max-w-2xl">
            Cuánto tenemos acumulado a favor en retenciones, cuánto se va a sumar con los cobros proyectados y cuánto queda para pagar de impuestos.
          </p>
        </div>
        <PanelRetenciones />
      </main>
    </div>
  )
}

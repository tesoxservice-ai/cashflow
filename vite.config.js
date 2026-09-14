// vite.config.js
// Configuración de Vite para el proyecto React.
// Registra el plugin oficial de React para habilitar JSX y Fast Refresh.

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})

// tailwind.config.js
// Configuración de Tailwind CSS.
// El campo content le indica a Tailwind qué archivos escanear
// para purgar las clases no usadas en producción.

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

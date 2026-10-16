// src/lib/permisos.js
// Permisos puntuales que no dependen del rol.
//
// Editar y agregar presupuestos desde Finanzas: solo Santiago Verdinelli. El resto de Finanzas
// (y Directorio) no ve el módulo. Operaciones sigue cargando presupuestos como siempre.
// La restricción real contra la base está en sql/presupuestos_solo_santiago_finanzas.sql;
// esto es lo que decide qué ve cada uno en pantalla.

export const EMAIL_EDITOR_PRESUPUESTOS_FINANZAS = 'sverdinelli@psdata.com.ar'

export const puedeEditarPresupuestosEnFinanzas = user =>
  (user?.email ?? '').trim().toLowerCase() === EMAIL_EDITOR_PRESUPUESTOS_FINANZAS

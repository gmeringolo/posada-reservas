// =====================================================================
//  CONFIGURACIÓN — completá estos datos con los de tu proyecto Supabase
//  (Supabase → Project Settings → API / API Keys)
// =====================================================================
window.CONFIG = {
  // Ejemplo: "https://abcdefghijklmnop.supabase.co"
  SUPABASE_URL: "https://gcxarqjzqpfwzhrkvlir.supabase.co",

  // La clave pública: "anon public" o "publishable" (empieza con eyJ... o sb_publishable_...)
  // ¡Nunca pongas acá la "service_role" ni la "secret"!
  SUPABASE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjeGFycWp6cXBmd3pocmt2bGlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4NTY4MTUsImV4cCI6MjEwODQzMjgxNX0.INWCgPQl2uWrcR8FE4lyB-esvlpShJaOxAct78EzKjY",

  // Login con usuario y contraseña (un único usuario creado en Supabase).
  // El usuario "Posada" se guarda en Supabase como el email posada@example.com
  // (Supabase pide un email; example.com es un dominio de ejemplo que no recibe correos).
  REQUIERE_LOGIN: true,
  LOGIN_DOMINIO: "example.com",

  // Las 4 casas. El id no se puede cambiar después de cargar reservas.
  CASAS: [
    { id: "verde",   nombre: "Verde" },
    { id: "azul",    nombre: "Azul" },
    { id: "roja",    nombre: "Roja" },
    { id: "mostaza", nombre: "Mostaza" }
  ]
};

// =====================================================================
//  CONFIGURACIÓN — completá estos datos con los de tu proyecto Supabase
//  (Supabase → Project Settings → API / API Keys)
// =====================================================================
window.CONFIG = {
  // Ejemplo: "https://abcdefghijklmnop.supabase.co"
  SUPABASE_URL: "PEGAR_AQUI_LA_PROJECT_URL",

  // La clave pública: "anon public" o "publishable" (empieza con eyJ... o sb_publishable_...)
  // ¡Nunca pongas acá la "service_role" ni la "secret"!
  SUPABASE_KEY: "PEGAR_AQUI_LA_ANON_KEY",

  // Login con usuario y contraseña (un único usuario creado en Supabase).
  // El usuario "Posada" se guarda en Supabase como el email posada@example.com
  // (Supabase pide un email; example.com es un dominio de ejemplo que no recibe correos).
  REQUIERE_LOGIN: true,
  LOGIN_DOMINIO: "example.com",

  // Las 4 casas. El id no se puede cambiar después de cargar reservas.
  CASAS: [
    { id: "roja",    nombre: "Roja" },
    { id: "azul",    nombre: "Azul" },
    { id: "verde",   nombre: "Verde" },
    { id: "mostaza", nombre: "Mostaza" }
  ]
};

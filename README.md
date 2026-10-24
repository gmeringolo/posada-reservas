# Posada reservas

Calendario web para gestionar las reservas de las casas **Roja, Azul, Verde y Mostaza**.
Se ingresa con un único usuario (**Posada**).
Está pensado para usarse desde el celular, por dos personas a la vez.

- **Front:** HTML + CSS + JavaScript sin frameworks y sin compilar.
- **Base de datos:** [Supabase](https://supabase.com) (PostgreSQL), con el plan gratuito.
- **Hosting:** Netlify, conectado a GitHub.

## Estructura

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Estructura de la página |
| `styles.css` | Diseño (claro y oscuro automático) |
| `app.js` | Calendario, formulario, validaciones y conexión con la base |
| `config.js` | **Tus datos de Supabase** (lo único que tenés que editar) |
| `supabase.sql` | Crea la tabla en Supabase |
| `manifest.webmanifest`, `icon-*` | Permiten instalarla como app en el celular |
| `netlify.toml` | Le dice a Netlify que no hay nada que compilar |

Si abrís `index.html` sin completar `config.js`, la app funciona en **modo prueba**. En ese modo las reservas se pierden al recargar la página.

---

## Paso 1 · Crear la base de datos en Supabase

1. Entrá a <https://supabase.com> y creá una cuenta. Podés usar tu cuenta de GitHub.
2. Tocá **New project** y completá:
   - **Name:** `posada-reservas`.
   - **Database password:** generá una y guardala. La app no la usa, pero te puede servir más adelante.
   - **Region:** *South America (São Paulo)*, que es la más cercana a Uruguay.
3. Esperá 1 o 2 minutos a que el proyecto termine de crearse.
4. En el menú de la izquierda, entrá a **SQL Editor** y tocá **New query**.
5. Abrí el archivo `supabase.sql`, copiá todo su contenido, pegalo en el editor y tocá **Run**. Tiene que aparecer *"Success. No rows returned"*.
6. Para verificar, entrá a **Table Editor**: ahí tiene que aparecer la tabla `reservas`, todavía vacía.

### Crear el usuario de ingreso

Supabase pide un email para cada usuario. Por eso el usuario **Posada** se guarda como `posada@example.com`. La app agrega esa parte sola: en el celular solo se escribe `Posada`. El dominio `example.com` es de ejemplo y no recibe correos.

1. En el menú de la izquierda, entrá a **Authentication** → **Users** → **Add user** → **Create new user**.
2. Completá los datos:
   - **Email:** `posada@example.com`
   - **Password:** `16161616`
   - Marcá **Auto Confirm User**.
3. Tocá **Create user**.
4. Entrá a **Authentication** → **Sign In / Providers** (o **Providers → Email**, según la versión del panel) y desactivá **Allow new users to sign up**. Así nadie más puede crearse una cuenta.

Para cambiar la contraseña más adelante, entrá a **Authentication** → **Users**, abrí el menú **⋯** del usuario y usá la opción para cambiar la contraseña.

> El script crea la tabla y además le pide a la base que **rechace reservas superpuestas** en la misma casa. Así, si las dos guardan al mismo tiempo una reserva para las mismas fechas, la segunda recibe un aviso y no se guarda.

### Copiar las claves

1. Entrá a **Project Settings** (el engranaje) y después a **API** (o **API Keys**, según la versión del panel).
2. Copiá estos dos datos:
   - **Project URL**, que tiene la forma `https://xxxxxxxx.supabase.co`.
   - **anon public key** o **publishable key**, que empieza con `eyJ…` o con `sb_publishable_…`.
3. Pegalos en `config.js`:

```js
SUPABASE_URL: "https://xxxxxxxx.supabase.co",
SUPABASE_KEY: "eyJhbGciOi...",
```

> ⚠️ Nunca uses la clave **service_role** ni la **secret**. Esas claves dan acceso total a la base y no pueden quedar en una web pública.

---

## Paso 2 · Subir el código a GitHub

**Sin usar la terminal:**

1. En <https://github.com/new>, creá un repositorio llamado `posada-reservas`. Te recomiendo que sea **Private**.
2. Tocá **uploading an existing file**, arrastrá todos los archivos de esta carpeta y tocá **Commit changes**.

**Con la terminal:**

```bash
cd posada-reservas
git init
git add .
git commit -m "Primera versión de Posada reservas"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/posada-reservas.git
git push -u origin main
```

---

## Paso 3 · Publicar en Netlify

1. Entrá a <https://app.netlify.com> e iniciá sesión con GitHub.
2. Tocá **Add new site** → **Import an existing project** → **GitHub**, y elegí el repositorio `posada-reservas`.
3. En la configuración del deploy:
   - **Build command:** dejalo vacío.
   - **Publish directory:** `.`. Ya viene definido en `netlify.toml`.
4. Tocá **Deploy**. En menos de un minuto vas a tener un link del tipo `https://algo-random.netlify.app`.
5. Si querés un nombre más fácil de recordar, cambialo en **Site configuration** → **Change site name**. Por ejemplo: `posada-reservas.netlify.app`.

A partir de acá, cada cambio que subas a GitHub se publica automáticamente.

---

## Paso 4 · Usarla en los celulares

1. Abrí el link en el celular e ingresá con el usuario **Posada** y la contraseña **16161616**. Solo hace falta hacerlo una vez por celular.
2. Agregala a la pantalla de inicio:
   - **iPhone (Safari):** botón Compartir → *Agregar a inicio*.
   - **Android (Chrome):** menú ⋮ → *Agregar a pantalla principal* o *Instalar app*.
3. Se va a abrir como una app, con su propio ícono y a pantalla completa.

---

## Login

- La sesión queda guardada en cada celular, así que la app abre directo en el calendario.
- Para cerrar sesión, usá el link **Salir** al pie de la página.
- Quien abra la web sin ingresar no puede ver ni cargar reservas. La base de datos lo bloquea, no solo la pantalla.
- La contraseña no está en el código. Solo vive en Supabase, así que subir el repositorio a GitHub no la expone.

---

## Problemas comunes

| Qué ves | Qué revisar |
|---|---|
| "Modo prueba: falta completar config.js" | `config.js` todavía tiene `PEGAR_AQUI…` |
| "No se pudieron cargar las reservas: …" | La URL o la clave están mal copiadas, o no ejecutaste `supabase.sql` |
| "El usuario o la contraseña no coinciden" | Revisá que el email del usuario en Supabase sea exactamente `posada@example.com` y que esté confirmado |
| "No tenés permiso para guardar" | La sesión venció: tocá **Salir** y volvé a ingresar |
| Los cambios de la otra persona no aparecen solos | Falta la línea `alter publication supabase_realtime add table public.reservas;`. Mientras tanto, recargar la página los muestra |
| El proyecto de Supabase aparece pausado | En el plan gratuito, los proyectos se pausan después de 7 días sin uso. Entrá al panel y tocá **Restore** |

## Ideas para más adelante

- Exportar las reservas a Excel o CSV.
- Agregar un campo de seña o de pago confirmado.
- Agregar notas por reserva, como cantidad de personas o mascotas.
- Mostrar estadísticas anuales por casa.

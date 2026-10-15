# Pulse · Ubicación en vivo

Sitio web adaptable para compartir la ubicación del dispositivo en el que se abre y verla en tiempo real desde otra sesión. El sitio obtiene permiso de GPS del navegador, guarda posiciones en Firebase Realtime Database y muestra el mapa de OpenStreetMap. No requiere instalar una aplicación móvil, configurar un servidor privado ni crear una clave de mapas.

## Cómo usarlo

1. Abre el sitio publicado mediante HTTPS (por ejemplo, GitHub Pages) o durante el desarrollo en `http://localhost:5173`.
2. Inicia sesión con una cuenta de Firebase Authentication.
3. En el dispositivo cuya ubicación quieres compartir, pulsa **Compartir mi ubicación** y permite el acceso a la ubicación cuando el navegador lo solicite.
4. Inicia sesión en el panel desde otra pantalla con el mismo usuario de Firebase para ver la posición. Cada cuenta únicamente puede leer o escribir su propio nodo de ubicación.
5. Pulsa **Detener ubicación** cuando quieras dejar de compartirla.

La geolocalización del navegador solo funciona en un contexto seguro: HTTPS en el sitio publicado o `localhost` durante desarrollo. La página envía a Firebase una actualización cada segundo usando la última lectura GPS disponible. La frecuencia real del sensor depende del teléfono, el navegador, la señal GPS y el ahorro de batería; un navegador web no puede obligar al GPS a proporcionar una nueva coordenada cada segundo. La ubicación se comparte únicamente mientras el navegador mantiene abierta la página.

## Firebase

El proyecto Firebase `ejemplo1-firebase-61ea0` está configurado. La app web usa configuración Firebase pública, que no es una clave privada. No publiques el JSON de Firebase Admin ni contraseñas.

En Firebase Console verifica que:

- **Authentication → Método de acceso → Correo electrónico/contraseña** esté habilitado.
- Exista el usuario que utilizará el panel.
- Estén publicadas las reglas de `database.rules.json`. Permiten a un usuario autenticado actualizar su ubicación cada segundo con coordenadas válidas y consultar solo su propio nodo; deniegan acceso anónimo y campos adicionales.

No se necesita desplegar Firebase Admin ni conservar el servidor API: la página se comunica directamente y de forma autenticada con Firebase Realtime Database. Las reglas validan los permisos de cada operación.

## Desarrollo local

Requiere Node.js 20 o superior. Copia `.env.example` a `.env`, configura los datos de la aplicación web de Firebase y ejecuta:

```sh
npm install
npm run dev
```

Abre la dirección local que indica Vite. `localhost` permite probar la geolocalización en esa misma computadora; para el GPS de un teléfono, usa el sitio HTTPS publicado.

## Publicar en GitHub Pages

1. Sube el proyecto a un repositorio GitHub. `.env` está excluido de Git.
2. En GitHub, abre **Settings → Secrets and variables → Actions → Variables** y crea estas variables de repositorio, copiando sus valores del `.env` local:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_DATABASE_URL`
   - `VITE_FIREBASE_APP_ID`
3. En **Settings → Pages**, selecciona **GitHub Actions** como fuente.
4. Sube el workflow incluido en `.github/workflows/deploy.yml` a la rama `main`. En **Actions**, ejecuta el workflow si el primer despliegue no empieza automáticamente.
5. Abre la URL HTTPS que GitHub Pages publica. En Firebase Authentication → configuración de dominios autorizados, añade el dominio `usuario.github.io` (con el nombre de tu usuario y del repositorio según la URL publicada).

La configuración Firebase Web es pública y puede incluirse en el bundle generado. La seguridad de los datos depende de Authentication y de las reglas de Realtime Database, no de ocultar `apiKey`.

## Permiso y privacidad

El navegador solicita permiso de ubicación y permite denegarlo desde sus ajustes. Al iniciar el seguimiento, la página publica la última lectura GPS cada segundo y conserva su hora de captura para identificar si el sensor dejó de responder. El botón **Detener ubicación** cancela el seguimiento. Para actualizar la ubicación en segundo plano o con el navegador cerrado sería necesaria una app nativa, fuera del alcance de este sitio web.

El proveedor de teselas usado es OpenStreetMap; se muestra su atribución en el mapa. Respeta [la política del servicio público de teselas](https://operations.osmfoundation.org/policies/tiles/): no precargues ni descargues mapas masivamente.

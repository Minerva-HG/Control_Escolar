# Control de Seguimiento Escolar

Plataforma web para que los **padres de familia** consulten el seguimiento diario de sus hijos
(asistencia, tareas, trabajo en clase, conducta y observaciones) y para que el **personal docente**
capture ese registro en pocos segundos.

Sustituye el prototipo de un solo archivo HTML con `localStorage` por una aplicacion con
base de datos PostgreSQL, API autenticada y despliegue en contenedores.

---

## Tabla de contenido

- [Caracteristicas](#caracteristicas)
- [Arquitectura](#arquitectura)
- [Puesta en marcha con Docker](#puesta-en-marcha-con-docker)
- [Puesta en marcha local sin Docker](#puesta-en-marcha-local-sin-docker)
- [Variables de entorno](#variables-de-entorno)
- [Modelo de datos](#modelo-de-datos)
- [API](#api)
- [Pruebas y calidad](#pruebas-y-calidad)
- [Seguridad y privacidad](#seguridad-y-privacidad)
- [Despliegue en produccion](#despliegue-en-produccion)
- [Estructura del proyecto](#estructura-del-proyecto)

---

## Caracteristicas

### Portal de padres (`/padres.html`)

- Acceso con un **codigo unico por alumno**, sin necesidad de crear cuenta ni recordar contrasenas.
- Indicadores de porcentaje: asistencia, tareas entregadas, trabajo en clase y conducta.
- Indicador global de desempeno y grafica de tendencia de los ultimos dias.
- Linea de tiempo por dia con etiquetas de color y las observaciones de la maestra.
- Confirmacion de lectura ("marcar como leido"), individual o de todos los reportes.
- Filtro por rango de fechas, descarga del historial en **CSV** y version imprimible.
- Tablero de avisos publicados por la maestra, con prioridad informativa, importante o urgente.

### Panel docente (`/docente.html`)

- Inicio de sesion con correo y contrasena (hash bcrypt, sesion en cookie `httpOnly`).
- Captura del dia completo en una sola pantalla, con acciones rapidas para todo el grupo.
- Guardado transaccional idempotente: volver a guardar la misma fecha actualiza los registros.
- Indicadores del grupo por periodo y lista de alumnos que requieren atencion.
- Alta y baja de alumnos, regeneracion de codigos de acceso y hoja imprimible de codigos.
- Publicacion y eliminacion de avisos para las familias.
- Visibilidad de que reportes ya fueron leidos por los padres.

---

## Arquitectura

```
Navegador (HTML + CSS + JS de modulos, sin build)
        |
        |  fetch /api/*  (cookie httpOnly, SameSite=Lax)
        v
Express 5  --  helmet, rate limit, zod, compression, morgan
        |
        v
PostgreSQL 16  --  migraciones versionadas en SQL
```

No hay empaquetador ni framework de frontend: el cliente son modulos ES nativos, de modo que la
aplicacion se puede mantener con conocimientos basicos de HTML, CSS y JavaScript.

---

## Puesta en marcha con Docker

Requisitos: Docker Desktop (o Docker Engine) con Compose v2.

```bash
# 1. Configurar el entorno
cp .env.example .env
# Generar un secreto y pegarlo en JWT_SECRET dentro de .env:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 2. Levantar base de datos y aplicacion
docker compose up --build -d

# 3. Cargar el grupo, los alumnos y la cuenta docente inicial
docker compose run --rm seed

# 4. Abrir la aplicacion
#    http://localhost:3000
```

El comando del paso 3 imprime en la consola los **codigos de acceso de cada alumno**; entreguelos
a los padres de familia. Tambien puede consultarlos e imprimirlos desde el panel docente.

Comandos utiles:

```bash
docker compose logs -f app                        # ver registros de la aplicacion
docker compose run --rm seed node src/db/seed.js --demo   # agregar historial de demostracion
docker compose run --rm migrate                   # aplicar migraciones sin arrancar el servidor
docker compose --profile tools up -d adminer      # Adminer en http://localhost:8080
docker compose down                               # detener
docker compose down -v                            # detener y borrar la base de datos
```

> `docker compose down -v` borra el volumen: al volver a sembrar se generan **codigos de
> acceso nuevos** y los que ya entrego a las familias dejan de funcionar.

Los servicios `app`, `seed` y `migrate` comparten la misma imagen (`control-seguimiento:local`),
asi que se construye una sola vez y las tareas puntuales arrancan sin volver a compilar.

### Desarrollo con recarga automatica

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml watch
```

El comando es `watch`, no `up`: Docker vigila el proyecto, copia los cambios de `src/` y `public/`
al contenedor y reinicia el servidor cuando cambia codigo de Node. Un cambio en `package.json`
reconstruye la imagen. La sobrecarga tambien publica el puerto 5432 para conectar un cliente SQL.

No se usa un bind mount con `node --watch` porque **en Windows y macOS los eventos de archivo del
host no llegan al proceso dentro del contenedor**: el archivo se actualiza, pero `node --watch`
nunca lo detecta y el servidor no reinicia. Con Compose Watch la vigilancia ocurre del lado de
Docker, asi que funciona igual en los tres sistemas.

Si prefiere trabajar con Node instalado en el equipo, deje solo la base de datos en Docker:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
npm install
npm run dev        # con POSTGRES_HOST=localhost en el .env
```

---

## Puesta en marcha local sin Docker

Requisitos: Node.js 20 o superior y una instancia de PostgreSQL 14+.

```bash
npm install
cp .env.example .env      # ajuste POSTGRES_* y JWT_SECRET
npm run migrate           # crea las tablas
npm run seed              # crea grupo, alumnos y cuenta docente
npm run dev               # http://localhost:3000
```

Agregue `-- --demo` al seed (`npm run seed -- --demo`) para generar registros de ejemplo de los
ultimos dias habiles y poder ver el portal de padres con datos.

Credenciales docente iniciales (definidas en `.env`):

| Campo     | Valor por omision      |
| --------- | ---------------------- |
| Correo    | `maestra@escuela.mx`   |
| Contrasena| `Escuela2026!`         |

> Cambie la contrasena antes de usar la aplicacion con datos reales.

---

## Variables de entorno

| Variable                | Obligatoria | Por omision            | Descripcion                                            |
| ----------------------- | ----------- | ---------------------- | ------------------------------------------------------ |
| `NODE_ENV`              | no          | `development`          | En `production` exige `JWT_SECRET` de 32+ caracteres.  |
| `PORT`                  | no          | `3000`                 | Puerto HTTP.                                           |
| `POSTGRES_HOST`         | si          | `localhost`            | Con Docker Compose debe ser `db`.                      |
| `POSTGRES_PORT`         | no          | `5432`                 | Puerto de PostgreSQL.                                  |
| `POSTGRES_DB`           | si          | `control_seguimiento`  | Nombre de la base de datos.                            |
| `POSTGRES_USER`         | si          | `seguimiento`          | Usuario de la base de datos.                           |
| `POSTGRES_PASSWORD`     | si          | —                      | Contrasena de la base de datos.                        |
| `JWT_SECRET`            | si          | —                      | Firma de las sesiones. Unico y aleatorio.              |
| `SESSION_HOURS`         | no          | `12`                   | Duracion de la sesion en horas.                        |
| `RUN_MIGRATIONS`        | no          | `true`                 | `false` evita migrar al arrancar el servidor.          |
| `SEED_TEACHER_*`        | no          | ver `.env.example`     | Datos de la cuenta docente creada por el seed.         |
| `SCHOOL_NAME`           | no          | `Escuela Ramon Corona` | Nombre mostrado en la interfaz.                        |
| `SCHOOL_CYCLE`          | no          | `2026 - 2027`          | Ciclo escolar mostrado en la interfaz.                 |

---

## Modelo de datos

| Tabla            | Proposito                                                                        |
| ---------------- | -------------------------------------------------------------------------------- |
| `teachers`       | Personal docente con hash de contrasena y rol (`teacher` o `admin`).             |
| `groups`         | Grupo y ciclo escolar, con su docente titular.                                   |
| `students`       | Alumnos, numero de lista, codigo de acceso unico y datos del tutor.              |
| `daily_records`  | Un registro por alumno y fecha, con `UNIQUE (student_id, record_date)`.           |
| `announcements`  | Avisos del grupo con prioridad.                                                  |
| `access_logs`    | Bitacora de intentos de acceso del portal de padres, para auditoria.             |
| `schema_migrations` | Control de migraciones aplicadas.                                             |

Las migraciones viven en `src/db/migrations/` como archivos `.sql` numerados y se aplican una
sola vez, dentro de una transaccion. Para cambiar el esquema, agregue un archivo nuevo
(`002_...sql`); nunca edite uno ya aplicado.

### Ordenamiento en espanol

La imagen `postgres:16-alpine` usa musl, que **no implementa los locales del sistema**: acepta
un `LANG=es_MX.utf8` pero ordena por bytes, con lo que `Angel` con acento cae despues de
`Zulema`. Por eso el volumen se inicializa con el proveedor **ICU** (`--icu-locale=es-MX`), que
si ordena, compara y pasa a mayusculas segun el espanol.

Esto solo aplica al crear el volumen. Hoy la aplicacion lista a los alumnos por numero de lista,
no por nombre, asi que una base ya existente sigue funcionando igual; si mas adelante necesita
ordenar por nombre en una base creada antes de este cambio, recreela (`docker compose down -v`)
o use `ORDER BY full_name COLLATE "es-x-icu"` en la consulta.

---

## API

Todas las respuestas son JSON. Las sesiones viajan en cookies `httpOnly`.

### Publicas

| Metodo | Ruta               | Descripcion                                        |
| ------ | ------------------ | -------------------------------------------------- |
| GET    | `/api/health`      | Estado del servicio y de la base de datos.         |
| GET    | `/api/meta`        | Datos de la escuela y catalogos de valores.        |

### Padres de familia

| Metodo | Ruta                              | Descripcion                                  |
| ------ | --------------------------------- | -------------------------------------------- |
| POST   | `/api/parent/session`             | Abre sesion con el codigo de acceso.         |
| POST   | `/api/parent/logout`              | Cierra la sesion.                            |
| GET    | `/api/parent/summary`             | Indicadores, tendencia y avisos.             |
| GET    | `/api/parent/records`             | Historial con filtros `from`, `to`, `limit`. |
| POST   | `/api/parent/records/:id/seen`    | Marca un reporte como leido.                 |
| POST   | `/api/parent/records/seen-all`    | Marca todos los reportes como leidos.        |
| GET    | `/api/parent/export.csv`          | Descarga el historial en CSV.                |

### Docentes

| Metodo | Ruta                               | Descripcion                                   |
| ------ | ---------------------------------- | --------------------------------------------- |
| POST   | `/api/auth/login`                  | Inicio de sesion (10 intentos / 10 minutos).  |
| POST   | `/api/auth/logout`                 | Cierre de sesion.                             |
| GET    | `/api/auth/me`                     | Sesion vigente.                               |
| GET    | `/api/groups`                      | Grupos con conteo de alumnos.                 |
| POST   | `/api/groups`                      | Crea un grupo.                                |
| GET    | `/api/students`                    | Alumnos por grupo.                            |
| POST   | `/api/students`                    | Alta de alumno con codigo generado.           |
| PATCH  | `/api/students/:id`                | Actualiza datos del alumno.                   |
| POST   | `/api/students/:id/access-code`    | Regenera el codigo de acceso.                 |
| DELETE | `/api/students/:id`                | Baja logica del alumno.                       |
| GET    | `/api/records/day`                 | Pase de lista de una fecha.                   |
| POST   | `/api/records/bulk`                | Guarda o actualiza el dia completo.           |
| GET    | `/api/records/stats`               | Indicadores del grupo por periodo.            |
| GET    | `/api/records/history`             | Historial de un alumno.                       |
| GET    | `/api/announcements`               | Avisos del grupo.                             |
| POST   | `/api/announcements`               | Publica un aviso.                             |
| DELETE | `/api/announcements/:id`           | Elimina un aviso.                             |

Ejemplo:

```bash
curl -X POST http://localhost:3000/api/parent/session \
  -H 'Content-Type: application/json' \
  -d '{"accessCode":"ABC234"}' -c cookies.txt

curl http://localhost:3000/api/parent/summary -b cookies.txt
```

---

## Pruebas y calidad

```bash
npm run lint     # ESLint
npm test         # pruebas unitarias (node:test), sin base de datos
npm run smoke    # levanta la app y verifica rutas, guardas de sesion y cabeceras
```

`npm run smoke` no necesita PostgreSQL: comprueba que las tres paginas se sirven, que
`/api/meta` responde, que las rutas privadas devuelven 401 sin sesion, que la validacion
rechaza datos invalidos con 400 y que las cabeceras de seguridad estan presentes.

El flujo de GitHub Actions (`.github/workflows/ci.yml`) ejecuta tres trabajos en cada push y
pull request a `main`:

1. **quality** — lint, pruebas unitarias y comprobacion de humo.
2. **integration** — migraciones, seed y verificacion de endpoints contra un PostgreSQL real.
3. **docker** — construye la imagen con cache de capas, valida las dos definiciones de Compose y
   levanta la pila completa: comprueba que el contenedor no corre como root, que la API responde
   detras del puerto publicado, que la base quedo con el proveedor ICU y que el servidor atiende
   el SIGTERM y sale con codigo 0.

---

## Seguridad y privacidad

Se maneja informacion de menores de edad. Medidas incluidas:

- Contrasenas docentes con **bcrypt** (12 rondas); nunca se almacenan en claro.
- Sesiones en **JWT dentro de cookies `httpOnly`**, `SameSite=Lax` y `Secure` en produccion.
- Un padre solo puede leer los datos del alumno de su codigo: el identificador se toma de la
  sesion, no de parametros de la peticion.
- **Rate limiting** en el inicio de sesion docente y en el acceso por codigo.
- Codigos de acceso de 6 caracteres sin caracteres ambiguos, generados con `crypto.randomInt`,
  revocables en cualquier momento desde el panel.
- Bitacora `access_logs` de intentos correctos y fallidos.
- Validacion de toda la entrada con **zod**; consultas siempre parametrizadas.
- Cabeceras de seguridad y **CSP** estricta con helmet.
- El contenedor corre como usuario sin privilegios (`node`), con el sistema de archivos raiz de
  **solo lectura** (`/tmp` en memoria), **todas las capacidades de Linux retiradas** y
  `no-new-privileges`, de modo que una ejecucion remota de codigo no puede escribir en la imagen
  ni escalar privilegios.

Pendientes recomendados antes de un uso masivo: HTTPS mediante proxy inverso, respaldos
automaticos de PostgreSQL y aviso de privacidad firmado por los tutores.

---

## Despliegue en produccion

1. Coloque un proxy inverso con TLS (Caddy, Nginx o Traefik) frente al servicio `app`.
2. Defina `NODE_ENV=production` y un `JWT_SECRET` largo y unico.
3. Cambie `SEED_TEACHER_PASSWORD` y la contrasena de PostgreSQL.
4. No publique el puerto 5432 hacia internet: use `docker-compose.yml` a solas, sin la
   sobrecarga de desarrollo, que es la que abre ese puerto.
5. Si prefiere controlar el momento del cambio de esquema, arranque con `RUN_MIGRATIONS=false`
   y aplique las migraciones como paso explicito del despliegue:

```bash
docker compose run --rm migrate
docker compose up -d --no-deps app
```

6. Programe respaldos:

```bash
docker compose exec db pg_dump -U seguimiento control_seguimiento > respaldo-$(date +%F).sql
```

Los registros de todos los servicios rotan a 10 MB con 3 archivos de historia, para que un
contenedor de larga vida no llene el disco del servidor.

---

## Estructura del proyecto

```
.
├── .github/
│   ├── workflows/ci.yml          Integracion continua
│   ├── dependabot.yml            Actualizacion de dependencias
│   └── pull_request_template.md
├── docs/legacy/Actividades.html  Prototipo original (solo referencia)
├── public/                       Cliente estatico
│   ├── index.html                Portada y seleccion de portal
│   ├── padres.html               Portal de padres de familia
│   ├── docente.html              Panel docente
│   ├── css/styles.css
│   └── js/{core,padres,docente}.js
├── src/
│   ├── app.js                    Configuracion de Express
│   ├── server.js                 Arranque y cierre ordenado
│   ├── config/env.js             Variables de entorno validadas
│   ├── db/{pool,migrate,seed}.js
│   ├── db/migrations/*.sql
│   ├── lib/                      Catalogos, codigos, tokens, errores
│   ├── middleware/               Autenticacion, validacion, errores
│   └── routes/                   auth, groups, students, records, announcements, parent
├── test/                         Pruebas unitarias
├── Dockerfile
├── docker-compose.yml
└── docker-compose.dev.yml
```

---

## Licencia

MIT. Vea [LICENSE](LICENSE).

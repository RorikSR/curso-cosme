# Despliegue · Ivania Facial Lab

Guía de despliegue del **backend Node seguro** en un contenedor Docker,
gestionado como *stack* en **Portainer** y publicado en un **subdominio de
Cloudflare** mediante **Cloudflare Tunnel** (sin IP pública ni puerto abierto).

## 1. Modelo de acceso (una sola cerradura, segura)

A diferencia de un login solo-cliente, aquí el acceso es **real**:

- El servidor (`server/server.js`, Express) valida las credenciales con **bcrypt**.
- Tras un login válido emite una **cookie de sesión httpOnly firmada** (cookie-session).
- El **contenido** (`App/data/**` y `App/assets/**`: lecciones, quizzes, casos,
  imágenes) **no se entrega sin sesión válida** → responde `401`.
- El shell público (`index.html`, `app.js`, `styles.css`) se sirve sin sesión,
  pero **no contiene secretos ni contenido del curso**; solo permite mostrar el login.

Usuarios por defecto (cámbialos, ver §5):

| Usuario | Contraseña | Rol | Perfil (avance) |
|---------|-----------|-----|-----------------|
| `ivi`   | `ohliliana` | estudiante | propio |
| `xime`  | `ohliliana` | estudiante | propio |
| `admin` | `admin123`  | administrador | propio |

El rol `admin` ve el panel de Administración; los estudiantes no.

## 2. Variables de entorno

| Variable | Obligatoria | Descripción |
|----------|-------------|-------------|
| `SESSION_SECRET` | **Sí (producción)** | Secreto para firmar la cookie de sesión. Usa una cadena larga y aleatoria. Si falta, el servidor arranca con un valor inseguro y lo advierte por consola. |
| `COOKIE_SECURE` | Recomendada | `"true"` cuando se sirve por HTTPS (Cloudflare). Default `true` en el compose. Para pruebas locales por HTTP, ponla en `false`. |
| `HOST_PORT` | No | Puerto publicado en el host (default `8080`). El contenedor escucha en `3000`. |
| `HASH_IVI` / `HASH_XIME` / `HASH_ADMIN` | No | Hashes bcrypt para sobrescribir las credenciales sin reconstruir la imagen. |

Genera un `SESSION_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## 3. Construir y probar localmente

```bash
# Desde la raíz del repositorio
docker build -t ivania-facial-lab:latest .
docker run --rm -p 8080:3000 -e SESSION_SECRET=algo-larguisimo -e COOKIE_SECURE=false ivania-facial-lab:latest
# Abre http://localhost:8080 → pantalla de login de la app.
```

Comprobaciones rápidas:
```bash
# Sin sesión, el contenido está bloqueado:
curl -i http://localhost:8080/data/Quizzes.csv          # -> 401

# Login y acceso con la cookie:
curl -i -c cookies.txt -X POST http://localhost:8080/api/login \
  -H "content-type: application/json" \
  -d '{"username":"admin","password":"admin123"}'        # -> 200 + Set-Cookie
curl -i -b cookies.txt http://localhost:8080/data/Quizzes.csv   # -> 200
```

Sin Docker, también puedes correr el backend directo: `npm start` (sirve en
`http://localhost:3000`).

## 4. Desplegar el stack en Portainer

1. **Stacks → Add stack**, nombre `ivania-facial-lab`.
2. Método **Repository** (apunta a tu repo y al `docker-compose.yml` de la raíz)
   o **Web editor** (pega el `docker-compose.yml`).
3. En **Environment variables** define al menos `SESSION_SECRET` y `COOKIE_SECURE=true`.
4. **Deploy the stack**. El servicio `app` escucha en `3000` y se publica en
   `HOST_PORT` (default `8080`).

## 5. Cambiar las credenciales

Las contraseñas se guardan como **hash bcrypt** en `server/server.js` (o por
variables de entorno `HASH_*`). Para cambiar una:

```bash
node -e "console.log(require('bcryptjs').hashSync('NUEVA_CLAVE', 12))"
```

Pega el hash resultante en la variable de entorno correspondiente
(`HASH_IVI`, `HASH_XIME`, `HASH_ADMIN`) del stack, o en el array `USERS` de
`server/server.js`. No hace falta tocar el frontend: la app ya no contiene
contraseñas. Tras cambiarlas, redepliega el stack.

## 6. Enrutar el subdominio con Cloudflare Tunnel

`cloudflared` abre una conexión **saliente** hacia Cloudflare; no se abren
puertos entrantes ni hace falta IP pública.

### 6.1 Instalar y autenticar
```bash
cloudflared tunnel login
cloudflared tunnel create ivania-facial-lab
```

### 6.2 Configurar el enrutamiento (`~/.cloudflared/config.yml`)
```yaml
tunnel: <UUID-del-tunnel>
credentials-file: /root/.cloudflared/<UUID-del-tunnel>.json

ingress:
  - hostname: curso.midominio.com
    service: http://app:3000          # si cloudflared está en la MISMA red Docker que el stack
    # service: http://localhost:8080  # si cloudflared corre en el host y publicas 8080:3000
  - service: http_status:404
```

### 6.3 Registrar el DNS y ejecutar
```bash
cloudflared tunnel route dns ivania-facial-lab curso.midominio.com
cloudflared tunnel run ivania-facial-lab     # o instálalo como servicio
```

> Con Cloudflare delante (HTTPS en el borde) deja `COOKIE_SECURE=true`. El
> backend ya hace `trust proxy`, así que la cookie segura funciona a través del
> tunnel.

### 6.4 Verificación
1. Abre `https://curso.midominio.com` → aparece la **pantalla de login de la app**.
2. Inicia sesión con `ivi` / `xime` / `admin`.
3. Sin iniciar sesión, `https://curso.midominio.com/data/Quizzes.csv` responde `401`.

## 7. Checklist previo a producción

- [ ] `SESSION_SECRET` definido con un valor largo y aleatorio.
- [ ] `COOKIE_SECURE=true` (sirviendo por HTTPS vía Cloudflare).
- [ ] Credenciales cambiadas (hashes bcrypt propios) y comunicadas por canal seguro.
- [ ] Stack desplegado y contenedor *running* en Portainer.
- [ ] Tunnel creado, `config.yml` con el `service` correcto y `route dns` ejecutado.
- [ ] Verificado: el subdominio pide login y el contenido da 401 sin sesión.

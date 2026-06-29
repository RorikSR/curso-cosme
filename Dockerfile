# ============================================================================
# Dockerfile - Ivania Facial Lab (backend Node seguro)
# ----------------------------------------------------------------------------
# Imagen basada en node:alpine que ejecuta el servidor Express (server/server.js).
# El servidor valida credenciales con bcrypt, emite cookie de sesión httpOnly y
# NO entrega el contenido (App/data, App/assets) sin sesión válida.
# ============================================================================

FROM node:20-alpine

WORKDIR /app

# 1) Instalar solo dependencias de producción (express, cookie-session, bcryptjs).
#    Se copian primero los manifiestos para aprovechar la caché de capas.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 2) Copiar el backend y la SPA.
COPY server/ ./server/
COPY App/ ./App/

# El servidor escucha en el puerto 3000 dentro del contenedor.
EXPOSE 3000

ENV NODE_ENV=production

# Arranque del backend (server/server.js usa server/package.json -> CommonJS).
CMD ["node", "server/server.js"]

FROM node:24.11.1-alpine

# Certificados SSL (requerido pelo Datadog e clientes HTTPS, incluindo GCS)
RUN apk add --no-cache ca-certificates

WORKDIR /usr/src/app

# Instalar dependências em layer separado (cache de Docker)
COPY package*.json ./
RUN npm ci

# Copiar código e compilar
COPY . ./
RUN npm run build

# Worker usa a mesma imagem; CMD é sobrescrito em service-worker.yaml
CMD ["npm", "run", "start"]

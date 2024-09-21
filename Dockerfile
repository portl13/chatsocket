# Usa una imagen oficial de Node.js como base
FROM node:16

# Establecer directorio de trabajo
WORKDIR /usr/src/app

# Copia el archivo package.json y yarn.lock
COPY package.json yarn.lock ./

# Instala las dependencias de la aplicación
RUN yarn install

# Copia el resto del código de la aplicación (raíz)
COPY . .

# Expone el puerto en el que la aplicación correrá
EXPOSE 3000

# Comando para iniciar la aplicación
CMD ["yarn", "start"]
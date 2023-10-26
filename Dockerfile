ARG NODE_IMAGE=node:18-slim

FROM $NODE_IMAGE AS base
RUN mkdir -p /home/node/app && chown node:node /home/node/app
WORKDIR /home/node/app
USER node
RUN mkdir tmp

USER root
# Install Python, make, and g++ as root
RUN apt-get update && apt-get install -y python3 make g++
# Install dumb-init
RUN apt-get update && apt-get install -y dumb-init

# Install other dependencies
RUN apt-get install -y libcairo2-dev libjpeg-dev libgif-dev pkg-config libpixman-1-dev libpangomm-1.4-dev

# Install Vim
RUN apt-get install -y vim

# Set the LD_LIBRARY_PATH to include the musl linker
ENV LD_LIBRARY_PATH=/lib:/usr/lib:/usr/local/lib

# Switch back to the non-root user
USER node

FROM base AS dependencies
COPY --chown=node:node ./package*.json ./
RUN npm ci
COPY --chown=node:node . .

FROM dependencies AS build
RUN node ace build --production

FROM base AS production
ENV NODE_ENV=production
ENV PORT=$PORT
ENV HOST=0.0.0.0
COPY --chown=node:node ./package*.json ./
RUN npm ci --production
COPY --chown=node:node --from=build /home/node/app/build .
EXPOSE $PORT
CMD [ "dumb-init", "node", "server.js" ]

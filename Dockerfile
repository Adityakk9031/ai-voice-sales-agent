FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# We also need some dev dependencies to build (typescript)
# Better to do a multi-stage build, but keeping it simple for the prototype
RUN npm install typescript -g

# Copy prisma schema
COPY prisma ./prisma/
RUN npx prisma generate

# Copy source
COPY src ./src
COPY tsconfig.json ./

# Build
RUN tsc

# Start
EXPOSE 3000
CMD ["node", "dist/server.js"]

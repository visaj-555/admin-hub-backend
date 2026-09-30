FROM node:24-alpine

WORKDIR /usr/src/app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ git

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy application source
COPY . .

# Generate Prisma client
RUN npm run prisma:generate

EXPOSE 3001

# Run in development mode with watch
CMD ["npm", "run", "start:dev"]
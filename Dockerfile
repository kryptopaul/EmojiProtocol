# Use the latest Node.js image
FROM node:latest

# Set the working directory
WORKDIR /app

# Copy package.json and yarn.lock
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install

# Copy the rest of the application code
COPY . .

# Build the application
RUN yarn prisma generate
RUN yarn build

# Start the application
CMD ["yarn", "start"]

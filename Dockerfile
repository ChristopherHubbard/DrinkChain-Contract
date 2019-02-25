# Moneyd requires NodeJS 8.9.0 and above
FROM node:8.11.3

# The working/home directory of our application inside the container
WORKDIR /

# Add the contents of our current directory into the /app folder of our container
COPY package.json .
COPY tsconfig.json .
COPY /distlib /distlib

# Install dependencies from package.json using npm
RUN npm install --only=production

# Make port 8080 available to the outside world
EXPOSE 8080

# Run the command 'npm start' which will start our server.js file
CMD [ "node", "./distlib/src/index.js"]
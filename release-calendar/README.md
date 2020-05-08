AMP Release Calendar
===================

:construction: under construction :construction: 

This project is split into two parts: a React client, and an Express and TypeORM server.

To start: `cd release-calendar && npm install`

To build and run the app for production: `npm run start`
* This serves the client and backend on `ENV.SERVER_URL:ENV.SERVER_PORT`

To build and serve the client for development: `npm run client`
* Make sure to set `ENV.NODE_ENV` to anything but `production`
* This uses webpack dev server for hot reloading
* This uses React's development build from your local node_modules folder

To build the client for production: `npn run client-build-prod`
* Make sure to set `ENV.NODE_ENV` to `production`
* This uses React's production build

To build the server: `npm run server-build`
To serve the server: `npm run server-serve`
To build and serve the server: `npm run server`

To run tests: `npm run test`
To lint: `npm run lint`

#### Local development
1. Install MySQL for a local database.
2. Add a `.env` file to the root directory. See `.env.example` for the required variables and replace values with your own.
3. Run `npm run server` to connect to the database and start the API server.
4. In a different terminal, run `npm run client` to start the client.

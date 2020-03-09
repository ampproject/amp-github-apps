AMP Release Calendar
===================

:construction: under construction :construction: 

This project is split into two parts: a React client, and an Express and TypeORM server.

To start: `cd release-calendar && npm install`

To build the client: `npm run client-build`
To serve the client: `npm run client-serve`
To build and serve the client: `npm run client`

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

/**
 * Copyright 2019 The AMP HTML Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const express = require('express');

const GITHUB_REPO = process.env.GITHUB_REPO || 'ampproject/amphtml';

class Server {
  /**
   * Constructor.
   *
   * @param {?express.App} app optional Express app to use.
   * @param {Logger=} [logger=console] logging interface.
   * @param {function} initRoutes function adding routes.
   */
  constructor(app, logger) {
    this.app = app || express();
    this.logger = logger || console;
    this.initRoutes();
  }

  /**
   * Initialize route handlers.
   */
  initRoutes() {}

  /**
   * Add a route to the server.
   *
   * @param {string} method HTTP method to accept.
   * @param {string} path route URI.
   * @param {function} handler function given a request returning a response.
   */
  route(method, uri, handler) {
    method = method.toLowerCase()
    if (method !== 'get' && method !== 'post') {
      throw new Error(`Method "${method}" not allowed as route`)
    }

    this.app[method](uri, (req, res) => {
      try {
        res.send(handler(req));
      } catch (error) {
        res.statusCode = 500;
        res.send(`Encountered an error: ${error.message}`);
      }
    });
  }

  /**
   * Convenience method for GET routes.
   *
   * @param {string} path route URI.
   * @param {function} handler function given a request returning a response.
   */
  get(uri, handler) {
    this.route('get', uri, handler);
  }

  /**
   * Start the server listening on a port.
   */
  listen(port) {
    return new Promise((resolve, reject) => {
      this.app.listen(port, () => {
        this.logger.info(`Starting server on port ${port}`);
        resolve();
      });
    });
  }
}

class InfoServer extends Server {
  /**
   * Constructor.
   *
   * @param {!OwnersBot} ownersBot owners bot instance.
   * @param {?express.App} app optional Express app to use.
   * @param {Logger=} [logger=console] logging interface.
   */
  constructor(ownersBot, app, logger) {
    super(app, logger);
    this.ownersBot = ownersBot;
  }

  /**
   * Initialize route handlers.
   */
  initRoutes() {
    this.get('/status', req => [
      `The OWNERS bot is live and running on ${GITHUB_REPO}!`,
      '<a href="/tree">Owners Tree</a>',
      '<a href="/teams">Organization Teams</a>',
    ].join('<br>'));

    this.get('/tree', req => {
      const {result, errors} = this.ownersBot.treeParse;
      const treeHeader = '<h3>OWNERS tree</h3>';
      const treeDisplay = `<pre>${result.toString()}</pre>`;

      let output = `${treeHeader}${treeDisplay}`;
      if (errors.length) {
        const errorHeader = '<h3>Parser Errors</h3>';
        const errorDisplay = errors.join('<br>');
        output += `${errorHeader}<code>${errorDisplay}</code>`;
      }

      return output;
    });

    this.get('/teams', req => {
      const teamSections = [];
      Object.entries(this.ownersBot.teams).forEach(([name, team]) => {
        teamSections.push(
          [
            `Team "${name}" (ID: ${team.id}):`,
            ...team.members.map(username => `- ${username}`),
          ].join('<br>')
        );
      });

      return ['<h2>Teams</h2>', ...teamSections].join('<br><br>');
    });
  }
}

if (require.main === module) {
  require('dotenv').config();

  const {LocalRepository} = require('./src/repo');
  const {OwnersBot} = require('./src/owners_bot');

  const repo = new LocalRepository(process.env.GITHUB_REPO_DIR);
  const ownersBot = new OwnersBot(repo);
  const infoServer = new InfoServer(ownersBot);
  infoServer.listen(process.env.INFO_SERVER_PORT);

  const teamsInitialized = Promise.resolve();//ownersBot.initTeams(sharedGithub);
  const appInitialized = teamsInitialized.then(() =>
    ownersBot.refreshTree()
  ).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = InfoServer;

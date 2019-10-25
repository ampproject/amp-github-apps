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

/**
 * Generic server wrapping express routing.
 */
class Server {
  /**
   * Constructor.
   *
   * @param {?express.App} app optional Express app to use.
   * @param {Logger} logger logging interface.
   * @param {function} initRoutes function adding routes.
   */
  constructor(app, logger = console) {
    this.router = new express.Router();
    this.app = app || express();
    this.logger = logger;

    this.initRoutes();
    this.app.use(this.router);
  }

  /**
   * Initialize route handlers.
   */
  initRoutes() {}

  /**
   * Add a route to the server.
   *
   * @param {string} method HTTP method to accept.
   * @param {string} uri route URI.
   * @param {function} handler function given a request returning a response.
   */
  route(method, uri, handler) {
    method = method.toLowerCase();
    if (method !== 'get' && method !== 'post') {
      throw new Error(`Method "${method}" not allowed as route`);
    }

    this.router[method](uri, async (req, res, next) => {
      handler(req)
        .then(res.send.bind(res))
        .catch(next);
    });
  }

  /**
   * Convenience method for GET routes.
   *
   * @param {string} uri route URI.
   * @param {function} handler function given a request returning a response.
   */
  get(uri, handler) {
    this.route('get', uri, handler);
  }

  /**
   * Start the server listening on a port.
   *
   * @param {number} port port to listen on.
   * @return {!Promise} a promise that resolves once the server is started.
   */
  listen(port) {
    return new Promise((resolve, reject) => {
      this.app.listen(port, () => {
        this.logger.info(`Info server listening on port ${port}`);
        resolve();
      });
    });
  }
}

/**
 * Server providing status information and cron handlers..
 */
class InfoServer extends Server {
  /**
   * Constructor.
   *
   * @param {!OwnersBot} ownersBot owners bot instance.
   * @param {!GitHub} github GitHub API interface.
   * @param {?express.App} app optional Express app to use.
   * @param {Logger} logger logging interface.
   */
  constructor(ownersBot, github, app, logger = console) {
    super(app, logger);
    this.github = github;
    this.ownersBot = ownersBot;
  }

  /**
   * Adds a cron task request handler with error handling.
   *
   * @param {string} taskName cron task name.
   * @param {function} handler async request handler function.
   */
  cron(taskName, handler) {
    this.get(`/_cron/${taskName}`, async req => {
      // This header is set by App Engine when running cron tasks, and is
      // stripped out of external requests.
      if (!req.header('X-Appengine-Cron')) {
        throw new Error('Attempted external request to a cron endpoint');
      }

      await handler(req);
      return 'Cron task completed successfully.';
    });
  }

  /**
   * Initialize route handlers.
   */
  initRoutes() {
    this.get('/status', async req =>
      [
        `The OWNERS bot is live and running on ${process.env.GITHUB_REPO}!`,
        '<a href="/tree">Owners Tree</a>',
        '<a href="/teams">Organization Teams</a>',
      ].join('<br>')
    );

    this.get('/tree', async req => {
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

    this.get('/teams', async req => {
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

    this.cron('refreshTree', async req => {
      await this.ownersBot.refreshTree(this.logger);
    });

    this.cron('refreshTeams', async req => {
      await this.ownersBot.initTeams(this.github);
    });
  }
}

if (require.main === module) {
  const {ownersBot, github} = require('./bootstrap')(console);
  new InfoServer(ownersBot, github).listen(process.env.INFO_SERVER_PORT);
}

module.exports = InfoServer;

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

const JSON5 = require('json5');
const fs = require('fs');
const express = require('express');
const _ = require('lodash');
const hl = require('highlight').Highlight;
const {OwnersCheck} = require('./src/ownership/owners_check');

const EXAMPLE_OWNERS_PATH = './OWNERS.example';
const SYNTAX_CHECK_MAX_SIZE = 5000;

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
    this.app.use(express.json());
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
   * Convenience method for POST routes.
   *
   * @param {string} uri route URI.
   * @param {function} handler function given a request returning a response.
   */
  post(uri, handler) {
    this.route('post', uri, handler);
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

  /**
   * Render a `lodash` template.
   *
   * @param {string} view name of view template.
   * @param {?object} ctx template context.
   * @return {strintg} template rendered with context variables.
   */
  render(view, ctx = {}) {
    const template = fs.readFileSync(`./templates/${view}.template.html`);
    return _.template(template)(ctx);
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
      if (!req.header('X-Appengine-Cron') && process.env.NODE_ENV !== 'dev') {
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
    const ownersFile = fs.readFileSync(EXAMPLE_OWNERS_PATH).toString('utf8');

    this.get('/', async req =>
      this.render('status', {
        repository: `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPOSITORY}`,
      })
    );

    this.get('/tree', async req => {
      const {result, errors} = this.ownersBot.treeParse;
      return this.render('tree', {ownersTree: result, errors});
    });

    this.get('/teams', async req => {
      return this.render('teams', {teams: Object.values(this.ownersBot.teams)});
    });

    this.get('/example', async req => {
      return this.render('example', {ownersFile: hl(ownersFile)});
    });

    this.post('/v0/syntax', async req => {
      const {path, contents} = req.body;

      try {
        if (path === undefined) {
          throw new RangeError('Missing key "path" in POST body');
        }

        if (contents === undefined) {
          throw new RangeError('Missing key "contents" in POST body');
        }

        if (contents.length > SYNTAX_CHECK_MAX_SIZE) {
          throw new RangeError(
            `Owners file too large (${contents.length} bytes); ` +
              `must be less than ${SYNTAX_CHECK_MAX_SIZE} bytes`
          );
        }
      } catch (error) {
        return {requestErrors: [error.toString()]};
      }

      try {
        const fileParse = this.ownersBot.parser.parseOwnersFileDefinition(
          path,
          JSON5.parse(contents)
        );

        return {
          fileErrors: fileParse.errors.map(error => error.toString()),
          rules: fileParse.result.map(rule => rule.toString()),
        };
      } catch (error) {
        return {fileErrors: [error.toString()]};
      }
    });

    this.cron('refreshTree', async req => {
      await this.ownersBot.refreshTree(this.logger);
    });

    this.cron('refreshTeams', async req => {
      await this.ownersBot.initTeams(this.github);
    });

    this.get('/check/:prNumber', async req => {
      const pr = await this.github.getPullRequest(req.params.prNumber);
      const {changedFiles, reviewers} = await this.ownersBot.initPr(
        this.github,
        pr
      );
      const {checkRun} = new OwnersCheck(
        this.ownersBot.treeParse.result,
        changedFiles,
        reviewers
      ).run();

      return checkRun.json;
    });
  }
}

if (require.main === module) {
  const {ownersBot, github} = require('./bootstrap')(console);
  new InfoServer(ownersBot, github).listen(process.env.PORT);
}

module.exports = InfoServer;

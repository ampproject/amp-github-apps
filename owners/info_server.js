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
const bodyParser = require('body-parser');

const GITHUB_REPO = process.env.GITHUB_REPO || 'ampproject/amphtml';
const CACHED_TREE_REFRESH_MS = 10 * 60 * 1000;

/**
 * Info server entrypoint.
 *
 * @param {number} port port to run the server on.
 * @param {!OwnersParser} parser owners file parser.
 * @param {!Logger} logger logging interface.
 */
module.exports = (port, parser, logger) => {
  let treeParse = {result: {}, errors: []};

  /** Updates the cached copy of the parsed ownership tree. */
  function updateTree() {
    app.log('Updating cached owners tree');
    parser.parseOwnersTree().then(parse => {
      treeParse = parse;
    });
  }
  updateTree();
  setInterval(updateTree, CACHED_TREE_REFRESH_MS);

  const app = express();
  app.use(bodyParser.json());

  app.get('/status', (req, res) => {
    res.send(
      [
        `The OWNERS bot is live and running on ${GITHUB_REPO}!`,
        '<a href="/tree">Owners Tree</a>',
        '<a href="/teams">Organization Teams</a>',
      ].join('<br>')
    );
  });

  app.get('/tree', (req, res) => {
    const treeHeader = '<h3>OWNERS tree</h3>';
    const treeDisplay = `<pre>${treeParse.result.toString()}</pre>`;

    let output = `${treeHeader}${treeDisplay}`;
    if (treeParse.errors.length) {
      const errorHeader = '<h3>Parser Errors</h3>';
      const errorDisplay = treeParse.errors
        .map(error => error.toString())
        .join('<br>');
      output += `${errorHeader}<code>${errorDisplay}</code>`;
    }

    res.send(output);
  });

  app.get('/teams', (req, res) => {
    const teamSections = [];
    Object.entries(parser.teamMap).forEach(([name, team]) => {
      teamSections.push(
        [
          `Team "${name}" (ID: ${team.id}):`,
          ...team.members.map(username => `- ${username}`),
        ].join('<br>')
      );
    });

    res.send(['<h2>Teams</h2>', ...teamSections].join('<br><br>'));
  });

  app.listen(port, () => {
    logger.info(`Starting info server on port ${port}`);
  });
};

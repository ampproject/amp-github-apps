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

/**
 * Info server entrypoint.
 *
 * @param {!OwnersBot} ownersBot owners bot instance.
 * @parma {!express.App} express app.
 */
module.exports = (ownersBot) => {
  const app = express();

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
    const {result, errors} = ownersBot.treeParse;
    const treeHeader = '<h3>OWNERS tree</h3>';
    const treeDisplay = `<pre>${result.toString()}</pre>`;

    let output = `${treeHeader}${treeDisplay}`;
    if (errors.length) {
      const errorHeader = '<h3>Parser Errors</h3>';
      const errorDisplay = errors.join('<br>');
      output += `${errorHeader}<code>${errorDisplay}</code>`;
    }

    res.send(output);
  });

  app.get('/teams', (req, res) => {
    const teamSections = [];
    Object.entries(ownersBot.teams).forEach(([name, team]) => {
      teamSections.push(
        [
          `Team "${name}" (ID: ${team.id}):`,
          ...team.members.map(username => `- ${username}`),
        ].join('<br>')
      );
    });

    res.send(['<h2>Teams</h2>', ...teamSections].join('<br><br>'));
  });

  return app;
};

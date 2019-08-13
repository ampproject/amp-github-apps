/**
 * Copyright 2019, the AMP HTML authors
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

const connectSessionKnex = require('connect-session-knex');
const passport = require('passport');
const session = require('express-session');
const {Strategy: GitHubStrategy} = require('passport-github2');

const KnexSessionStore = connectSessionKnex(session);

exports.installRootAuthentications = (root, db) => {
  passport.serializeUser((user, done) => {
    done(null, user.username);
  });

  passport.deserializeUser((username, done) => {
    done(null, username);
  });

  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: new URL('/login/callback', process.env.WEB_UI_BASE_URL)
          .href,
      },
      (accessToken, refreshToken, profile, done) => {
        return done(null, profile);
      }
    )
  );

  root.use(
    session({
      secret: process.env.GITHUB_CLIENT_SECRET,
      store: new KnexSessionStore({
        knex: db,
      }),
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
        secure: process.env.NODE_ENV === 'production',
      },
    })
  );
  root.use(passport.initialize());
  root.use(passport.session());

  root.get('/login', passport.authenticate('github'), () => {});

  root.get(
    '/login/callback',
    passport.authenticate('github'),
    async (request, response) => {
      const {redirectTo} = request.session;
      if (redirectTo !== undefined) {
        response.redirect(redirectTo);
      } else {
        response.end(
          'GitHub login successful, however the redirect URL was not ' +
            'stored in the user session. You can close this tab and reopen ' +
            'the original URL that you were trying to access.'
        );
      }
    }
  );

  root.get('/logout', async (request, response) => {
    request.logout();
    response.redirect('/');
  });
};

exports.installRouteAuthentications = route => {
  route.use((request, response, next) => {
    if (request.isAuthenticated()) {
      delete request.session.redirectTo;
      return next();
    }
    request.session.redirectTo = request.originalUrl;
    response.redirect('/login');
  });
};

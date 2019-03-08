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

const session = require('express-session');

exports.installRootAuthentications = root => {
  root.use(session({
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
    },
  }));
};

exports.installRouteAuthentications = route => {
  route.use((request, response, next) => {
    if (request.headers.authorization) {
      const user = Buffer.from(
          request.headers.authorization.substring(6), 'base64')
          .toString()
          .slice(0, -1);
      request.session.passport = {user};
      return next();
    }
    request.session.redirectTo = request.originalUrl;
    response.redirect('/login');
  });
};

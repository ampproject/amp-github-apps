/**
 * Copyright 2020 The AMP HTML Authors. All Rights Reserved.
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

const path = require('path');
const HtmlWebPackPlugin = require('html-webpack-plugin');
const Dotenv = require('dotenv-webpack');

module.exports = {
  mode: 'production',
  target: 'web',
  devtool: 'source-map',
  devServer: {
    port: 9000,
  },
  entry: './src/client/index.tsx',
  resolve: {
    extensions: ['.wasm', '.mjs', '.js', '.jsx', '.ts', '.tsx', '.json'],
  },
  output: {
    filename: 'bundle-client.js',
    path: path.resolve(__dirname, 'dist'),
  },
  module: {
    rules: [
      {
        test: /\.ts(x?)$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
          },
        ],
      },
      {
        enforce: 'pre',
        test: /\.js$/,
        loader: 'source-map-loader',
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.s[ac]ss$/i,
        use: [
          'style-loader',
          'css-loader',
          {
            loader: 'sass-loader',
            options: {
              implementation: require('sass'),
              sassOptions: {
                fiber: false,
              },
            },
          },
        ],
      },
    ],
  },
  plugins: [
    new Dotenv({
      path: '.env', // TODO - switch for prod and dev
    }),
    new HtmlWebPackPlugin({
      template: './src/client/index.ejs',
      templateParameters: {
        'scripts':
          '<script src="https://unpkg.com/react@16/umd/react.production.min.js"></script>' +
          '<script src="https://unpkg.com/react-dom@16/umd/react-dom.production.min.js"></script>',
      },
      filename: './index.html',
    }),
  ],
  externals: {
    'react': 'React',
    'react-dom': 'ReactDOM',
    'express': 'express',
    'mysql': 'mysql',
    'typeorm': 'typeorm',
  },
};

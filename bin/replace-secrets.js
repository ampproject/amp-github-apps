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

/**
 * @fileoverview Replaces redacted secret environment variables in an app
 * directory's `redacted.env` and outputs `.env` with the decrypted values of
 * the secrets.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const OUTPUT_ENV_FILE = '.env';
const REDACTED_ENV_FILE = 'redacted.env';
const CLOUD_BUILD_FILE = 'cloud_build.yaml';

/**
 * Reads the Cloud Build config file to identify secrets in the environment.
 *
 * @param {string} appDir path to app directory.
 * @return {Array<string>} list of environment variable names.
 */
function identifySecrets(appDir) {
  const yamlFile = path.join(appDir, CLOUD_BUILD_FILE);
  try {
    const yamlContents = fs.readFileSync(yamlFile).toString('utf8');
    const config = YAML.parse(yamlContents);
    const secrets = Object.keys(config.secrets[0].secretEnv);
    console.log(`Identified the following secret env keys: ${secrets}`);
    return secrets;
  } catch (e) {
    // Handle the case where parsing secrets from the cloud build file fails.
    console.warn('No secret keys were found in cloud_build.yaml.');
  }

  return [];
}

/**
 * Reads the redacted env file and creates a `.env` file including secrets.
 *
 * @param {string} appDir path to app directory.
 */
function replaceSecrets(appDir) {
  const envFile = path.join(appDir, REDACTED_ENV_FILE);
  const envFileContents = fs.readFileSync(envFile).toString('utf8');
  const secretsList = identifySecrets(appDir);

  const replacedContents = envFileContents
    .split('\n')
    .map(line => {
      for (const secret of secretsList) {
        if (line.startsWith(`${secret}=`)) {
          const secretVal = process.env[secret];
          const hash = crypto.createHash('sha256');
          hash.update(secretVal);
          const partialHash = hash.digest('hex').substr(0, 6);
          console.log(
            `Replacing value of ${secret}; ` +
              `new value has SHA256 ${partialHash}...`
          );
          return `${secret}=${secretVal}`;
        }
      }

      return line;
    })
    .join('\n');

  fs.writeFileSync(path.join(appDir, OUTPUT_ENV_FILE), replacedContents);
}

/**
 * Inject secrets into an app's environment.
 *
 * @param {string} appName
 */
function main(appName) {
  if (!appName) {
    throw new Error('Must specify app argument to replace-secrets');
  }
  const appDir = path.resolve(appName);

  if (!fs.existsSync(appDir)) {
    throw new Error(`Invalid app "${appName}"; directory does not exist`);
  }

  replaceSecrets(appDir);
}

main(process.argv[2]);

/**
 * Copyright 2019 Google Inc.
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

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const OUTPUT_ENV_FILE = '.env';
const REDACTED_ENV_FILE = 'redacted.env';
const CLOUD_BUILD_FILE = 'cloud_build.yaml';

function identifySecrets(appDir) {
  const yamlFile = path.join(appDir, CLOUD_BUILD_FILE);
  const yamlContents = fs.readFileSync(yamlFile).toString('utf8');
  const config = YAML.parse(yamlContents);
  const secrets = Object.keys(config.secrets[0].secretEnv)
  
  console.log(`Identified the following secret env keys: ${secrets}`)
  return secrets;
}

function replaceSecrets(appDir) {
  const envFile = path.join(appDir, REDACTED_ENV_FILE);
  const envFileContents = fs.readFileSync(envFile).toString('utf8');

  const replacedContents = envFileContents.split('\n').map(line => {
    for (const secret of identifySecrets(appDir)) {
      if (line.startsWith(`${secret}=`)) {
        const secretVal = process.env[secret]
        console.log(
          `Replacing value of ${secret} with "${secretVal.substr(0, 3)}..."`
        );
        return `${secret}=${secretVal}`;
      }
    }

    return line;
  }).join('\n');

  fs.writeFileSync(path.join(appDir, OUTPUT_ENV_FILE), replacedContents);
}

if (require.main === module) {
  const appDir = process.argv[2];
  replaceSecrets(path.resolve(appDir));
}

module.exports = replaceSecrets;

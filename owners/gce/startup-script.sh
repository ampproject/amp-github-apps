#! /bin/bash
#   Copyright 2015-2016, Google, Inc.
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# This is the current contents of the GCE instance Metadata `startup-script`,
# which is automatically executed when the `gcloud compute instances reset`
# command is run.
# TODO(#500): Move as much of this as possible to checked-in scripts and split
#   startup code from re-deployment code.

# [START startup]
set -v

# [START env]
APP_ID=22611  # Probot
NODE_ENV="production"  # App
LOG_LEVEL="trace"  # Probot + App
REPO="ampproject/amphtml"  # Startup + App
#REPO="erwinmombay/github-owners-bot-test-repo"
APP_DIR="/opt/app"  # Startup
REPO_DIR="/opt/amphtml"  # Startup + App
#REPO_DIR="/opt/github-owners-bot-test-repo"
GITHUB_BOT_USERNAME="amp-owners-bot"  # App
WEBHOOK_SECRET="[REDACTED]"  # Probot
CLOUD_BUCKET="[REDACTED]"  # Unused
GITHUB_ACCESS_TOKEN="[REDACTED]"  # App
OAUTH2_CLIENT_ID="[REDACTED]"  # Unknown
OAUTH2_CLIENT_SECRET="[REDACTED]"  # Unknown
ADD_REVIEWERS_OPT_OUT=1  # App
# [END env]

# Talk to the metadata server to get the project id
PROJECTID=$(curl -s "http://metadata.google.internal/computeMetadata/v1/project/project-id" -H "Metadata-Flavor: Google")  # Startup (logging)
echo "Project ID ${PROJECTID}"
supervisorctl stop nodeapp

# Install logging monitor. The monitor will automatically pick up logs sent to
# syslog.
# [START logging]
curl -s "https://storage.googleapis.com/signals-agents/logging/google-fluentd-install.sh" | bash
service google-fluentd restart &
# [END logging]

# Install dependencies from apt
apt-get update
apt-get install -yq ca-certificates git nodejs build-essential supervisor

# Install nodejs
mkdir /opt/nodejs
curl https://nodejs.org/dist/v10.15.0/node-v10.15.0-linux-x64.tar.gz | tar xvzf - -C /opt/nodejs --strip-components=1
ln -s /opt/nodejs/bin/node /usr/bin/node
ln -s /opt/nodejs/bin/npm /usr/bin/npm

# Get the application source code from the Google Cloud Repository.
# git requires $HOME and it's not set during the startup script.
export HOME=/root
git config --global credential.helper gcloud.sh
rm -rf "${APP_DIR}"
git clone https://source.developers.google.com/p/$PROJECTID/r/amp-owners-bot "${APP_DIR}"
mkdir -p ${APP_DIR}/.env

cat > ${APP_DIR}/.env/amp-owners-bot.2019-01-22.private-key.pem << EOF
-----BEGIN RSA PRIVATE KEY-----
[REDACTED]
-----END RSA PRIVATE KEY-----
EOF

PRIVATE_KEY_PATH="${APP_DIR}/.env/amp-owners-bot.2019-01-22.private-key.pem"

# Install app dependencies
cd "${APP_DIR}"
APP_COMMIT_SHA=$(git log --max-count=1 --pretty='format:%h')
APP_COMMIT_MSG=$(git log --max-count=1 --pretty='format:%s')
npm install

# get a clean copy of the target repository to be evaluated
rm -rf "${REPO_DIR}"
git clone "https://github.com/${REPO}.git" "${REPO_DIR}"

# Create a nodeapp user. The application will run as this user.
useradd -m -d /home/nodeapp nodeapp
chown -R nodeapp:nodeapp "${APP_DIR}"
chown -R nodeapp:nodeapp "${REPO_DIR}"

# Configure supervisor to run the node app.
cat >/etc/supervisor/conf.d/node-app.conf << EOF
[program:nodeapp]
directory=${APP_DIR}
command=npm run start
autostart=true
autorestart=true
user=nodeapp
environment=HOME="/home/nodeapp",USER="nodeapp",NODE_ENV="${NODE_ENV}",LOG_LEVEL="${LOG_LEVEL}",GCLOUD_PROJECT="${PROJECTID}",CLOUD_BUCKET="${CLOUD_BUCKET}",DATA_BACKEND="datastore",OAUTH2_CLIENT_ID="${OAUTH2_CLIENT_ID}",OAUTH2_CLIENT_SECRET="${OAUTH2_CLIENT_SECRET}",GITHUB_ACCESS_TOKEN="${GITHUB_ACCESS_TOKEN}",GITHUB_REPO_DIR="${REPO_DIR}",WEBHOOK_SECRET="${WEBHOOK_SECRET}",GITHUB_BOT_USERNAME="${GITHUB_BOT_USERNAME}",PORT="8080",APP_ID="${APP_ID}",PRIVATE_KEY_PATH="${PRIVATE_KEY_PATH}",GITHUB_REPO="${REPO}",APP_COMMIT_SHA="${APP_COMMIT_SHA}",APP_COMMIT_MSG="${APP_COMMIT_MSG}",ADD_REVIEWERS_OPT_OUT=${ADD_REVIEWERS_OPT_OUT},INFO_SERVER_PORT="8081"
nodaemon=true
stdout_logfile=syslog
stdout_logfile_maxbytes=0
stderr_logfile=syslog
stderr_logfile_maxbytes=0
EOF

supervisorctl reread
supervisorctl update

# Application should now be running under supervisor
# [END startup]

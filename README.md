# GitHub Apps for the AMP Project

[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

Contact: [@ampproject/wg-infra](https://github.com/orgs/ampproject/teams/wg-infra)

This repository contains the source code of GitHub Apps designed
specifically for the AMP Project.

## Apps

### [Bundle-Size Bot](bundle-size/README.md)

This GitHub App performs checks on the size of the compiled AMP bundle, and blocks pull requests from being merged without specific approval from the team that maintains the bundle size.

The app runs on an instance of Google AppEngine and is installed exclusively on the [`ampproject/amphtml`](https://github.com/ampproject/amphtml) repository.

### [Bundle-Size Chart App](bundle-size-chart/README.md)

This ExpressJS App generates and displays a chart of the bundle sizes history of compiled AMP files.

The app runs on an instance of Google AppEngine and is deployed at https://amp-bundle-size-chart.appspot.com/.

### [Owners Bot](owners/README.md)

A web service that suggests approvers for a GitHub pull request based on OWNERS files and enforces reviews by OWNERS as a GitHub status check.

The app runs on an instance of [Google AppEngine](https://ampproject-owners-bot.appspot.com) and is installed exclusively on the [`ampproject/amphtml`](https://github.com/ampproject/amphtml) repository. It can be trivially deployed to other organizations and repositories.

### [PR Deploy Bot](pr-deploy/README.md)

A GitHub App which deploys a PR branch to a static website when you ask it to.

Websites are served by a Google Cloud Storage bucket.

The app runs on an instance of [Google AppEngine](https://amp-pr-deploy-bot.appspot.com) and is installed exclusively on the [`ampproject/amphtml`](https://github.com/ampproject/amphtml) repository.

### [Project Metrics](project-metrics/README.md)

This GitHub App reports metrics for the repository and scores each metric on a common scale.

The app runs on an instance of [Google AppEngine](https://amp-project-metrics.appspot.com) and is installed exclusively on the [`ampproject/amphtml`](https://github.com/ampproject/amphtml) repository. It can be trivially deployed to other organizations and repositories.

### [Release Calendar][release-calendar/README.md]

A ReactJS, Express and MySQL web app that displays AMPHTML release activity on a calendar.

The app runs on an instance of [Google AppEngine](https://amp-release-calendar.appspot.com).


### [Test Status Bot](test-status/README.md)

This GitHub App reports the status of different test types on the AMPHTML repository, and allows the build cop to skip flaky tests.

The app runs on an instance of Google AppEngine and is installed exclusively on the [`ampproject/amphtml`](https://github.com/ampproject/amphtml) repository.

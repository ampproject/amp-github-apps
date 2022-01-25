# Percy Mirror Verifier

Verifies that the Percy build for all commits on the `main` branch mirror the Percy build for the pull requests that were merged into those commits.

## Local development

### Percy webhook setup

1. Start a new [Smee channel](https://smee.io/). This can be used to proxy
   Percy webhooks to your local machine
2. In your Percy project "Integrations" page, add a new Web Hook with the
   following settings:
   - _URL_: the one from your Smee channel
   - _Secret_: any machine-readable value
   - _Subscribed events_: check the `ping` and `build_finished` boxes
   - _SSL certificate verification_: leave this on

### Local setup

1. Clone this repository and cd into the `percy-mirror-verifier` directory
2. `npm install`
3. Copy the `redacted.env` file to `.env` and modify the fields based on the
   instructions in that file
4. `npm run dev`

If there are no errors after running the last command then the app is running
locally on your machine.

## Deployment

This GitHub App is deployed on an AppEngine instance:
https://amp-percy-mirror-verifier.appspot.com/

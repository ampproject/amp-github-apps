AMP Invite Bot
==============

A GitHub App that invites GitHub users to the `ampproject` organization based
on GitHub comment macros (ie. `/invite` and `/tryassign`).

This app runs as a Google Cloud Functions deployment and is currently installed
on the [ampproject orginazition](https://github.com/ampproject). It can be
configured for deployment to other organizations.

Interface
---------

The AMP Invite Bot watches for all new comments and checks each one for trigger
commands. The known trigger commands are as follows:

- `/invite @user`: Sends an organization invite to `@user`; when the invite is accepted, the bot adds a comment to the original thread indicating as much
- `/tryassign @user`: Performs the same actions as above; when the invite is
accepted, the bot will also attempt to assign the user to the PR or issue
thread the invite was triggered on

Webhooks
--------

The app subscribes to the following GitHub Webhooks:

* [`IssueCommentEvent`](https://developer.github.com/v3/activity/events/types/#issuecommentevent)
  * `created`: check the comment for any known trigger macros
  > Note: This app does not attempt to catch comments which are edited to add an invite macro; this allows simpler stateless processing without potentially re-issuing invitations if comments are edited
* [`MemberEvent`](https://developer.github.com/v3/activity/events/types/#memberevent)
  * `added`: comment on the original invite comment, and possibly assign a corresponding issue, to a member who accepts her invitation

Setup
-----

1. Clone this repository and `cd` into the `invite` directory.
2. `npm install`

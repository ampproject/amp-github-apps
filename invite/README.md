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

> Note: This app does not attempt to catch comments which are edited to add an invite macro; this allows simpler stateless processing without potentially re-issuing invitations if comments are edited

* [`IssueCommentEvent`](https://developer.github.com/v3/activity/events/types/#issuecommentevent)
  * `created`: check the comment for trigger macros
* [`IssueEvent`](https://developer.github.com/v3/activity/events/types/#issueevent)
  * `opened`: check the issue body for trigger macros
* [`PullRequestEvent`](https://developer.github.com/v3/activity/events/types/#pullrequestevent)
  * `created`: check the PR description for trigger macros
* [`PullRequestReviewEvent`](https://developer.github.com/v3/activity/events/types/#pullrequestreviewevent)
  * `submitted`: check the review body for trigger macros
* [`PullRequestReviewCommentEvent`](https://developer.github.com/v3/activity/events/types/#pullrequestreviewcommentevent)
  * `created`: check the review comment for trigger macros
* [`OrganizationEvent`](https://developer.github.com/v3/activity/events/types/#organizationevent)
  * `member_added`: comment on the original invite comment, and possibly assign a corresponding issue, to a member who accepts her invitation

Setup
-----

1. Clone this repository and `cd` into the `invite` directory.
2. `npm install`

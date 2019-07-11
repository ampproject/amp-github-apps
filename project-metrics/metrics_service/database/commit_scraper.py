import datetime
from typing import Sequence
import logging
import time
import sqlalchemy

from apis import github
from database import db
from database import models

SCRAPE_INTERVAL_SECONDS = 5


def timestamp_90_days_ago() -> datetime.datetime:
  return datetime.datetime.now() - datetime.timedelta(days=90)


class CommitScraper(object):

  def __init__(self):
    self.github = github.GitHubGraphQL()
    self.session = db.Session()
    self.cursor = None

  def _get_latest_commit_timestamp(self) -> datetime.datetime:
    commit = self.session.query(models.Commit).order_by(
        models.Commit.committed_at.desc()).first()
    return commit.committed_at if commit else timestamp_90_days_ago()

  def scrape_page(self, since: str,
                  after: str = None) -> Sequence[models.Commit]:
    """Fetch a page of commits from the repository.

    Updates the cursor with the `after` field from the paging info.

    Args:
      since: timestamp to start scraping at.
      after: end cursor returned by GraaphQL paging info

    Returns:
      The list of returned commits.
    """
    history_args = 'since: "%s"' % github.Timestamp(since).git_timestamp
    if after:
      history_args += ', after: "%s"' % after
    logging.info('Querying GitHub for commits with args: %s', history_args)

    response = self.github.query_master_branch("""target {{ ... on Commit {{
      history(first: {page_size}, {history_args}) {{
        pageInfo {{ endCursor }}
        nodes {{
          oid
          committedDate
          associatedPullRequests(first: 1) {{
            nodes {{ 
              number
            }}
          }}
        }}
      }}
    }} }}""".format(page_size=github.MAX_PAGE_SIZE, history_args=history_args))
    commit_history = response['target']['history']

    self.cursor = commit_history['pageInfo']['endCursor']
    if self.cursor is None:
      raise IndexError('No further commits available from GitHub')

    for commit in commit_history['nodes']:
      try:
        pull_request = commit['associatedPullRequests']['nodes'][0]
        pull_request_status = 'UNKNOWN'
        # TODO(rcebulko): Scrape CheckSuite runs and set the status
        yield models.Commit(
            hash=commit['oid'],
            committed_at=github.Timestamp(commit['committedDate']).datetime,
            pull_request=pull_request['number'],
            pull_request_status=models.PullRequestStatus.UNKNOWN)
      except IndexError:
        logging.warn('No pull request found for commit %s', commit['oid'][:7])

  def scrape_since_latest(self):
    """Scrapes latest commits from GitHub and saves them to the DB.

    When the database is empty, it will scrape all commits from the last 90
    days. Otherwise, it will scrape commits since the latest commit currently in
    the DB.
    """
    latest_timestamp = self._get_latest_commit_timestamp()
    page_count = 1

    try:
      while True:
        logging.info('Fetching page %d of commits from GitHub', page_count)

        commits = self.scrape_page(since=latest_timestamp, after=self.cursor)
        commit_dicts = [{
            'hash': commit.hash,
            'committed_at': commit.committed_at,
            'pull_request': commit.pull_request,
            'pull_request_status': commit.pull_request_status,
        } for commit in commits]
        logging.info('Scraped %d commits', len(commit_dicts))

        db.get_engine().execute(
            models.Commit.__table__.insert().prefix_with('IGNORE'),
            commit_dicts)

        page_count += 1
        time.sleep(SCRAPE_INTERVAL_SECONDS)
    except IndexError:
      logging.info('Completed scraping %d pages of commits', page_count)

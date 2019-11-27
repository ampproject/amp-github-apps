from typing import Sequence
import datetime
import logging
import re
import time
import sqlalchemy

from apis import github
from database import db
from database import models

SCRAPE_INTERVAL_SECONDS = 3
CHERRYPICK_ISSUE_TITLE_PREFIX = r'🌸 Cherry[ -]?pick request'


def timestamp_90_days_ago() -> datetime.datetime:
  return datetime.datetime.now() - datetime.timedelta(days=90)


class CherrypickIssueScraper(object):

  def __init__(self):
    self.github = github.GitHubGraphQL()
    self.session = db.Session()
    self.cursor = None

  def __del__(self):
    self.session.close()

  def _get_latest_cherrypick_issue_timestamp(self) -> datetime.datetime:
    issue = models.CherrypickIssue.scope(self.session).first()
    return issue.created_at if issue else timestamp_90_days_ago()

  def scrape_page(self,
                  since: datetime.datetime,
                  after: str = None) -> Sequence[models.Commit]:
    """Fetch a page of cherrypick issues from the repository.

    Updates the cursor with the `after` field from the paging info.

    Args:
      since: timestamp to start scraping at.
      after: end cursor returned by GraaphQL paging info

    Returns:
      The list of returned commits.
    """
    paging_args = 'first: %d, filterBy: { since: "%s" }' % (
        github.MAX_PAGE_SIZE, github.Timestamp(since).git_timestamp)
    if after:
      paging_args += ', after: "%s"' % after
    logging.info('Querying GitHub for issues with args: %s', paging_args)

    response = self.github.query_repo("""
      issues(
        orderBy: {{
          direction: DESC,
          field: CREATED_AT
        }},
        states: CLOSED,
        labels: ["Type: Release"],
        {paging_args}) {{
        pageInfo {{ endCursor }}
        nodes {{
          number
          title
          createdAt
        }}
      }}""".format(paging_args=paging_args))
    issues = response['issues']['nodes']
    self.cursor = response['issues']['pageInfo']['endCursor']

    if self.cursor is None:
      raise IndexError('No further issues available from GitHub')

    for issue in issues:
      print(issue['title'])
      if re.match(CHERRYPICK_ISSUE_TITLE_PREFIX, issue['title']):
        yield models.CherrypickIssue(
            number=issue['number'],
            created_at=github.Timestamp(issue['createdAt']).datetime)

  def scrape_historical(self, since: datetime.datetime):
    """Scrapes cherry-pick issues since a given date.

    Args:
      since: datetime to scrape backwards in commit history until
    """
    self.cursor = None
    page_count = 1

    try:
      while True:
        logging.info('Fetching page %d of issues from GitHub', page_count)

        cp_issues = self.scrape_page(since=since, after=self.cursor)
        cp_issue_dicts = list({
            'number': issue.number,
            'created_at': issue.created_at,
        } for issue in cp_issues)
        logging.info('Scraped %d cherry-pick issues', len(cp_issue_dicts))

        db.get_engine().execute(
            models.CherrypickIssue.__table__.insert().prefix_with('IGNORE'),
            cp_issue_dicts)

        page_count += 1
        time.sleep(SCRAPE_INTERVAL_SECONDS)
    except IndexError:
      logging.info('Completed scraping %d pages of cherry-pick issues',
                   page_count)

  def scrape_since_latest(self):
    """Scrapes latest cherry-pick issues from GitHub and saves them to the DB.

    When the database is empty, it will scrape all commits from the last 90
    days. Otherwise, it will scrape commits since the latest commit currently in
    the DB.
    """
    self.scrape_historical(self._get_latest_cherrypick_issue_timestamp())

  @classmethod
  def scrape(cls):
    cls().scrape_since_latest()

import datetime
from typing import Iterable
import logging
import re
import time
import sqlalchemy

from apis import github
from database import db
from database import models

SCRAPE_INTERVAL_SECONDS = 5
CHERRYPICK_ISSUE_TITLE_REGEX = (
    r'^🌸?\s*Cherry[ -]?pick(?: request)?(?: for)? #?(\d+).*$')


def timestamp_90_days_ago() -> datetime.datetime:
  return datetime.datetime.now() - datetime.timedelta(days=90)


class CherrypickScraper(object):

  def __init__(self):
    self.github = github.GitHubGraphQL()
    self.session = db.Session()
    self.cursor = None

  def _get_latest_cherrypick_timestamp(self) -> datetime.datetime:
    cherrypick = self.session.query(models.Cherrypick).order_by(
        models.Cherrypick.published_at.desc()).first()
    return cherrypick.published_at if cherrypick else timestamp_90_days_ago()

  def scrape_page(self, after: str = None) -> Iterable[models.Cherrypick]:
    """Fetch a page of cherry-pick issues from the repository.

    Updates the cursor with the `after` field from the paging info.

    Args:
      after: end cursor returned by GraaphQL paging info

    Returns:
      The list of returned cherrypicks.
    """
    issues_args = ('orderBy: {field: CREATED_AT, direction: DESC}, first: %d' %
                   github.MAX_PAGE_SIZE)
    if after:
      issues_args += ', after: "%s"' % after
    logging.info('Querying GitHub for cherry-pick issues with args: %s',
                 issues_args)

    response = self.github.query_repo("""
      issues({issues_args}) {{
        pageInfo {{ endCursor }}
        nodes {{
          number
          publishedAt
          title
        }}
      }}""".format(issues_args=issues_args))
    issues = response['issues']

    self.cursor = issues['pageInfo']['endCursor']
    if self.cursor is None:
      raise IndexError('No further issues available from GitHub')

    for issue in issues['nodes']:
      matches = re.match(CHERRYPICK_ISSUE_TITLE_REGEX, issue['title'])
      print(issue['number'], issue['title'], matches)
      yield models.Cherrypick(
          issue_number=issue['number'],
          published_at=github.Timestamp(issue['publishedAt']).datetime,
          pull_request_number=matches.group(1) if matches else None)

  def scrape_since_latest(self):
    """Scrapes latest cherrypicks from GitHub and saves them to the DB.

    When the database is empty, it will scrape all cherrypicks from the last 90
    days. Otherwise, it will scrape cherrypicks since the latest cherrypick
    currently
    in
    the DB.
    """
    latest_timestamp = self._get_latest_cherrypick_timestamp()
    page_num = 0
    last_date = datetime.datetime.now()

    while True:
      logging.info('Fetching page %d of cherry-picks from GitHub', page_num)

      issues = list(self.scrape_page(after=self.cursor))
      logging.info('Scraped %d issues', len(issues))

      for issue in issues:
        if issue.pull_request_number:
          try:
            self.session.add(issue)
            self.session.flush()
          except sqlalchemy.exc.IntegrityError as e:
            logging.error(e)
            # Drop cherry-picks already in the DB or those for commits not in the DB
            self.session.rollback()
          else:
            self.session.commit()
            logging.debug('Saved %r', issue)

        if issue.published_at:
          last_date = issue.published_at

      if last_date < latest_timestamp:
        break

      page_num += 1
      time.sleep(SCRAPE_INTERVAL_SECONDS)

    logging.info('Completed scraping %d page(s) of cherry-picks', page_num + 1)

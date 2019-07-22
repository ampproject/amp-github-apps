import datetime
from typing import Sequence
import logging
import re
import time
import sqlalchemy

from apis import github
from database import db
from database import models

SCRAPE_INTERVAL_SECONDS = 5
RELEASE_NAME_REGEX = r'^\d{13}$'


def timestamp_90_days_ago() -> datetime.datetime:
  return datetime.datetime.now() - datetime.timedelta(days=90)


class ReleaseScraper(object):

  def __init__(self):
    self.github = github.GitHubGraphQL()
    self.session = db.Session()
    self.cursor = None

  def __del__(self):
    self.session.close()

  def _get_latest_release_timestamp(self) -> datetime.datetime:
    release = self.session.query(models.Release).order_by(
        models.Release.published_at.desc()).first()
    return release.published_at if release else timestamp_90_days_ago()

  def _get_oldest_release_timestamp(self) -> datetime.datetime:
    release = self.session.query(models.Release).order_by(
        models.Release.published_at.asc()).first()
    return release.published_at if release else datetime.datetime.now()

  def scrape_page(self, after: str = None) -> Sequence[models.Release]:
    """Fetch a page of releases from the repository.

    Updates the cursor with the `after` field from the paging info.

    Args:
      after: end cursor returned by GraaphQL paging info

    Returns:
      The list of returned releases.
    """
    releases_args = 'first: %d' % github.MAX_PAGE_SIZE
    if after:
      releases_args += ', after: "%s"' % after
    logging.info('Querying GitHub for releases with args: %s', releases_args)

    response = self.github.query_repo("""
      releases({releases_args},
               orderBy: {{field: CREATED_AT, direction: DESC}}) {{
        pageInfo {{ endCursor }}
        nodes {{
          name
          publishedAt
          isDraft
          isPrerelease
        }}
      }}""".format(releases_args=releases_args))
    releases = response['releases']

    self.cursor = releases['pageInfo']['endCursor']
    if self.cursor is None:
      raise IndexError('No further releases available from GitHub')

    return [
        models.Release(
            published_at=github.Timestamp(release['publishedAt']).datetime,
            name=release['name'])
        for release in releases['nodes']
        if (not release['isDraft'] and not release['isPrerelease'] and
            re.match(RELEASE_NAME_REGEX, release['name']))
    ]

  def scrape_since_latest(self):
    """Scrapes latest releases from GitHub and saves them to the DB.

    When the database is empty, it will scrape all releases from the last 90
    days. Otherwise, it will scrape releases since the latest release currently
    in
    the DB.
    """
    self.cursor = None
    latest_timestamp = self._get_latest_release_timestamp()
    page_num = 0
    last_date = datetime.datetime.now()

    while True:
      logging.info('Fetching page %d of releases from GitHub', page_num)

      releases = self.scrape_page(after=self.cursor)
      logging.info('Scraped %d releases', len(releases))

      for release in releases:
        try:
          self.session.add(release)
          self.session.flush()
        except sqlalchemy.exc.IntegrityError as e:
          logging.error(e)
          # Drop releases already in the DB or those for commits not in the DB
          self.session.rollback()
        else:
          self.session.commit()
          logging.debug('Saved %r', release)

        if release.published_at:
          last_date = release.published_at

      if last_date < latest_timestamp:
        break

      page_num += 1
      time.sleep(SCRAPE_INTERVAL_SECONDS)

    logging.info('Completed scraping %d page(s) of releases', page_num + 1)

  def scrape_historical(self, since: datetime.datetime):
    """Scrapes historical releases going back as far as specified.

    Args:
      since: datetime to scrape backwards in release history until.
    """
    self.cursor = None
    earliest_date = self._get_oldest_release_timestamp()
    page_num = 0

    while True:
      logging.info('Fetching page %d of historical releases from GitHub',
                   page_num)

      releases = self.scrape_page(after=self.cursor)
      logging.info('Scraped %d releases', len(releases))

      for release in releases:
        try:
          self.session.add(release)
          self.session.flush()
        except sqlalchemy.exc.IntegrityError as e:
          logging.error(e)
          # Drop releases already in the DB or those for commits not in the DB
          self.session.rollback()
        else:
          self.session.commit()
          logging.debug('Saved %r', release)

        if release.published_at:
          earliest_date = min(earliest_date, release.published_at)

      if earliest_date < since:
        break

      page_num += 1
      time.sleep(SCRAPE_INTERVAL_SECONDS)

    logging.info('Completed scraping %d page(s) of historical releases',
                 page_num + 1)

  @classmethod
  def scrape(cls):
    cls().scrape_since_latest()

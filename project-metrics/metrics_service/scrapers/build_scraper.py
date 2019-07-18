import datetime
from typing import Sequence
import logging
import time
from typing import Optional
import sqlalchemy

from apis import travis
from database import db
from database import models

SCRAPE_INTERVAL_SECONDS = 2


def timestamp_90_days_ago() -> datetime.datetime:
  return datetime.datetime.now() - datetime.timedelta(days=90)


class BuildScraper(object):

  def __init__(self):
    self.travis = travis.TravisApi()
    self.session = db.Session()
    self.cursor = None

  def _get_latest_build_number(self) -> Optional[int]:
    build = self.session.query(models.Build).order_by(
        models.Build.number.desc()).first()
    return build.number if build else None

  def scrape_since_latest(self):
    """Scrapes latest builds from Travis and saves them to the DB.

    When the database is empty, it will scrape all builds from the last 90
    days. Otherwise, it will scrape builds since the latest build currently in
    the DB.
    """
    latest_build_num = self._get_latest_build_number()
    ninety_days_ago = timestamp_90_days_ago()
    page_num = 0
    last_date = None

    while True:
      logging.info('Fetching page %d of builds from Travis', page_num)

      builds = self.travis.fetch_builds(page_num)
      build_dicts = [{
          'id': build.id,
          'number': build.number,
          'duration': build.duration,
          'state': build.state,
          'started_at': build.started_at,
          'commit_hash': build.commit_hash,
      } for build in builds]
      logging.info('Scraped %d builds', len(build_dicts))

      for build in builds:
        try:
          self.session.add(build)
          self.session.flush()
        except sqlalchemy.exc.IntegrityError:
          # Drop builds already in the DB or those for commits not in the DB
          self.session.rollback()
        else:
          self.session.commit()
          logging.debug('Saved %r', build)

        if build.started_at:
          last_date = build.started_at

        last_data = builds[-1].started_at
      if (latest_build_num is None and last_date < ninety_days_ago) or (
          latest_build_num and builds[-1].number < latest_build_num):
        break

      page_num += 1
      time.sleep(SCRAPE_INTERVAL_SECONDS)

  @classmethod
  def scrape(cls):
    cls().scrape_since_latest()

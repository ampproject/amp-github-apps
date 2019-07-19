from typing import Sequence
import datetime
import logging
import time
import sqlalchemy

from apis import github
from database import db
from database import models

SCRAPE_INTERVAL_SECONDS = 3


class CherrypickScraper(object):

  def __init__(self):
    self.github = github.GitHubGraphQL()
    self.session = db.Session()

    commits = self.session.query(models.Commit.hash).union(
        self.session.query(models.Cherrypick.hash)).all()
    self.seen_commit_hashes = set(commit.hash for commit in commits)

  def scrape_release_cherrypicks(
      self, release: models.Release) -> Sequence[models.Cherrypick]:
    """Determines the commit SHAs of cherrypick commits in a release.

    This is determined by identifying all the commits in the release tag ref
    beyond the merge-base.

    Args:
      release: release to scrape cherry-picks for.

    Returns:
      A list of cherrypicks
    """
    logging.info('Querying GitHub for commits in release "%s"', release.name)
    response = self.github.query_repo("""
      release(tagName: "{release_name}") {{
        tag {{
          target {{
            ... on Commit {{
              history(first: 20) {{
                nodes {{ oid }}
              }}
            }}
          }}
        }}
      }}""".format(release_name=release.name))

    try:
      commits = response['release']['tag']['target']['history']['nodes']
    except KeyError:
      return []

    commit_hashes = [commit['oid'] for commit in commits]
    return [
        models.Cherrypick(hash=commit_hash, release_id=release.id)
        for commit_hash in commit_hashes
        if commit_hash not in self.seen_commit_hashes
    ]

  def scrape_cherrypicks(self, release_filter=None):
    full_release_filter = ~models.Release.scraped_cherrypicks
    if release_filter is not None:
      full_release_filter = full_release_filter & release_filter

    releases = self.session.query(models.Release).order_by(
        models.Release.published_at.asc()).filter(full_release_filter).all()

    logging.info('Scraping cherrypicks for %d releases', len(releases))
    for release in releases:
      try:
        cherrypicks = self.scrape_release_cherrypicks(release)
        self.session.add_all(cherrypicks)
        release.scraped_cherrypicks = True
        self.session.commit()
        self.seen_commit_hashes.update(
            cherrypick.hash for cherrypick in cherrypicks)
        logging.info('Scraped release "%s" (%d cherrypicks)', release.name,
                     len(cherrypicks))
      except github.GitHubGraphQL.GraphQLError:
        logging.warn('Could not find release with tag name "%s"', release.name)

      time.sleep(SCRAPE_INTERVAL_SECONDS)

  def scrape_recent_release_cherrypicks(self):
    self.scrape_cherrypicks(models.Release.is_last_90_days())

  def scrape_historical(self, unused_since: datetime.datetime):
    """Scrape historical cherry-picks for all releases in the DB.

    Args:
      unused_since: not used; exists to unify scrape_historical API across
        scrapers
    """
    self.scrape_cherrypicks()

  @classmethod
  def scrape(cls):
    cls().scrape_recent_release_cherrypicks()

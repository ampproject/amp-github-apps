import datetime
from typing import Optional, Text

from scrapers.commit_scraper import CommitScraper
from scrapers.build_scraper import BuildScraper
from scrapers.release_scraper import ReleaseScraper
from scrapers.cherrypick_scraper import CherrypickScraper
from scrapers.cherrypick_issue_scraper import CherrypickIssueScraper

NINETY_DAYS = datetime.timedelta(days=90)
ONE_YEAR = datetime.timedelta(days=365)
SCRAPER_MAP = {
    'commits': CommitScraper,
    'builds': BuildScraper,
    'releases': ReleaseScraper,
    'cherrypicks': CherrypickScraper,
    'cherrypick_issues': CherrypickIssueScraper,
}


def scrape(scrape_target: Text):
  """Scrape latest data to populate the DB.

  Args:
    scrape_target: type of data to scrape.

  Raises:
    KeyError: if an invalid scrape target is passed
  """
  SCRAPER_MAP[scrape_target].scrape()


def scrape_historical(scrape_target: Text,
                      since: Optional[datetime.datetime] = None):
  """Scrape historical data to backfill DB for historical metric computation.

  Args:
    scrape_target: type of data to scrape.
    since: datetime to scrape back until; defaults to one year and ninety days
      ago

  Raises:
    KeyError: if an invalid scrape target is passed
  """
  if since is None:
    since = datetime.datetime.now() - (ONE_YEAR + NINETY_DAYS)
  SCRAPER_MAP[scrape_target]().scrape_historical(since)

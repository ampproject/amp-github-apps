from scrapers.commit_scraper import CommitScraper
from scrapers.build_scraper import BuildScraper
from scrapers.release_scraper import ReleaseScraper
from scrapers.cherrypick_scraper import CherrypickScraper

_scraper_map = {
    'commits': CommitScraper,
    'builds': BuildScraper,
    'releases': ReleaseScraper,
    'cherrypicks': CherrypickScraper,
}


def scrape(scrape_target: str):
  _scraper_map[scrape_target].scrape()

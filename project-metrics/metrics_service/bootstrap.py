import datetime
import logging
import time
from typing import Sequence, Text

from database import db
from database import models
import scrapers
from metrics import base as base_metric

ONE_WEEK = datetime.timedelta(days=7)
ONE_YEAR = datetime.timedelta(days=365)
BACKOFF_INITIAL_SECONDS = 5
BACKOFF_LIMIT_SECONDS = 60 * 30


class RateLimitHandler(object):
  """Handler to exponentially back off when hitting a rate limit."""

  def __init__(self):
    self.backoff_seconds = BACKOFF_INITIAL_SECONDS

  def backoff(self):
    if self.backoff_seconds > BACKOFF_LIMIT_SECONDS:
      raise TimeoutError('Timeout backoff exceeds limit; giving up')
    logging.info('Hit timeout; backing off for %d seconds',
                 self.backoff_seconds)
    time.sleep(self.backoff_seconds)
    self.backoff_seconds *= 2

  def reset(self):
    self.backoff_seconds = BACKOFF_INITIAL_SECONDS


def scrape_all(targets: Sequence[Text]):
  """Scrape a year + 90 days of the selected targets."""
  limiter = RateLimitHandler()
  for target in targets:
    while True:
      try:
        scrapers.scrape_historical(target)
        break
      except TimeoutError as err:
        logging.error(err.message)
        limiter.backoff()
    limiter.reset()


def _compute_all_at_time(metrics: Sequence[base_metric.MetricImplementation],
                         base_time: datetime.datetime):
  """Computes metric results for a given time.

  Args:
    metrics: list of metrics to compute; parameterized for cases of backfilling
      only a subset of metrics
    base_time: time to backfill back to.
  """
  logging.info('Week of %s', base_time.strftime('%Y-%m-%d'))

  limiter = RateLimitHandler()
  for metric in metrics:
    while True:
      try:
        metric(base_time=base_time).recompute()
        break
      except TimeoutError as err:
        logging.error(err.message)
        limiter.backoff()
    limiter.reset()


def compute_all(metrics: Sequence[base_metric.MetricImplementation]):
  """Compute metric results for each week going back one year."""
  one_year_ago = datetime.datetime.now() - ONE_YEAR
  metric_names = [metric.name for metric in metrics]
  logging.info('Backfilling results to %s', one_year_ago.strftime('%Y-%m-%d'))

  session = db.Session()
  earliest_result = session.query(models.MetricResult).filter(
      models.MetricResult.name in metric_names).order_by(
          models.MetricResult.computed_at.asc()).first()
  session.close()

  earliest_result_time = (
      earliest_result.computed_at
      if earliest_result else datetime.datetime.now())

  next_result_time = earliest_result_time - ONE_WEEK
  while next_result_time > one_year_ago:
    _compute_all_at_time(metrics=metrics, base_time=next_result_time)
    next_result_time = next_result_time - ONE_WEEK

  logging.info('Finished backfilling metric results')


if __name__ == '__main__':
  logging.getLogger().setLevel(logging.INFO)
  scrape_all(['commits', 'builds', 'releases', 'cherrypicks'])
  compute_all(base_metric.Metric.get_active_metrics())

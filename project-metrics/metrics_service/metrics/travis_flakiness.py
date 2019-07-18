"""Travis Flakiness metric."""

import logging
import sqlalchemy
from typing import Dict

from database import db
from database import models
from metrics import base


class TravisFlakinessMetric(base.PercentageMetric):
  """A metric tracking the percentage of flaky Travis builds."""

  def _score_value(self, percentage: float) -> models.MetricScore:
    if percentage >= 0.20:
      return models.MetricScore.CRITICAL
    elif percentage >= 0.07:
      return models.MetricScore.POOR
    elif percentage >= 0.02:
      return models.MetricScore.MODERATE
    elif percentage >= 0.01:
      return models.MetricScore.GOOD
    else:
      return models.MetricScore.EXCELLENT

  def _compute_value(self) -> float:
    """Computes the percentage of flaky builds.

    A flaky build is defined here as any failing build surrounded by two passing
    builds (Pass-Fail-Pass). Excludes builds that are newly created, pending, or
    cancelled.

    Raises:
      ValueError: if no builds or too few builds exist.

    Returns:
      The percentage of passing builds.
    """
    logging.info('Counting flaky builds')
    session = db.Session()
    builds = models.Build.scope(session).filter(
        models.Build.state.in_([
            models.TravisState.PASSED,
            models.TravisState.FAILED,
            models.TravisState.ERRORED,
        ])).all()
    build_count = len(builds)

    if build_count == 0:
      raise ValueError('No Travis builds to process.')
    if build_count < 3:
      raise ValueError('Not enough Travis builds to determine flakiness.')

    flakes = 0
    build_triples = zip(builds[:-2], builds[1:-1], builds[2:])
    for prev_build, curr_build, next_build in build_triples:
      if (prev_build.state == models.TravisState.PASSED and
          curr_build.state != models.TravisState.PASSED and
          next_build.state == models.TravisState.PASSED):
        flakes += 1

    return flakes / build_count


base.Metric.register(TravisFlakinessMetric)

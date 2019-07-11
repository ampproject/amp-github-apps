"""Travis Greenness metric."""

import logging
import sqlalchemy
from typing import Dict

from database import db
from database import models
from metrics import base


class TravisGreennessMetric(base.PercentageMetric):
  """A metric tracking the percentage of green Travis builds."""

  def _score_value(self, percentage: float) -> models.MetricScore:
    if percentage < 0.6:
      return models.MetricScore.CRITICAL
    elif percentage < 0.74:
      return models.MetricScore.POOR
    elif percentage < 0.90:
      return models.MetricScore.MODERATE
    elif percentage < 0.95:
      return models.MetricScore.GOOD
    else:
      return models.MetricScore.EXCELLENT

  def _count_states(self) -> Dict[models.TravisState, int]:
    """Counts the number of builds for each relevant build state."""
    logging.info('Counting successful builds')
    session = db.Session()
    count_query = session.query(
        models.Build.state,
        sqlalchemy.func.count().label('state_count')).filter(
            models.Build.is_last_90_days()).group_by(models.Build.state).filter(
                models.Build.state.in_([
                    models.TravisState.PASSED,
                    models.TravisState.FAILED,
                    models.TravisState.ERRORED,
                ]))
    state_counts = count_query.all()
    return dict(state_counts)

  def _compute_value(self) -> float:
    """Computes the percentage of completed builds which passed.

    Excludes builds that are newly created, pending, or cancelled.

    Raises:
      ValueError: if no builds exist.

    Returns:
      The percentage of passing builds.
    """
    state_count_map = dict(self._count_states())

    passed = state_count_map.get(models.TravisState.PASSED, 0)
    failed = state_count_map.get(models.TravisState.FAILED, 0)
    errored = state_count_map.get(models.TravisState.ERRORED, 0)

    total = passed + failed + errored
    if total:
      return passed / total
    raise ValueError('No Travis builds to process.')


base.Metric.register(TravisGreennessMetric)

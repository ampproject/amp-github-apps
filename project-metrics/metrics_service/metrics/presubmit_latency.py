"""Presubmit Latency metric."""

import sqlalchemy
from typing import Text

from database import db
from database import models
from metrics import base


class PresubmitLatencyMetric(base.Metric):
  """A metric tracking the average duration of Travis PR builds."""

  def _format_value(self, avg_seconds: float) -> Text:
    return '%dm' % (avg_seconds // 60)

  def _score_value(self, avg_seconds: float) -> models.MetricScore:
    avg_minutes = avg_seconds / 60
    if avg_minutes > 35:
      return models.MetricScore.CRITICAL
    elif avg_minutes > 25:
      return models.MetricScore.POOR
    elif avg_minutes > 15:
      return models.MetricScore.MODERATE
    elif avg_minutes > 10:
      return models.MetricScore.GOOD
    else:
      return models.MetricScore.EXCELLENT

  def _compute_value(self) -> float:
    """Computes the average duration of all completed builds.

    Excludes builds that are newly created, pending, cancelled, or errored since
    these either have no duration or are not representative of a real build.

    Raises:
      ValueError: if no builds exist.

    Returns:
      The percentage of passing builds.
    """
    session = db.Session()
    avg_seconds = session.query(sqlalchemy.func.avg(
        models.Build.duration)).filter(models.Build.is_last_90_days()).scalar()
    if avg_seconds:
      return float(avg_seconds)
    raise ValueError('No Travis builds to process.')


base.Metric.register(PresubmitLatencyMetric)

"""Release Cherrypick Count metric."""

import logging
import sqlalchemy
from typing import Text, Dict

from database import db
from database import models
from metrics import base


class CherrypickIssueCountMetric(base.Metric):
  """A metric tracking the number of cherry-picks in releases."""

  UNIT = 'CPs/90d'

  def _format_value(self, num_cherrypicks: float) -> Text:
    return '%d CP%s/90d' % (num_cherrypicks,
                            ('s' if num_cherrypicks > 1 else ''))

  def _score_value(self, num_cherrypicks: float) -> models.MetricScore:
    if num_cherrypicks > 10:
      return models.MetricScore.CRITICAL
    elif num_cherrypicks > 5:
      return models.MetricScore.POOR
    elif num_cherrypicks > 3:
      return models.MetricScore.MODERATE
    elif num_cherrypicks > 1:
      return models.MetricScore.GOOD
    else:
      return models.MetricScore.EXCELLENT

  def _compute_value(self) -> float:
    """Counts the number of cherry-picks in the last 90 days.

    Returns:
      The number of cherry-picks.
    """
    logging.info('Counting cherry-picks')
    session = db.Session()
    result = models.CherrypickIssue.scope(
        session, base_time=self.base_time).count()
    session.close()
    return result


base.Metric.register(CherrypickIssueCountMetric)

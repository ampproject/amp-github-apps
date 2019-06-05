"""Presubmit-Ignored metric."""

import db_engine
from metrics import base
import models


class PresubmitIgnoredMetric(base.Metric):
  """A metric tracking the number of PRs that submitted with failing builds."""

  def _format_value(self, ignored: float):
    return '1PR/90d' if ignored == 1 else '%dPRs/90d' % ignored

  def _score_value(self, ignored: float) -> models.MetricScore:
    if ignored > 20:
      return models.MetricScore.POOR
    elif ignored > 6:
      return models.MetricScore.MODERATE
    elif ignored > 3:
      return models.MetricScore.GOOD
    else:
      return models.MetricScore.EXCELLENT

  def _compute_value(self) -> float:
    """Computes the number of PR builds which ended up with a failing state.

    Excludes builds that are newly created, pending, or cancelled.

    Raises:
      ValueError: if no builds exist.

    Returns:
      The number of failed or errored builds.
    """
    session = db_engine.get_session()
    return session.query(models.Build).filter(
        models.Build.state.in_([
            models.TravisState.FAILED,
            models.TravisState.ERRORED,
        ])).count()

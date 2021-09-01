"""Absolute Coverage metric."""

from apis import codecov
from metrics import base
from database import db
from database import models


class AbsoluteCoverageMetric(base.PercentageMetric):
  """A metric tracking absolute code coverage via Codecov."""

  def _score_value(self, percentage: float) -> models.MetricScore:
    if percentage < 0.6:
      return models.MetricScore.POOR
    elif percentage < 0.75:
      return models.MetricScore.MODERATE
    elif percentage < 0.9:
      return models.MetricScore.GOOD
    else:
      return models.MetricScore.EXCELLENT

  def _compute_value(self) -> float:
    """Determines the code coverage percentage from Codecov.

    Returns:
      The percentage of lines tested in HEAD.
    """
    session = db.Session()
    head_commit = session.query(models.Commit).filter(
        models.Commit.committed_at < self.base_time).order_by(
            models.Commit.committed_at.desc()).first()
    session.close()
    if not head_commit:
      raise ValueError('No commit available before %s' % self.base_time)
    return codecov.CodecovApi().get_absolute_coverage(head_commit.hash) / 100


base.Metric.register(AbsoluteCoverageMetric)

"""Absolute Coverage metric."""

from apis import codecov
from metrics import base
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
    return codecov.CodecovApi().get_absolute_coverage() / 100


base.Metric.register(AbsoluteCoverageMetric)

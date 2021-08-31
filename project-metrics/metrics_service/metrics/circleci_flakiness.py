"""CircleCI Flakiness metric."""

from metrics.base import PercentageMetric
from metrics import base
from database import db
from database import models
from apis.circleci import CircleCiAPI

class CircleCiFlakiness(PercentageMetric):
  def _score_value(self, percentage: float) -> models.MetricScore:
    if percentage < 0.6:
      return models.MetricScore.POOR
    elif percentage < 0.75:
      return models.MetricScore.MODERATE
    elif percentage < 0.9:
      return models.MetricScore.GOOD
    else:
      return models.MetricScore.EXCELLENT

  def _compute_value(self) -> models.MetricResult:
    workflow_stats = CircleCiAPI().get_workflow_stats()
    metrics = workflow_stats['metrics']
    return metrics['failed_runs'] / metrics['total_runs']
  
base.Metric.register(CircleCiFlakiness)

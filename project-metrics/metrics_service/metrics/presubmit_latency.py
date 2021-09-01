"""CircleCI Presubmit Latency."""

from typing import Text
from metrics.base import Metric
from metrics import base
from database import db
from database import models
from apis.circleci import CircleCiAPI

class PresubmitLatency(Metric):
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
    return workflow_stats.metrics.duration_metrics.mean

  def _format_value(self, avg_seconds: float) -> Text:
    return '%dm' % (avg_seconds // 60)
  
base.Metric.register(PresubmitLatency)

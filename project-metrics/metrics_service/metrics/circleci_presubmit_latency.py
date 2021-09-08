
"""CircleCI Presubmit Latency."""

from typing import Text
from metrics.base import Metric
from metrics import base
from database import models
from apis.circleci import CircleCiAPI

class CircleCiPresubmitLatency(Metric):
  def _score_value(self, presubmit_latency: float) -> models.MetricScore:
    if presubmit_latency > 1800:
      return models.MetricScore.CRITICAL
    elif presubmit_latency > 1500:
      return models.MetricScore.POOR
    elif presubmit_latency > 1200:
      return models.MetricScore.MODERATE
    elif presubmit_latency > 900:
      return models.MetricScore.GOOD
    else:
      return models.MetricScore.EXCELLENT

  def _compute_value(self) -> models.MetricResult:
    workflow_stats = CircleCiAPI().get_workflow_stats()
    return workflow_stats.metrics.duration_metrics.mean

  def _format_value(self, avg_seconds: float) -> Text:
    return '%dm' % (avg_seconds // 60)
  
base.Metric.register(CircleCiPresubmitLatency)

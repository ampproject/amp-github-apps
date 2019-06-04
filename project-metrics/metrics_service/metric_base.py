"""Base interface for metrics to implement."""

import abc
from typing import Sequence, Optional, Text
import stringcase

import models


class Metric(object):
  """Abstract base class for health metrics."""

  __metaclass__ = abc.ABCMeta

  def __init__(self):
    self._result = None

    class_name = self.__class__.__name__
    if class_name.endswith('Metric'):
      class_name = class_name[:-6]

    self.label = stringcase.titlecase(class_name)
    self.name = stringcase.snakecase(class_name)

  def __str__(self) -> Text:
    return '%s: %s' % (self.label, self.formatted_result)

  @property
  def formatted_result(self) -> Text:
    """The formatted result value (ex. 3w, 80%, 100PRs)."""
    if self._result is None:
      return '?'
    return self._format_value(self.result.value)

  @property
  def result(self) -> Optional[models.MetricResult]:
    """The result of a computation of the metric."""
    if self._result is None:
      self._result = self._fetch_result()
    return self._result

  @property
  def score(self) -> models.MetricScore:
    """The 0-4 score for the metric."""
    if self.result:
      return self._score_value(self.result.value)
    return models.MetricScore.UNKNOWN

  def recompute(self) -> None:
    """Computes the metric and records the result in the `metrics` table."""
    self._result = models.MetricResult(
        value=self._compute_value(), name=self.name)
    # TODO(rcebulko): Insert row into `metrics` table

  def _fetch_result(self) -> Optional[models.MetricResult]:
    """Gets the most recent result for the metric from the DB."""
    # TODO(rcebulko): Query latest matching result from DB
    return None

  @abc.abstractmethod
  def _format_value(self, value: float) -> Text:
    """Format the result value (ex. 3w, 80%, 100PRs)."""
    pass

  @abc.abstractmethod
  def _score_value(self, value: float) -> models.MetricScore:
    """Given a raw metric value, produce a standardized score.

    The raw value's meaning is defined by the metric itself (ie. it could be a
    percentage, duration, count, etc.). This method must be implemented by
    each metric to place the result into one of the defined score buckets.

    Args:
      value: raw metric value.

    Returns:
      A standardized metric score.
    """
    pass

  @abc.abstractmethod
  def _compute_value(self) -> models.MetricResult:
    """Compute the metric.

    Must be implemented by each metric. Executes metric-specific logic,
    queries, etc.

    Returns:
      The result of the metric computation.
    """
    pass


class PercentageMetric(Metric):
  """Abstract base class for a metric with a percentage value."""

  def _format_value(self, percentage: float) -> Text:
    return '%.1f%%' % (percentage * 100)

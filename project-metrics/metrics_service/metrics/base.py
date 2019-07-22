"""Base interface for metrics to implement.

To create a new metric:
1. Subclass `Metric` or `PercentMetric`
2. Implement `_score_value`, `_compute_value`, and (unless you're using
   `PercentMetric`) `_format_value`
3. Call `metrics.base.Metric.register(YourNewMetric)`
4. Import the metric in __init__.py so it can register itself
5. Define the update frequency with a job in `cron.yaml`
6. Once the metric has been computed at least once, add a corresponding badge to
   the metrics section of
   https://github.com/ampproject/amphtml/blob/master/README.md
"""

import abc
import datetime
import logging
import sqlalchemy
import stringcase
from typing import Any, Dict, Iterable, Optional, Sequence, Text, Type, TypeVar

from database import db
from database import models

MetricImplementation = Type[TypeVar('U', bound='Metric')]


class Metric(object):
  """Abstract base class for health metrics."""

  __metaclass__ = abc.ABCMeta
  _active_metrics = {}

  @classmethod
  def register(cls, metric_cls: MetricImplementation):
    """Register a metric to be included in result fetching.

    Args:
      metric_cls: metric implementation to make active.
    """
    logging.info('Registered metric: %s', metric_cls.__name__)
    cls._active_metrics[metric_cls.__name__] = metric_cls

  @classmethod
  def __from_result(cls, result: models.MetricResult) -> MetricImplementation:
    """Wraps a result in its metric class for display/processing.

    Expects that the result is for an active metric.

    Raises:
      KeyError: if the result is for an inactive or non-existent metric.

    Args:
      result: metric result retrieved from the DB.

    Returns:
      A metric implementation holding the result.
    """
    return cls._active_metrics[result.name](result=result)

  @classmethod
  def get_latest(cls) -> Dict[Text, MetricImplementation]:
    """Fetch the latest result for each metric.

    Returns:
      Mapping of metric names to the latest result for each.
    """
    logging.debug('Fetching latest metric results')
    metric_results = models.MetricResult.__table__
    session = db.Session()
    active_metrics_names = cls._active_metrics.keys()

    max_dates_query = session.query(
        metric_results.c.name,
        sqlalchemy.func.max(metric_results.c.computed_at)
        .label('max_computed_at')).group_by(metric_results.c.name).filter(
            metric_results.c.name.in_(active_metrics_names)).subquery('latest')

    latest_results_query = session.query(models.MetricResult).join(
        max_dates_query,
        sqlalchemy.and_(
            metric_results.c.name == max_dates_query.c.name,
            metric_results.c.computed_at == max_dates_query.c.max_computed_at))

    results = {
        result.name: cls.__from_result(result)
        for result in latest_results_query
    }
    session.close()
    return results

  @classmethod
  def get_metric(cls, metric_cls_name) -> models.MetricResult:
    return cls._active_metrics[metric_cls_name]

  @classmethod
  def get_active_metrics(cls) -> Sequence[models.MetricResult]:
    return list(cls._active_metrics.values())

  def __init__(self,
               result: Optional[models.MetricResult] = None,
               base_time: Optional[datetime.datetime] = None):
    self.result = result
    self.base_time = base_time or datetime.datetime.now()

  def __str__(self) -> Text:
    return '%s: %s' % (self.label, self.formatted_result)

  @property
  def name(self):
    """Metric name to use as DB identifier when storing results."""
    return self.__class__.__name__

  @property
  def label(self) -> Text:
    """Label for the metric (ex. TestCoverageMetric -> "Test Coverage")."""
    return stringcase.titlecase(
        self.name[:-6] if self.name.endswith('Metric') else self.name)

  @property
  def formatted_result(self) -> Text:
    """The formatted result value (ex. 3w, 80%, 100PRs)."""
    return self._format_value(self.result.value) if self.result else '?'

  @property
  def score(self) -> models.MetricScore:
    """The 1-5 score for the metric."""
    return self._score_value(
        self.result.value) if self.result else models.MetricScore.UNKNOWN

  @property
  def serializable(self) -> Dict[Text, Any]:
    return {
        'name': self.name,
        'label': self.label,
        'formatted_result': self.formatted_result,
        'score': self.score.name,
        'computed_at': str(self.result.computed_at),
    }

  def recompute(self) -> None:
    """Computes the metric and records the result in the `metrics` table."""
    logging.info('Recomputing metric %s at %s', self.name, self.base_time)
    self.result = models.MetricResult(
        value=self._compute_value(), name=self.name, computed_at=self.base_time)

    logging.info('Updating metric %s value to %.3g', self.name,
                 self.result.value)
    session = db.Session()
    session.add(self.result)
    session.commit()
    session.close()

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

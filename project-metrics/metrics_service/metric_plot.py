import datetime
import logging
import matplotlib
matplotlib.use('TkAgg')
from matplotlib import pyplot as plt
from typing import Sequence, Tuple
import io

from database import db
from database import models
from metrics import base as base_metric


class MetricHistoryPlotter(object):
  """Plots metric results over the last six months.

  WARNING: THIS CODE IS NOT THREAD-SAFE. DO NOT USE IN A REQUEST-HANDLER.
  The underlying `matplotlib` library uses a shared TkAgg backend which only
  works with one plot instance at a time. It is safe to call this from a Cron
  task, but drawing in a web request context could result in parallel calls
  drawing on each other.
  """

  def __init__(self, metric: base_metric.MetricImplementation,
               history_days: int):
    self.metric = metric
    self.history_days = history_days
    self.history = self._get_metric_history()

  def __del__(self):
    plt.clf()

  def plot_metric_history(self, width=4, height=2) -> io.BytesIO:
    """Plots 6 months of metric results.

    Args:
      width: plot width in inches.
      height: plot height in inches.

    Returns:
      A byte buffer containing the plot rendered as a PNG.
    """
    logging.info('Plotting %d days of results for %s', self.history_days,
                 self.metric.name)
    self._make_plot()
    self._set_labels()
    return self._save_plot_to_buffer(width, height)

  def _get_metric_history(self) -> Sequence[models.MetricResult]:
    start_date = datetime.datetime.now() - datetime.timedelta(
        days=self.history_days)

    session = db.Session()
    history = session.query(models.MetricResult).order_by(
        models.MetricResult.computed_at.asc()).filter(
            (models.MetricResult.name == self.metric.name)
            & (models.MetricResult.computed_at > start_date)).all()

    session.close()
    return history

  def _make_plot(self):
    result_dates = [result.computed_at for result in self.history]
    result_values = [result.value for result in self.history]

    # Show percentage values in the range [0, 100] rather the range [0, 1].
    if isinstance(self.metric, base_metric.PercentageMetric):
      result_values = [val * 100 for val in result_values]

    plt.plot(result_dates, result_values, 'b-')

  def _set_labels(self):
    plt.title('%s (Last %d Days)' % (self.metric.label, self.history_days))
    plt.ylabel('Metric Value (%s)' % self.metric.UNIT)
    plt.xlabel('Date')

  def _save_plot_to_buffer(self, width, height) -> io.BytesIO:
    buf = io.BytesIO()
    plt.savefig(buf, format='png')
    buf.seek(0)
    return buf

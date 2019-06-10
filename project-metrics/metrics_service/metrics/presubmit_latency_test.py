"""Tests for presubmit-latency metric."""

import datetime
import unittest

from database import models
from metrics import presubmit_latency
from test import metric_test_case


class TestPresubmitLatencyMetric(metric_test_case.MetricTestCase):

  def new_metric_under_test(self):
    return presubmit_latency.PresubmitLatencyMetric()

  def testRecompute(self):
    common_values = {
        'started_at': datetime.datetime.now(),
        'number': 1,
        'state': models.TravisState.PASSED,
    }
    session = self.Session()
    session.add_all([
        models.Build(duration=1000, **common_values),
        models.Build(duration=2000, **common_values),
        models.Build(duration=3000, **common_values),
        models.Build(duration=4000, **common_values),
        models.Build(duration=5000, **common_values),
    ])
    session.commit()

    self.metric.recompute()
    # value = (1000 + 2000 + 3000 + 4000 + 5000) / 5
    self.assertLatestResultEquals(3000)

  def testRecomputeNoBuilds(self):
    with self.assertRaisesRegex(ValueError, 'No Travis builds to process.'):
      self.metric.recompute()

  def testName(self):
    self.assertEqual(self.metric.name, 'PresubmitLatencyMetric')

  def testLabel(self):
    self.assertEqual(self.metric.label, 'Presubmit Latency')

  def testScore(self):
    self.assertEqual(self.metric.score, models.MetricScore.UNKNOWN)
    self.assertValueHasScore(30, models.MetricScore.POOR)
    self.assertValueHasScore(25, models.MetricScore.MODERATE)
    self.assertValueHasScore(20, models.MetricScore.MODERATE)
    self.assertValueHasScore(15, models.MetricScore.GOOD)
    self.assertValueHasScore(12, models.MetricScore.GOOD)
    self.assertValueHasScore(10, models.MetricScore.EXCELLENT)
    self.assertValueHasScore(5, models.MetricScore.EXCELLENT)

  def testFormattedResult(self):
    self.assertEqual(self.metric.formatted_result, '?')

    self.metric.result = models.MetricResult(
        name='PresubmitLatencyMetric', value=15 * 60)
    self.assertEqual(self.metric.formatted_result, '15m')


if __name__ == '__main__':
  unittest.main()

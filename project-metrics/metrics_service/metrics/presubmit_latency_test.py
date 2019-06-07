"""Tests for presubmit-latency metric."""

import datetime
import unittest

from database import models
from metrics import presubmit_latency
from test import metric_test_case


class TestPresubmitLatencyMetric(metric_test_case.MetricTestCase):

  def tearDown(self):
    super(TestPresubmitLatencyMetric, self).tearDown()
    session = self.Session()
    session.query(models.Build).delete()
    session.commit()

  def new_metric_under_test(self):
    return presubmit_latency.PresubmitLatencyMetric()

  def testRecompute(self):
    default_values = {
        'started_at': datetime.datetime.now(),
        'number': 1,
        'state': models.TravisState.PASSED,
    }
    session = self.Session()
    session.add_all([
        models.Build(duration=1000, **default_values),
        models.Build(duration=2000, **default_values),
        models.Build(duration=3000, **default_values),
        models.Build(duration=4000, **default_values),
        models.Build(duration=5000, **default_values),
    ])
    session.commit()

    self.metric.recompute()
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
    self.assertScores([
        (30, models.MetricScore.POOR),
        (25, models.MetricScore.MODERATE),
        (20, models.MetricScore.MODERATE),
        (15, models.MetricScore.GOOD),
        (12, models.MetricScore.GOOD),
        (10, models.MetricScore.EXCELLENT),
        (5, models.MetricScore.EXCELLENT),
    ])

  def testFormattedResult(self):
    self.assertEqual(self.metric.formatted_result, '?')

    self.metric.result = models.MetricResult(
        name='PresubmitLatencyMetric', value=15 * 60)
    self.assertEqual(self.metric.formatted_result, '15m')


if __name__ == '__main__':
  unittest.main()

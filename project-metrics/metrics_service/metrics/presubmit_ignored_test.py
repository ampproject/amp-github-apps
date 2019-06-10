"""Tests for presubmit-ignored metric."""

import datetime
import unittest

from database import models
from metrics import presubmit_ignored
from test import metric_test_case


class TestPresubmitIgnoredMetric(metric_test_case.MetricTestCase):

  def new_metric_under_test(self):
    return presubmit_ignored.PresubmitIgnoredMetric()

  def testRecompute(self):
    common_values = {
        'started_at': datetime.datetime.now(),
        'number': 1,
        'duration': 1000,
    }
    session = self.Session()
    session.add_all([
        models.Build(state=models.TravisState.PASSED, **common_values),
        models.Build(state=models.TravisState.CANCELLED, **common_values),
        models.Build(state=models.TravisState.PASSED, **common_values),
        models.Build(state=models.TravisState.ERRORED, **common_values),
        models.Build(state=models.TravisState.FAILED, **common_values),
    ])
    session.commit()

    self.metric.recompute()
    # value = (1 FAILED) + (1 ERRORED)
    self.assertLatestResultEquals(2)

  def testName(self):
    self.assertEqual(self.metric.name, 'PresubmitIgnoredMetric')

  def testLabel(self):
    self.assertEqual(self.metric.label, 'Presubmit Ignored')

  def testScore(self):
    self.assertEqual(self.metric.score, models.MetricScore.UNKNOWN)
    self.assertValueHasScore(25, models.MetricScore.POOR)
    self.assertValueHasScore(20, models.MetricScore.MODERATE)
    self.assertValueHasScore(10, models.MetricScore.MODERATE)
    self.assertValueHasScore(6, models.MetricScore.GOOD)
    self.assertValueHasScore(4, models.MetricScore.GOOD)
    self.assertValueHasScore(3, models.MetricScore.EXCELLENT)
    self.assertValueHasScore(2, models.MetricScore.EXCELLENT)

  def testFormattedResult(self):
    self.assertEqual(self.metric.formatted_result, '?')

    self.metric.result = models.MetricResult(
        name='PresubmitIgnoredMetric', value=1)
    self.assertEqual(self.metric.formatted_result, '1PR/90d')

    self.metric.result = models.MetricResult(
        name='PresubmitIgnoredMetric', value=5)
    self.assertEqual(self.metric.formatted_result, '5PRs/90d')


if __name__ == '__main__':
  unittest.main()

"""Tests for travis-greenness metric."""

import datetime
import unittest

from database import models
from metrics import travis_greenness
from test import metric_test_case


class TestTravisGreennessMetric(metric_test_case.MetricTestCase):

  def new_metric_under_test(self):
    return travis_greenness.TravisGreennessMetric()

  def testRecompute(self):
    common_values = {
        'started_at': datetime.datetime.now(),
        'number': 1,
        'duration': 1000,
    }
    session = self.Session()
    session.add_all([
        models.Build(state=models.TravisState.PASSED, **common_values),
        models.Build(state=models.TravisState.CANCELED, **common_values),
        models.Build(state=models.TravisState.PASSED, **common_values),
        models.Build(state=models.TravisState.ERRORED, **common_values),
        models.Build(state=models.TravisState.FAILED, **common_values),
    ])
    session.commit()

    self.metric.recompute()
    # value = (2 PASSED) / (2 PASSED + 2 FAILED)
    self.assertLatestResultEquals(0.5)

  def testRecomputeNoBuilds(self):
    with self.assertRaisesRegex(ValueError, 'No Travis builds to process.'):
      self.metric.recompute()

  def testName(self):
    self.assertEqual(self.metric.name, 'TravisGreennessMetric')

  def testLabel(self):
    self.assertEqual(self.metric.label, 'Travis Greenness')

  def testScore(self):
    self.assertEqual(self.metric.score, models.MetricScore.UNKNOWN)
    self.assertValueHasScore(0.5, models.MetricScore.CRITICAL)
    self.assertValueHasScore(0.6, models.MetricScore.POOR)
    self.assertValueHasScore(0.7, models.MetricScore.POOR)
    self.assertValueHasScore(0.74, models.MetricScore.MODERATE)
    self.assertValueHasScore(0.8, models.MetricScore.MODERATE)
    self.assertValueHasScore(0.90, models.MetricScore.GOOD)
    self.assertValueHasScore(0.93, models.MetricScore.GOOD)
    self.assertValueHasScore(0.95, models.MetricScore.EXCELLENT)
    self.assertValueHasScore(0.99, models.MetricScore.EXCELLENT)

  def testFormattedResult(self):
    self.assertEqual(self.metric.formatted_result, '?')

    self.metric.result = models.MetricResult(
        name='TravisGreennessMetric', value=0.5)
    self.assertEqual(self.metric.formatted_result, '50.0%')


if __name__ == '__main__':
  unittest.main()

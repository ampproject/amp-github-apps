"""Tests for travis-flakiness metric."""

import datetime
import unittest

from database import models
from metrics import travis_flakiness
from test import metric_test_case


class TestTravisFlakinessMetric(metric_test_case.MetricTestCase):

  def new_metric_under_test(self):
    return travis_flakiness.TravisFlakinessMetric()

  def testRecompute(self):
    common_values = {
        'started_at': datetime.datetime.now(),
        'number': 1,
        'duration': 1000,
        'commit': models.Commit(hash='test_hash'),
    }
    session = self.Session()
    session.add_all([
        models.Build(state=models.TravisState.PASSED, **common_values),
        models.Build(state=models.TravisState.PASSED, **common_values),

        # Flake
        models.Build(state=models.TravisState.PASSED, **common_values),
        models.Build(state=models.TravisState.FAILED, **common_values),
        models.Build(state=models.TravisState.PASSED, **common_values),

        # Not flakes (considered "true failures")
        models.Build(state=models.TravisState.FAILED, **common_values),
        models.Build(state=models.TravisState.FAILED, **common_values),

        # Flake (canceled ignored & excluded from total)
        models.Build(state=models.TravisState.PASSED, **common_values),
        models.Build(state=models.TravisState.FAILED, **common_values),
        models.Build(state=models.TravisState.CANCELED, **common_values),
        models.Build(state=models.TravisState.PASSED, **common_values),

        # Flake (errored is considered failed)
        models.Build(state=models.TravisState.PASSED, **common_values),
        models.Build(state=models.TravisState.ERRORED, **common_values),
        models.Build(state=models.TravisState.PASSED, **common_values),

        # Not a flake (previous build passed, but next build unknown)
        models.Build(state=models.TravisState.PASSED, **common_values),
        models.Build(state=models.TravisState.FAILED, **common_values),
    ])
    session.commit()

    self.metric.recompute()
    # value = (3 FLAKES) / (15 BUILDS)
    self.assertLatestResultEquals(0.2)

  def testRecomputeNoBuilds(self):
    with self.assertRaisesRegex(ValueError, 'No Travis builds to process.'):
      self.metric.recompute()

  def testRecomputeFewBuilds(self):
    with self.assertRaisesRegex(
        ValueError, 'Not enough Travis builds to determine flakiness.'):
      common_values = {
          'started_at': datetime.datetime.now(),
          'number': 1,
          'duration': 1000,
          'commit': models.Commit(hash='test_hash'),
      }
      session = self.Session()
      session.add_all([
          models.Build(state=models.TravisState.PASSED, **common_values),
          models.Build(state=models.TravisState.PASSED, **common_values),
      ])
      session.commit()

      self.metric.recompute()

  def testName(self):
    self.assertEqual(self.metric.name, 'TravisFlakinessMetric')

  def testLabel(self):
    self.assertEqual(self.metric.label, 'Travis Flakiness')

  def testScore(self):
    self.assertEqual(self.metric.score, models.MetricScore.UNKNOWN)
    self.assertValueHasScore(0.30, models.MetricScore.CRITICAL)
    self.assertValueHasScore(0.20, models.MetricScore.CRITICAL)
    self.assertValueHasScore(0.10, models.MetricScore.POOR)
    self.assertValueHasScore(0.07, models.MetricScore.POOR)
    self.assertValueHasScore(0.05, models.MetricScore.MODERATE)
    self.assertValueHasScore(0.02, models.MetricScore.MODERATE)
    self.assertValueHasScore(0.015, models.MetricScore.GOOD)
    self.assertValueHasScore(0.01, models.MetricScore.GOOD)
    self.assertValueHasScore(0.005, models.MetricScore.EXCELLENT)
    self.assertValueHasScore(0.00, models.MetricScore.EXCELLENT)

  def testFormattedResult(self):
    self.assertEqual(self.metric.formatted_result, '?')

    self.metric.result = models.MetricResult(
        name='TravisFlakinessMetric', value=0.5)
    self.assertEqual(self.metric.formatted_result, '50.0%')


if __name__ == '__main__':
  unittest.main()

"""Tests for absolute-coverage metric."""

import datetime
import unittest
from unittest import mock

from apis import codecov
from database import models
from metrics import absolute_coverage
from test import metric_test_case


class TestAbsoluteCoverageMetric(metric_test_case.MetricTestCase):

  def new_metric_under_test(self):
    return absolute_coverage.AbsoluteCoverageMetric()

  @mock.patch.object(
      codecov.CodecovApi, 'get_absolute_coverage', return_value=42)
  def testRecompute(self, mock_get_absolute_coverage):
    session = self.Session()
    session.add(
        models.Commit(
            hash='test_hash',
            committed_at=datetime.datetime.now() - datetime.timedelta(days=10)))
    session.commit()

    self.metric.recompute()
    self.assertLatestResultEquals(0.42)
    mock_get_absolute_coverage.assert_called_once_with('test_hash')

  def testRecomputeNoCommits(self):
    with self.assertRaisesRegex(ValueError, 'No commit available before '):
      self.metric.recompute()

  def testName(self):
    self.assertEqual(self.metric.name, 'AbsoluteCoverageMetric')

  def testLabel(self):
    self.assertEqual(self.metric.label, 'Absolute Coverage')

  def testScore(self):
    self.assertEqual(self.metric.score, models.MetricScore.UNKNOWN)
    self.assertValueHasScore(0.5, models.MetricScore.POOR)
    self.assertValueHasScore(0.6, models.MetricScore.MODERATE)
    self.assertValueHasScore(0.7, models.MetricScore.MODERATE)
    self.assertValueHasScore(0.75, models.MetricScore.GOOD)
    self.assertValueHasScore(0.8, models.MetricScore.GOOD)
    self.assertValueHasScore(0.9, models.MetricScore.EXCELLENT)
    self.assertValueHasScore(0.95, models.MetricScore.EXCELLENT)

  def testFormattedResult(self):
    self.assertEqual(self.metric.formatted_result, '?')
    self.metric.result = models.MetricResult(
        name='AbsoluteCoverageMetric', value=0.5)
    self.assertEqual(self.metric.formatted_result, '50.0%')


if __name__ == '__main__':
  unittest.main()

"""Tests for absolute-coverage metric."""

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
    self.metric.recompute()
    self.assertLatestResultEquals(0.42)
    mock_get_absolute_coverage.assert_called_once()

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

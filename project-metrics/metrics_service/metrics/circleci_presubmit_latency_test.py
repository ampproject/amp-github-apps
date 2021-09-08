"""Tests for circle ci presubmit latency metric."""

from database import models
from unittest import mock
from metrics import circleci_presubmit_latency
from test import metric_test_case

from apis.circleci_test import stub_circleci_api

class TestCircleCiPresubmitLatency(metric_test_case.MetricTestCase):
  def setUp(self):
    super(TestCircleCiPresubmitLatency, self).setUp()
    stub_circleci_api()
    self.addCleanup(mock.patch.stopall)
    

  def new_metric_under_test(self):
    return circleci_presubmit_latency.CircleCiPresubmitLatency()

  def testRecompute(self):
    self.metric.recompute()
    self.assertLatestResultEquals(1124)

  def testName(self):
    self.assertEqual(self.metric.name, 'CircleCiPresubmitLatency')

  def testLabel(self):
    self.assertEqual(self.metric.label, 'Circle Ci Presubmit Latency')

  def testScore(self):
    self.assertEqual(self.metric.score, models.MetricScore.UNKNOWN)
    self.assertValueHasScore(1801, models.MetricScore.CRITICAL)
    self.assertValueHasScore(1501, models.MetricScore.POOR)
    self.assertValueHasScore(1201, models.MetricScore.MODERATE)
    self.assertValueHasScore(901, models.MetricScore.GOOD)
    self.assertValueHasScore(900, models.MetricScore.EXCELLENT)
    self.assertValueHasScore(100, models.MetricScore.EXCELLENT)

  def testFormattedResult(self):
    self.assertEqual(self.metric.formatted_result, '?')

    self.metric.result = models.MetricResult(
        name='PresubmitLatency', value=15 * 60)
    self.assertEqual(self.metric.formatted_result, '15m')
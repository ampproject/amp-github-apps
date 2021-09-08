"""Tests for circleci flakiness metric."""

from database import models
from unittest import mock
from metrics import circleci_flakiness
from test import metric_test_case

from apis.circleci_test import stub_circleci_api

class CircleCiFlakiness(metric_test_case.MetricTestCase):
  def setUp(self):
    super(CircleCiFlakiness, self).setUp()
    stub_circleci_api()
    self.addCleanup(mock.patch.stopall)
    

  def new_metric_under_test(self):
    return circleci_flakiness.CircleCiFlakiness()

  def testRecompute(self):
    self.metric.recompute()
    self.assertLatestResultEquals(309/740)

  def testName(self):
    self.assertEqual(self.metric.name, 'CircleCiFlakiness')

  def testLabel(self):
    self.assertEqual(self.metric.label, 'Circle Ci Flakiness')

  def testScore(self):
    self.assertEqual(self.metric.score, models.MetricScore.UNKNOWN)
    self.assertValueHasScore(0.5, models.MetricScore.POOR)
    self.assertValueHasScore(0.6, models.MetricScore.MODERATE)
    self.assertValueHasScore(0.7, models.MetricScore.MODERATE)
    self.assertValueHasScore(0.75, models.MetricScore.GOOD)
    self.assertValueHasScore(0.8, models.MetricScore.GOOD)
    self.assertValueHasScore(0.9, models.MetricScore.EXCELLENT)
    self.assertValueHasScore(0.95, models.MetricScore.EXCELLENT)

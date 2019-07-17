"""Tests for release-cherrypick-count metric."""

import datetime
import random
import uuid

from database import models
from metrics import release_cherrypick_count
from test import metric_test_case


class TestReleaseCherrypickCountMetric(metric_test_case.MetricTestCase):

  def new_metric_under_test(self):
    return release_cherrypick_count.ReleaseCherrypickCountMetric()

  def _release_n_days_ago_with_cherrypicks(self, days, cherrypicks):
    return models.Release(
        name='test release',
        published_at=datetime.datetime.now() - datetime.timedelta(days=days),
        cherrypicks=[
            models.Cherrypick(hash=uuid.uuid4().hex) for i in range(cherrypicks)
        ])

  def testRecompute(self):
    now = datetime.datetime.now()

    session = self.Session()
    session.add_all([
        self._release_n_days_ago_with_cherrypicks(95, 2),  # Older than 90 days.
        self._release_n_days_ago_with_cherrypicks(20, 3),
        self._release_n_days_ago_with_cherrypicks(10, 0),
        self._release_n_days_ago_with_cherrypicks(0, 1),
    ])
    session.commit()

    self.metric.recompute()
    self.assertLatestResultEquals(4)

  def testName(self):
    self.assertEqual(self.metric.name, 'ReleaseCherrypickCountMetric')

  def testLabel(self):
    self.assertEqual(self.metric.label, 'Release Cherrypick Count')

  def testScore(self):
    self.assertEqual(self.metric.score, models.MetricScore.UNKNOWN)
    self.assertValueHasScore(15, models.MetricScore.CRITICAL)
    self.assertValueHasScore(10, models.MetricScore.POOR)
    self.assertValueHasScore(7, models.MetricScore.POOR)
    self.assertValueHasScore(5, models.MetricScore.MODERATE)
    self.assertValueHasScore(4, models.MetricScore.MODERATE)
    self.assertValueHasScore(3, models.MetricScore.GOOD)
    self.assertValueHasScore(2, models.MetricScore.GOOD)
    self.assertValueHasScore(1, models.MetricScore.EXCELLENT)
    self.assertValueHasScore(0, models.MetricScore.EXCELLENT)

  def testFormattedResult(self):
    self.assertEqual(self.metric.formatted_result, '?')

    self.metric.result = models.MetricResult(
        name='ReleaseCherrypickCountMetric', value=1)
    self.assertEqual(self.metric.formatted_result, '1 PR/90d')

    self.metric.result = models.MetricResult(
        name='ReleaseCherrypickCountMetric', value=3)
    self.assertEqual(self.metric.formatted_result, '3 PRs/90d')


if __name__ == '__main__':
  unittest.main()

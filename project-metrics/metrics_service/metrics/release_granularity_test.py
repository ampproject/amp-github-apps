"""Tests for release-granularity metric."""

import datetime
import random
import uuid

from database import models
from metrics import release_granularity
from test import metric_test_case


class TestReleaseGranularityMetric(metric_test_case.MetricTestCase):

  def new_metric_under_test(self):
    return release_granularity.ReleaseGranularityMetric()

  def _release_n_days_ago(self, days):
    return models.Release(
        name='test release',
        published_at=datetime.datetime.now() - datetime.timedelta(days=days))

  def _commit_n_days_ago(self, days):
    return models.Commit(
        hash=uuid.uuid4().hex,
        committed_at=datetime.datetime.now() - datetime.timedelta(days=days))

  def testRecompute(self):
    now = datetime.datetime.now()

    session = self.Session()
    session.add_all([
        self._release_n_days_ago(100),
        self._release_n_days_ago(80),
        self._release_n_days_ago(40),
        self._release_n_days_ago(10),
    ])
    session.commit()
    session.add_all([
        self._commit_n_days_ago(95),  # Older than 90 days.
        self._commit_n_days_ago(85),  # Older than 1st release in time window.
        self._commit_n_days_ago(75),
        self._commit_n_days_ago(50),
        self._commit_n_days_ago(25),
        self._commit_n_days_ago(20),
        self._commit_n_days_ago(5),  # Newer than latest release.
    ])
    session.commit()

    self.metric.recompute()
    # value = 4 / (3 - 1)
    self.assertLatestResultEquals(2)

  def testRecomputeFewBuilds(self):
    session = self.Session()
    session.add(
        models.Release(name='test', published_at=datetime.datetime.now()))
    session.commit()
    with self.assertRaisesRegex(
        ValueError, 'Not enough releases to determine a range of commits.'):
      self.metric.recompute()

  def testName(self):
    self.assertEqual(self.metric.name, 'ReleaseGranularityMetric')

  def testLabel(self):
    self.assertEqual(self.metric.label, 'Release Granularity')

  def testScore(self):
    self.assertEqual(self.metric.score, models.MetricScore.UNKNOWN)
    self.assertValueHasScore(1500, models.MetricScore.CRITICAL)
    self.assertValueHasScore(1000, models.MetricScore.POOR)
    self.assertValueHasScore(750, models.MetricScore.POOR)
    self.assertValueHasScore(500, models.MetricScore.MODERATE)
    self.assertValueHasScore(250, models.MetricScore.MODERATE)
    self.assertValueHasScore(100, models.MetricScore.GOOD)
    self.assertValueHasScore(50, models.MetricScore.GOOD)
    self.assertValueHasScore(10, models.MetricScore.EXCELLENT)
    self.assertValueHasScore(5, models.MetricScore.EXCELLENT)

  def testFormattedResult(self):
    self.assertEqual(self.metric.formatted_result, '?')

    self.metric.result = models.MetricResult(
        name='ReleaseGranularityMetric', value=15.6)
    self.assertEqual(self.metric.formatted_result, '16 c/r')


if __name__ == '__main__':
  unittest.main()

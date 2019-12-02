"""Tests for cherrypick-issue-count metric."""

import datetime
import random
import uuid

from database import models
from metrics import cherrypick_issue_count
from test import metric_test_case


class TestCherrypickIssueCountMetric(metric_test_case.MetricTestCase):

  def new_metric_under_test(self):
    return cherrypick_issue_count.CherrypickIssueCountMetric()

  def _cherrypick_issue_n_days_ago(self, number, days):
    return models.CherrypickIssue(
        number=number,
        created_at=datetime.datetime.now() - datetime.timedelta(days=days))

  def testRecompute(self):
    now = datetime.datetime.now()

    session = self.Session()
    session.add_all([
        self._cherrypick_issue_n_days_ago(12, 95),  # Older than 90 days.
        self._cherrypick_issue_n_days_ago(13, 75),
        self._cherrypick_issue_n_days_ago(14, 55),
        self._cherrypick_issue_n_days_ago(15, 45),
        self._cherrypick_issue_n_days_ago(16, 35),
        self._cherrypick_issue_n_days_ago(17, 25),
        self._cherrypick_issue_n_days_ago(18, 15),
        self._cherrypick_issue_n_days_ago(19, 5),
    ])
    session.commit()

    self.metric.recompute()
    self.assertLatestResultEquals(7)

  def testName(self):
    self.assertEqual(self.metric.name, 'CherrypickIssueCountMetric')

  def testLabel(self):
    self.assertEqual(self.metric.label, 'Cherrypick Issue Count')

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
        name='CherrypickIssueCountMetric', value=1)
    self.assertEqual(self.metric.formatted_result, '1 CP/90d')

    self.metric.result = models.MetricResult(
        name='CherrypickIssueCountMetric', value=3)
    self.assertEqual(self.metric.formatted_result, '3 CPs/90d')


if __name__ == '__main__':
  unittest.main()

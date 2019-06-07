"""Base class for testing metrics."""

import abc
import unittest
from unittest import mock
import sqlalchemy
from sqlalchemy import orm

from database import models
from metrics import base


class MetricTestCase(unittest.TestCase):

  __metaclass__ = abc.ABCMeta

  @classmethod
  def setUpClass(cls):
    super(MetricTestCase, cls).setUpClass()

    cls.engine = sqlalchemy.create_engine('sqlite:///:memory:', echo=True)
    cls.Session = orm.scoped_session(orm.sessionmaker(bind=cls.engine))

    cls.mock_get_engine = mock.patch(
        'database.db.get_engine', return_value=cls.engine).start()
    cls.mock_session = mock.patch(
        'database.db.Session', return_value=cls.Session).start()

    models.Base.metadata.create_all(cls.engine)

  @classmethod
  def tearDownClass(cls):
    super(MetricTestCase, cls).tearDownClass()

    cls.mock_get_engine.stop()
    cls.mock_session.stop()

    models.Base.metadata.drop_all(cls.engine)

  def setUp(self):
    super(MetricTestCase, self).setUp()
    self.metric = self.new_metric_under_test()

  def tearDown(self):
    super(MetricTestCase, self).tearDown()
    session = self.Session()
    session.query(models.MetricResult).delete()
    session.commit()

  @abc.abstractmethod
  def new_metric_under_test(self):
    """Returns a new instance of the metric class under test."""
    pass

  def assertLatestResultEquals(self, result_value):
    latest_result = base.Metric.get_latest()[self.metric.name].result
    self.assertEqual(latest_result.value, result_value)

  def assertScores(self, expected_result_scores):
    """Checks that result values are scored as expected.

    Args:
      expected_result_scores: list of (result_value, expected_score) pairs.
    """
    for value, score in expected_result_scores:
      with self.subTest(
          'Result value %.3g gets score %s' % (value, score),
          value=value,
          score=score):
        self.metric.result = models.MetricResult(
            name=self.metric.name, value=value)
        self.assertEqual(self.metric.score, score)

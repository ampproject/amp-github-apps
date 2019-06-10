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

  def setUp(self):
    super(MetricTestCase, self).setUp()

    self.metric = self.new_metric_under_test()
    self.engine = sqlalchemy.create_engine('sqlite:///:memory:', echo=True)
    self.Session = orm.scoped_session(orm.sessionmaker(bind=self.engine))
    models.Base.metadata.create_all(self.engine)

    self.mock_get_engine = mock.patch(
        'database.db.get_engine', return_value=self.engine).start()
    self.mock_session = mock.patch(
        'database.db.Session', return_value=self.Session).start()

  def tearDown(self):
    super(MetricTestCase, self).tearDown()
    models.Base.metadata.drop_all(self.engine)
    self.mock_get_engine.stop()
    self.mock_session.stop()

  @abc.abstractmethod
  def new_metric_under_test(self):
    """Returns a new instance of the metric class under test."""
    pass

  def assertLatestResultEquals(self, result_value):
    latest_result = base.Metric.get_latest()[self.metric.name].result
    self.assertEqual(latest_result.value, result_value)

  def assertValueHasScore(self, result_value, score):
    """Checks that result values are scored as expected."""
    self.metric.result = models.MetricResult(
        name=self.metric.name, value=result_value)
    self.assertEqual(self.metric.score, score)

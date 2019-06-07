"""Tests for database models."""

from absl import flags
from absl.testing import flagsaver
import datetime
import unittest
from unittest import mock
import sqlalchemy
from sqlalchemy import orm
import sys

from database import init_db
from database import models

FLAGS = flags.FLAGS
FLAGS(sys.argv)


class TestBuild(unittest.TestCase):

  @classmethod
  def setUpClass(cls):
    super(TestBuild, cls).setUpClass()

    engine = sqlalchemy.create_engine('sqlite:///:memory:', echo=True)
    init_db.init_db(engine)
    cls.Session = orm.scoped_session(orm.sessionmaker(bind=engine))

    cls.FAKE_NOW = datetime.datetime(2019, 6, 1)
    cls.FAKE_90_DAYS_AGO = cls.FAKE_NOW - datetime.timedelta(days=90)

  def setUp(self):
    super(TestBuild, self).setUp()

    self.session = self.Session()
    self.old_build = models.Build(
        number=1,
        started_at=self.FAKE_90_DAYS_AGO - datetime.timedelta(days=1),
        duration=1000,
        state=models.TravisState.PASSED)
    self.new_build = models.Build(
        number=2,
        started_at=self.FAKE_NOW - datetime.timedelta(days=1),
        duration=1000,
        state=models.TravisState.PASSED)
    self.session.add_all([self.old_build, self.new_build])

    mock.patch.object(datetime.datetime, 'now', return_value=self.FAKE_NOW)

  def tearDown(self):
    super(TestBuild, self).tearDown()

    mock.patch.stopall()
    self.session.query(models.Build).delete()
    self.session.commit()

  def testLast90Days(self):
    self.assertEqual(
        models.Build.last_90_days(self.session).all(), [self.new_build])

  def testLast90DaysNegated(self):
    self.assertEqual(
        models.Build.last_90_days(self.session, negate=True).all(),
        [self.old_build])


if __name__ == '__main__':
  unittest.main()

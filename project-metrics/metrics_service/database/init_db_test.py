"""Tests for database initialization."""

from absl import flags
from absl.testing import flagsaver
import unittest
from unittest import mock
import sqlalchemy
import sys

from database import init_db
from database import models

FLAGS = flags.FLAGS
FLAGS(sys.argv)


class TestInitDb(unittest.TestCase):

  def setUp(self):
    super(TestInitDb, self).setUp()
    self.engine = sqlalchemy.create_engine('sqlite:///:memory:', echo=True)

  def testMainNoDropFlag(self):
    init_db.init_db(self.engine)
    self.assertCountEqual(self.engine.table_names(),
                          ['metric_results', 'travis_builds'])

  @mock.patch.object(models.Base, 'metadata', autospec=True)
  @flagsaver.flagsaver(drop_schema=True)
  def testMainWithDropFlag(self, metadata):
    init_db.init_db(self.engine)
    metadata.create_all.assert_called_once_with(self.engine)
    metadata.drop_all.assert_called_once_with(self.engine)


if __name__ == '__main__':
  unittest.main()

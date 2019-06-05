"""Defines ORM models for interactions with the DB."""

from typing import Text
import datetime
import enum
import sqlalchemy
from sqlalchemy.ext import declarative

Base = declarative.declarative_base()


class MetricScore(enum.Enum):
  """The computed score of a metric."""
  UNKNOWN = 0
  POOR = 1
  MODERATE = 2
  GOOD = 3
  EXCELLENT = 4


class MetricResult(Base):
  """A score computed for a single metric."""

  __tablename__ = 'metric_results'
  # Composite index on computed_at then name, since queries will be ordering by
  # timestamp then filtering or DISTINCT-ing by name to always fetch the latest
  # row for each metric.
  __table_args__ = (sqlalchemy.Index('computed_at__name', 'computed_at',
                                     'name'),)

  id = sqlalchemy.Column(sqlalchemy.Integer, primary_key=True)  # type: int
  name = sqlalchemy.Column(sqlalchemy.Unicode(255))  # type: Text
  # Actual "result value" used to determine the score. This may be a number of
  # PRs, a percentage value, latency in minutes, etc. The metric itself shall
  # be responsible for interpreting the value, determining the corresponding
  # score, and rendering the result.
  value = sqlalchemy.Column(sqlalchemy.Float)  # type: float
  computed_at = sqlalchemy.Column(
      sqlalchemy.DateTime,
      default=datetime.datetime.utcnow)  # type: datetime.datetime

  def __repr__(self) -> Text:
    return "<Metric(name='%s', value='%.3g', computed_at='%s')>" % (
        self.name, self.value, self.computed_at)


class TravisState(enum.Enum):
  """A state of a Travis build or job.

  Based on https://github.com/travis-ci/travis-api/blob/master/lib/travis/model/job/test.rb#L21
  """
  CREATED = 0
  QUEUED = 1
  PENDING = 2
  PASSED = 3
  FAILED = 4
  ERRORED = 5
  CANCELLED = 6


class Build(Base):
  """A Travis build."""

  __tablename__ = 'travis_builds'

  id = sqlalchemy.Column(sqlalchemy.Integer, primary_key=True)
  number = sqlalchemy.Column(sqlalchemy.Integer)
  duration = sqlalchemy.Column(sqlalchemy.Integer)
  state = sqlalchemy.Column(sqlalchemy.Enum(TravisState))
  started_at = sqlalchemy.Column(sqlalchemy.DateTime)

  def __repr__(self) -> Text:
    return "<Build(number=%d, duration=%d, state=%s, started_at=%s)>" % (
        self.number, self.duration, self.state.name, self.started_at)

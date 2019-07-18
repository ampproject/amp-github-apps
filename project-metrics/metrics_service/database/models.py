"""Defines ORM models for interactions with the DB."""

from typing import Text
import datetime
import enum
import sqlalchemy
from sqlalchemy.ext import declarative

Base = declarative.declarative_base()


def _is_last_n_days(
    timestamp_column: sqlalchemy.orm.attributes.InstrumentedAttribute,
    days: int) -> sqlalchemy.sql.elements.BinaryExpression:
  """Produces the filter expression for the last N days of a model.

   Args:
    timestamp_column: model column to filter by.
    days: number of days back to filter by.

   Returns:
    A binary expression which can be passed to a query's `.filter()` method.
  """
  n_days_ago = datetime.datetime.now() - datetime.timedelta(days=days)
  return timestamp_column >= n_days_ago


class MetricScore(enum.Enum):
  """The computed score of a metric."""
  UNKNOWN = 0
  CRITICAL = 1
  POOR = 2
  MODERATE = 3
  GOOD = 4
  EXCELLENT = 5


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

  Based on
  https://github.com/travis-ci/travis-api/blob/master/lib/travis/model/build/states.rb#L25
  """
  CREATED = 'created'
  RECEIVED = 'received'
  STARTED = 'started'
  PASSED = 'passed'
  FAILED = 'failed'
  ERRORED = 'errored'
  CANCELED = 'canceled'


class Build(Base):
  """A Travis build."""

  __tablename__ = 'travis_builds'

  @classmethod
  def in_commit_order(cls, base_query):
    """Orders builds by commit time."""
    return base_query.join(Commit, Commit.hash == cls.commit_hash).order_by(
        Commit.committed_at.desc())

  @classmethod
  def is_last_90_days(cls):
    return _is_last_n_days(timestamp_column=cls.started_at, days=90)

  @classmethod
  def last_90_days(cls, base_query, negate=False) -> sqlalchemy.orm.query.Query:
    """To query builds younger than 90 days.

     Args:
      base_query: Query to filter.
      negate: if true, returns builds older than 90 days

     Returns:
      Build query with filter applied.
    """
    filter_test = cls.is_last_90_days()
    if negate:
      filter_test = sqlalchemy.not_(filter_test)
    return base_query.filter(filter_test)

  @classmethod
  def scope(cls, session):
    """Default scoped query.

    Args:
      session: SQL Alchemy database session.

    Returns:
      The last build from each PR from the last 90 days in commit order.
    """
    return cls.in_commit_order(cls.last_90_days(session.query(cls)))

  id = sqlalchemy.Column(sqlalchemy.Integer, primary_key=True)
  number = sqlalchemy.Column(sqlalchemy.Integer)
  duration = sqlalchemy.Column(sqlalchemy.Integer)
  state = sqlalchemy.Column(sqlalchemy.Enum(TravisState))
  started_at = sqlalchemy.Column(sqlalchemy.DateTime)
  commit_hash = sqlalchemy.Column(
      sqlalchemy.Unicode(40), sqlalchemy.ForeignKey('commits.hash'))
  commit = sqlalchemy.orm.relationship('Commit', backref='builds')

  def __repr__(self) -> Text:
    return ('<Build(number=%d, duration=%ss, state=%s, started_at=%s, '
            'commit_hash=%s)>') % (self.number, self.duration or
                                   '?', self.state.name, self.started_at,
                                   self.commit_hash)


class PullRequestStatus(enum.Enum):
  """A status state for a pull request.

  See https://developer.github.com/v4/enum/statusstate/
  """
  UNKNOWN = 'unknown'
  ERROR = 'error'
  EXPECTED = 'expected'
  FAILURE = 'failure'
  PENDING = 'pending'
  SUCCESS = 'success'


class Commit(Base):
  """A commit on the master branch of the repo."""

  __tablename__ = 'commits'

  hash = sqlalchemy.Column(sqlalchemy.Unicode(40), primary_key=True)
  committed_at = sqlalchemy.Column(sqlalchemy.DateTime)
  pull_request = sqlalchemy.Column(sqlalchemy.Integer, unique=True)
  pull_request_status = sqlalchemy.Column(sqlalchemy.Enum(PullRequestStatus))

  def __repr__(self) -> Text:
    return ('<Commit(hash=%s, committed_at=%s, pull_request_status=%s, '
            'pull_request=%d)>') % (self.hash, self.committed_at,
                                    self.pull_request_status.name,
                                    self.pull_request)


class Release(Base):
  """A production release cut."""

  __tablename__ = 'releases'

  id = sqlalchemy.Column(sqlalchemy.Integer, primary_key=True)
  published_at = sqlalchemy.Column(sqlalchemy.DateTime)
  name = sqlalchemy.Column(sqlalchemy.Unicode(255))

  @classmethod
  def is_last_90_days(cls):
    return _is_last_n_days(timestamp_column=cls.published_at, days=90)

  def __repr__(self) -> Text:
    return ('<Release(id=%s, published_at=%s, name=%s)>') % (
        self.id, self.published_at, self.name)


class Cherrypick(Base):
  """A cherry-picked commit."""

  __tablename__ = 'cherrypicks'

  hash = sqlalchemy.Column(sqlalchemy.Unicode(40), primary_key=True)
  release_id = sqlalchemy.Column(sqlalchemy.Integer,
                                 sqlalchemy.ForeignKey('releases.id'))
  release = sqlalchemy.orm.relationship('Release', backref='cherrypicks')

  def __repr__(self) -> Text:
    return '<Cherrypick(hash=%s, release_id=%s)>' % self.hash, self.release_id

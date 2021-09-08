"""Defines ORM models for interactions with the DB."""

from typing import Optional, Text
import datetime
import enum
import sqlalchemy
from sqlalchemy.ext import declarative

Base = declarative.declarative_base()


def _is_last_n_days(
    timestamp_column: sqlalchemy.orm.attributes.InstrumentedAttribute,
    days: int,
    base_time: Optional[datetime.datetime] = None
) -> sqlalchemy.sql.elements.BinaryExpression:
  """Produces the filter expression for the last N days of a model.

   Args:
    timestamp_column: model column to filter by.
    days: number of days back to filter by.
    base_time: start date to look back from (default datetime.datetime.now())

   Returns:
    A binary expression which can be passed to a query's `.filter()` method.
  """
  if base_time is None:
    base_time = datetime.datetime.now()
  n_days_ago = base_time - datetime.timedelta(days=days)
  return (timestamp_column >= n_days_ago) & (timestamp_column <= base_time)


class CircleCiReportingWindow(enum.Enum):
  """The reporting windows supported by the CircleCI insights api"""
  LAST_24_HOURS = 'last-24-hours'
  LAST_7_DAYS = 'last-7-days'
  LAST_30_DAYS = 'last-30-days'
  LAST_60_DAYS = 'last-60-days'
  LAST_90_DAYS = 'last-90-days'


class CircleCiWorkflowDurationMetrics():
  min: int
  mean: int
  median: int
  p95: int
  max: int
  standard_deviation: float
  total_duration: int

  @staticmethod
  def from_json(dict):
    metrics = CircleCiWorkflowDurationMetrics()
    metrics.min = dict['min']
    metrics.mean = dict['mean']
    metrics.median = dict['median']
    metrics.p95 = dict['p95']
    metrics.max = dict['max']
    metrics.standard_deviation = dict['standard_deviation']
    metrics.total_duration = dict['total_duration']
    return metrics


class CircleCiWorkflowMetrics():
  duration_metrics: CircleCiWorkflowDurationMetrics
  total_runs: int
  successful_runs: int
  mttr: int
  total_credits_used: int
  failed_runs: int
  median_credits_used: int
  success_rate: float
  total_recoveries: int
  throughput: float

  @staticmethod
  def from_json(stats):
    metrics = CircleCiWorkflowMetrics()
    metrics.duration_metrics = CircleCiWorkflowDurationMetrics.from_json(stats['duration_metrics'])
    metrics.total_runs = stats['total_runs']
    metrics.successful_runs = stats['successful_runs']
    metrics.mttr = stats['mttr']
    metrics.total_credits_used = stats['total_credits_used']
    metrics.failed_runs = stats['failed_runs']
    metrics.median_credits_used = stats['median_credits_used']
    metrics.success_rate = stats['success_rate']
    metrics.total_recoveries = stats['total_recoveries']
    metrics.throughput = stats['throughput']
    return metrics


class CircleCiWorkflowStats():
  project_id: str
  name: str
  metrics: CircleCiWorkflowMetrics
  window_start: datetime.datetime
  window_end: datetime.datetime

  @staticmethod
  def from_json(raw_stats):
    stats = CircleCiWorkflowStats
    stats.project_id = raw_stats['project_id']
    stats.name = raw_stats['name']
    stats.metrics = CircleCiWorkflowMetrics.from_json(raw_stats['metrics'])
    date_format = '%Y-%m-%dT%H:%M:%S.%fZ'
    stats.window_start = datetime.datetime.strptime(raw_stats['window_start'], date_format)
    stats.window_end = datetime.datetime.strptime(raw_stats['window_end'], date_format)
    return stats

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
  """A commit on the main branch of the repo."""

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
  scraped_cherrypicks = sqlalchemy.Column(sqlalchemy.Boolean, default=False)

  @classmethod
  def is_last_90_days(cls, base_time=None):
    return _is_last_n_days(
        timestamp_column=cls.published_at, days=90, base_time=base_time)

  def __repr__(self) -> Text:
    return ('<Release(id=%s, published_at=%s, name=%s)>') % (
        self.id, self.published_at, self.name)


class Cherrypick(Base):
  """A cherry-picked commit.
  
  DEPRECATED: There is a better way to count cherry-picks now using issues. Use
  CherrypickIssue instead. Leave this here so historical data can be handled.
  """

  __tablename__ = 'cherrypicks'

  hash = sqlalchemy.Column(sqlalchemy.Unicode(40), primary_key=True)
  release_id = sqlalchemy.Column(sqlalchemy.Integer,
                                 sqlalchemy.ForeignKey('releases.id'))
  release = sqlalchemy.orm.relationship('Release', backref='cherrypicks')

  def __repr__(self) -> Text:
    return '<Cherrypick(hash=%s, release_id=%s)>' % (self.hash, self.release_id)


class CherrypickIssue(Base):
  """A cherry-pick tracking issue."""

  __tablename__ = 'cherrypick_issues'

  number = sqlalchemy.Column(sqlalchemy.Integer, primary_key=True)
  created_at = sqlalchemy.Column(sqlalchemy.DateTime)

  @classmethod
  def is_last_90_days(cls, base_time=None):
    return _is_last_n_days(
        timestamp_column=cls.created_at, days=90, base_time=base_time)

  @classmethod
  def scope(cls, session, base_time=None):
    """Default scoped query.

    Args:
      session: SQL Alchemy database session.

    Returns:
      The last 90 days of cherry-pick issues from newest to oldest.
    """
    return session.query(cls).order_by(cls.created_at.desc()).filter(
        cls.is_last_90_days(base_time))

  def __repr__(self) -> Text:
    return '<CherrypickIssue(number=%d, created_at=%s)>' % (self.number,
                                                            self.created_at)

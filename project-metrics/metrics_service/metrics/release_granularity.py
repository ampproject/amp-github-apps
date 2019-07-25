"""Release Granularity metric."""

import logging
import sqlalchemy
from typing import Text, Dict

from database import db
from database import models
from metrics import base


class ReleaseGranularityMetric(base.Metric):
  """A metric tracking the average number of commits between releases."""

  UNIT = 'commits/release'

  def _format_value(self, avg_commits: float) -> Text:
    return '%d c/r' % round(avg_commits)

  def _score_value(self, avg_commits: float) -> models.MetricScore:
    if avg_commits > 1000:
      return models.MetricScore.CRITICAL
    elif avg_commits > 500:
      return models.MetricScore.POOR
    elif avg_commits > 100:
      return models.MetricScore.MODERATE
    elif avg_commits > 10:
      return models.MetricScore.GOOD
    else:
      return models.MetricScore.EXCELLENT

  def _compute_value(self) -> float:
    """Computes the average number of commits per release over the last 90 days.

    Considering only production releases, we can just count all commits
    committed between the first and last release of the 90-day window, and
    divide be the number of releases (excluding the last one).

    Raises:
      ValueError: if less than two releases exist.

    Returns:
      The average number of commits per release.
    """
    logging.info('Counting commits per release')
    session = db.Session()
    releases = session.query(models.Release).filter(
        models.Release.is_last_90_days(base_time=self.base_time)).order_by(
            models.Release.published_at.desc()).all()
    release_count = len(releases)

    if release_count < 2:
      raise ValueError('Not enough releases to determine a range of commits.')

    last_release_date = releases[0].published_at
    first_release_date = releases[-1].published_at

    commits_count = session.query(models.Commit).filter(
        models.Commit.committed_at.between(first_release_date,
                                           last_release_date)).count()
    session.close()

    # Subtract one from release count since commits from the last release are
    # not included.
    return commits_count / (release_count - 1)


base.Metric.register(ReleaseGranularityMetric)

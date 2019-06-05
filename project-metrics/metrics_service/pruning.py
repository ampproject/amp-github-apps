"""Module to provide pruning for metric data tables."""

import logging

import db_engine
import models


def prune() -> None:
  """Prune rows older than 90 days."""
  logging.info('Pruning builds older than 90 days.')
  session = db_engine.get_session()
  deleted = models.Build.last_90_days(session, negate=True).delete()
  logging.info('Removed %d old builds', deleted)

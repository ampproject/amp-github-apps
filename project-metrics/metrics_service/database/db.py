"""Provides the database engine for the CloudSQL instance."""

import sqlalchemy
from sqlalchemy import orm
import logging
import functools
import env


@functools.lru_cache()
def get_engine() -> sqlalchemy.engine.Engine:
  query = {
      'charset': 'utf8mb4',
  }
  try:
    query['unix_socket'] = '%s/%s' % (env.get('CLOUD_SQL_SOCKET'), env.get('CLOUD_SQL_INSTANCE_NAME'))
  except KeyError:
    logging.info('Using local database')

  return sqlalchemy.create_engine(
      sqlalchemy.engine.url.URL(
          drivername=env.get('SQL_DRIVER'),
          username=env.get('DB_USER'),
          password=env.get('DB_PASS'),
          database=env.get('DB_NAME'),
          query=query),
      echo=False)


Session = orm.scoped_session(orm.sessionmaker(bind=get_engine()))

"""Provides the database engine for the CloudSQL instance."""

import sqlalchemy
from sqlalchemy import orm
import functools
import env


@functools.lru_cache()
def get_engine() -> sqlalchemy.engine.Engine:
  return sqlalchemy.create_engine(
      sqlalchemy.engine.url.URL(
          drivername=env.get('SQL_DRIVER'),
          username=env.get('DB_USER'),
          password=env.get('DB_PASS'),
          database=env.get('DB_NAME'),
          query={
              'unix_socket':
                  '%s/%s' % (env.get('CLOUD_SQL_SOCKET'),
                             env.get('CLOUD_SQL_INSTANCE_NAME')),
              'charset':
                  'utf8mb4',
          }),
      echo=True)


Session = orm.scoped_session(orm.sessionmaker(bind=get_engine()))

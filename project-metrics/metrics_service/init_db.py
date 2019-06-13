"""Script to initialize the audit and metadata database."""

import logging
from absl import app
from absl import flags
import sqlalchemy

from database import db
# This import is required to ensure that subclasses of sqlalchemy.Base register
# themselves in its metadata. This is how the create_all and drop_all methods
# can identify which tables need to be created/dropped based on the defined ORM
# models.
from database import models  # pylint: disable=unused-import

FLAGS = flags.FLAGS
flags.DEFINE_boolean('drop_schema', False, 'Drop all tables before creating.')


def init_db(engine):
  if FLAGS.drop_schema:
    logging.warning('Dropping all tables on database `%s`', engine.url.database)
    models.Base.metadata.drop_all(engine)

  logging.info('Creating all tables on database `%s`', engine.url.database)
  models.Base.metadata.create_all(engine)


def main(argv):
  del argv  # Unused.
  init_db(db.get_engine())


if __name__ == '__main__':
  app.run(main)

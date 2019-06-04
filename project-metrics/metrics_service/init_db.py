"""Script to initialize the audit and metadata database."""

import logging
from absl import app
from absl import flags
import sqlalchemy

import db_engine
# This import is required to ensure that subclasses of sqlalchemy.Base register
# themselves in its metadata. This is how the create_all and drop_all methods
# can identify which tables need to be created/dropped based on the defined ORM
# models.
import models  # pylint: disable=unused-import


FLAGS = flags.FLAGS
flags.DEFINE_boolean('drop_schema', False, 'Drop all tables before creating.')


def main(argv):
  del argv  # Unused.

  if FLAGS.drop_schema:
    logging.warning('Dropping all tables on database `%s`',
                    db_engine.get_engine().url.database)
    models.Base.metadata.drop_all(db_engine.get_engine())

  logging.info('Creating all tables on database `%s`',
               db_engine.get_engine().url.database)
  models.Base.metadata.create_all(db_engine.get_engine())


if __name__ == '__main__':
  app.run(main)

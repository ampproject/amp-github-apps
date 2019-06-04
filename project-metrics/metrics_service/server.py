#!/usr/bin/env python
"""Entry point to run app.

Used to launch the REST and Cron servers.
"""

import os
from flask import Flask

app = Flask(__name__)


@app.route('/')
def hello():
  return 'Hello world!'


if __name__ == '__main__':
  app.run(port=os.environ.get('PORT', 8080), debug=True)

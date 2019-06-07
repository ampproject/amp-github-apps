#!/usr/bin/env python
"""Entry point to run app.

Used to launch the REST and Cron servers.
"""

import flask
from flask_api import status
import os

from metrics import base

app = flask.Flask(__name__)


@app.route('/_cron/recompute/<metric_cls_name>')
def recompute(metric_cls_name):
  # This header is added to cron requests by GAE, and stripped from any external
  # requests. See https://cloud.google.com/appengine/docs/standard/python3/scheduling-jobs-with-cron-yaml#validating_cron_requests
  if not flask.request.headers.get('X-Appengine-Cron'):
    return 'Attempted to access internal endpoint.', status.HTTP_403_FORBIDDEN
  try:
    metric_cls = base.Metric.active_metrics[metric_cls_name]
  except KeyError:
    return ('No active metric found for %s.' % metric_cls_name,
            status.HTTP_404_NOT_FOUND)
  metric_cls().recompute()
  return 'Successfully recomputed %s.' % metric_cls_name, status.HTTP_200_OK


@app.route('/api/metrics')
def list_metrics():
  try:
    results = base.Metric.get_latest().values()
  except Exception as error:
    return flask.jsonify({'error': error.message}, status.HTTP_500_SERVER_ERROR)

  return flask.jsonify({'metrics': [metric.serializable for metric in results]},
                       status.HTTP_200_OK)


if __name__ == '__main__':
  app.run(port=os.environ.get('PORT', 8080), debug=True)

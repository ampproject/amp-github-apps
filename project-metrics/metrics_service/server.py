#!/usr/bin/env python
"""Entry point to run app.

Used to launch the REST and Cron servers.
"""

import logging
import os
import flask
from flask_api import status

from metrics import base
from database import commit_scraper
from database import build_scraper

logging.getLogger().setLevel(logging.INFO)
app = flask.Flask(__name__)

scrapers = {
    'commits': commit_scraper.CommitScraper(),
    'builds': build_scraper.BuildScraper(),
}


@app.route('/_cron/scrape/<scrape_target>')
def scrape_latest(scrape_target):
  # This header is added to cron requests by GAE, and stripped from any external
  # requests. See https://cloud.google.com/appengine/docs/standard/python3/scheduling-jobs-with-cron-yaml#validating_cron_requests
  if not flask.request.headers.get('X-Appengine-Cron'):
    return 'Attempted to access internal endpoint.', status.HTTP_403_FORBIDDEN
  scrapers[scrape_target].scrape_since_latest()
  return 'Successfully scraped latest %s.' % scrape_target, status.HTTP_200_OK


@app.route('/_cron/recompute/<metric_cls_name>')
def recompute(metric_cls_name):
  # This header is added to cron requests by GAE, and stripped from any external
  # requests. See https://cloud.google.com/appengine/docs/standard/python3/scheduling-jobs-with-cron-yaml#validating_cron_requests
  if not flask.request.headers.get('X-Appengine-Cron'):
    return 'Attempted to access internal endpoint.', status.HTTP_403_FORBIDDEN
  try:
    metric_cls = base.Metric.get_metric(metric_cls_name)
  except KeyError:
    logging.error('No active metric found for %s.', metric_cls_name)
    return ('No active metric found for %s.' % metric_cls_name,
            status.HTTP_404_NOT_FOUND)
  logging.info('Recomputing %s.', metric_cls_name)
  try:
    metric_cls().recompute()
  except Exception as error:
    logging.error(error)
    return str(error), status.HTTP_500_SERVER_ERROR
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

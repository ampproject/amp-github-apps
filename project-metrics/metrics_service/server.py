#!/usr/bin/env python
"""Entry point to run app.

Used to launch the REST and Cron servers.
"""

import logging
import io
import os
import flask
from flask_api import status
from google.cloud import storage
from typing import Text

logging.getLogger().setLevel(logging.INFO)

from metrics import base
import env
import metric_plot
import scrapers

app = flask.Flask(__name__)

HISTORY_DAYS = 180
BADGE_COLORS = [
    '#EEEEEE',
    'indianred',
    'orange',
    'yellow',
    'green',
    'forestgreen',
]


def _get_cloud_blob(filename: Text) -> storage.Blob:
  client = storage.Client()
  bucket = client.get_bucket(env.get('CLOUD_STORAGE_BUCKET'))
  return storage.Blob(filename, bucket)


def _save_to_cloud(data: bytes, filename: Text, content_type: Text):
  """Saves data to a Google Cloud Storage blob.

  Args:
    data: byte-string to store
    filename: key under which to store the file in the Cloud Storage bucket
    content_type: content type of the file
  """
  _get_cloud_blob(filename).upload_from_string(data, content_type=content_type)


def _get_from_cloud(filename: Text) -> bytes:
  """Download data from a Google Cloud Storage blob.

  Args:
    filename: key under which the file in the Cloud Storage bucket is stored

  Returns:
    The blob data as a byte-string.
  """
  return _get_cloud_blob(filename).download_as_string()


@app.route('/_cron/scrape/<scrape_target>')
def scrape_latest(scrape_target: Text):
  # This header is added to cron requests by GAE, and stripped from any external
  # requests. See
  # https://cloud.google.com/appengine/docs/standard/python3/scheduling-jobs-with-cron-yaml#validating_cron_requests
  if not flask.request.headers.get('X-Appengine-Cron'):
    return 'Attempted to access internal endpoint.', status.HTTP_403_FORBIDDEN
  scrapers.scrape(scrape_target)
  return 'Successfully scraped latest %s.' % scrape_target, status.HTTP_200_OK


@app.route('/_cron/recompute/<metric_cls_name>')
def recompute(metric_cls_name: Text):
  # This header is added to cron requests by GAE, and stripped from any external
  # requests. See
  # https://cloud.google.com/appengine/docs/standard/python3/scheduling-jobs-with-cron-yaml#validating_cron_requests
  if not flask.request.headers.get('X-Appengine-Cron'):
    return 'Attempted to access internal endpoint.', status.HTTP_403_FORBIDDEN
  try:
    metric_cls = base.Metric.get_metric(metric_cls_name)
  except KeyError:
    logging.error('No active metric found for %s.', metric_cls_name)
    return ('No active metric found for %s.' % metric_cls_name,
            status.HTTP_404_NOT_FOUND)
  logging.info('Recomputing %s.', metric_cls_name)
  metric_cls().recompute()
  return 'Successfully recomputed %s.' % metric_cls_name, status.HTTP_200_OK


@app.route(
    '/_cron/plot_metric_history', defaults={'history_days': HISTORY_DAYS})
@app.route('/_cron/plot_metric_history/<history_days>')
def render_metric_history_plot(history_days: Text):
  # This header is added to cron requests by GAE, and stripped from any external
  # requests. See
  # https://cloud.google.com/appengine/docs/standard/python3/scheduling-jobs-with-cron-yaml#validating_cron_requests
  if not flask.request.headers.get('X-Appengine-Cron'):
    return 'Attempted to access internal endpoint.', status.HTTP_403_FORBIDDEN

  history_days = int(history_days)
  logging.info('Rendering metric history plots for last %d days', history_days)
  for metric_cls in base.Metric.get_active_metrics():
    metric = metric_cls()
    plotter = metric_plot.MetricHistoryPlotter(
        metric, history_days=history_days)
    plot_buffer = plotter.plot_metric_history()
    _save_to_cloud(plot_buffer.read(),
                   '%s-history-%dd.png' % (metric.name, history_days),
                   'image/png')

  return 'History plots updated.', status.HTTP_200_OK


@app.route('/api/metrics')
def list_metrics():
  try:
    results = base.Metric.get_latest().values()
  except Exception as error:
    return flask.jsonify({'error': error.message}), status.HTTP_500_SERVER_ERROR

  return flask.jsonify({'metrics': [metric.serializable for metric in results]
                       }), status.HTTP_200_OK


@app.route(
    '/api/plot/<metric_cls_name>.png', defaults={'history_days': HISTORY_DAYS})
@app.route('/api/plot/<history_days>/<metric_cls_name>.png')
def metric_history_plot(history_days: Text, metric_cls_name: Text):
  try:
    metric_cls = base.Metric.get_metric(metric_cls_name)
  except KeyError:
    logging.error('No active metric found for %s.', metric_cls_name)
    return ('No active metric found for %s.' %
            metric_cls_name), status.HTTP_404_NOT_FOUND

  history_days = int(history_days)
  plot_bytes = _get_from_cloud('%s-history-%dd.png' %
                               (metric_cls_name, history_days))
  return flask.send_file(io.BytesIO(plot_bytes), mimetype='image/png')


@app.route('/api/badge/<metric_cls_name>')
def metric_badge(metric_cls_name: Text):
  """Provides a response for sheilds.io to render a badge for GitHub.

  See https://shields.io/endpoint.
  """
  response = {
      'schemaVersion': 1,
      'color': 'lightgray',
      'label': metric_cls_name,
      'message': '?',
  }
  try:
    metric = base.Metric.get_latest()[metric_cls_name]
    response['color'] = BADGE_COLORS[metric.score.value]
    response['label'] = metric.label
    response['message'] = metric.formatted_result
  except KeyError:
    logging.error('No active metric found for %s.', metric_cls_name)
  finally:
    return flask.jsonify(response), status.HTTP_200_OK


@app.route('/')
def show_metrics():
  metrics = base.Metric.get_latest().values()
  return flask.render_template(
      'show_metrics.html', github_repo=env.get('GITHUB_REPO'), metrics=metrics)


@app.route('/history', defaults={'history_days': HISTORY_DAYS})
@app.route('/history/<history_days>')
def show_metric_history(history_days: Text):
  history_days = int(history_days)
  metric_names = [cls.__name__ for cls in base.Metric.get_active_metrics()]
  return flask.render_template(
      'show_metric_history.html',
      github_repo=env.get('GITHUB_REPO'),
      metric_names=metric_names,
      history_days=history_days)


if __name__ == '__main__':
  app.run(port=os.environ.get('PORT', 8080), debug=True)

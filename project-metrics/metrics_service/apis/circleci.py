"""Client for querying CircleCI API.

For an overview of the API https://circleci.com/docs/api/v2/
"""
import datetime
import json
from typing import Dict
from absl import logging
import requests
from database import db
from database import models

import env

CIRCLECI_API = 'https://circleci.com/api/v2'
VCS_STAB = 'github'
PROJECT = env.get('GITHUB_REPO')
INSIGHTS_API = '%s/insights/%s/%s' % (CIRCLECI_API, VCS_STAB, PROJECT)


class CircleCiError(Exception):
  def __init__(self, status_code: int, message: str):
    msg = 'CircleCI API Error status %d. Message: %s' % (status_code, message)
    super(CircleCiError, self).__init__(msg)


class CircleCiAPI(object):
  """Interface class for executing queries agains the CircleCI API."""
  def __init__(self, token = env.get('CIRCLECI_API_ACCESS_TOKEN')):
    self._token = token

  def _dict_to_params(self, params: Dict):
    param_string = '&'.join(['%s=%s' % (key, params[key]) for key in params.keys()])
    if len(param_string):
      return '?' + param_string
    return param_string

  def _fetch_get_workflow_stats(self, reporting_window = models.CircleReportingWindow.LAST_90_DAYS):
    params = {
      'reporting-window': reporting_window.value
    }
    endpoint = '%s/%s' % (INSIGHTS_API, 'workflows')
    print(endpoint + self._dict_to_params(params))
    response = requests.get(endpoint + self._dict_to_params(params))
    parsed = json.loads(response.text)
    if response.status_code != 200:
      raise CircleCiError(response.status_code, parsed['message'])
    # DO_NOT_SUBMIT write to the db here
    print(parsed)
    return parsed['items'][0]
  
  def get_workflow_stats(self, reporting_window = models.CircleReportingWindow.LAST_90_DAYS):
    return self._fetch_get_workflow_stats(reporting_window)


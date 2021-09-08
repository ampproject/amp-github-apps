"""Client for querying CircleCI API.

For an overview of the API https://circleci.com/docs/api/v2/
"""
from typing import Dict
from http import HTTPStatus
import logging
import requests
from database import models

import env

CIRCLECI_API = 'https://circleci.com/api/v2'
VCS_STAB = 'github'
PROJECT = env.get('GITHUB_REPO')
INSIGHTS_API = f'{CIRCLECI_API}/insights/{VCS_STAB}/{PROJECT}'

def _dict_to_params(params: Dict):
  param_string = '&'.join(f'{key}={value}' for (key, value) in params.items())
  return param_string and '?' + param_string


class CircleCiError(Exception):
  def __init__(self, status_code: int, message: str):
    msg = f'CircleCI API Error status {status_code}. Message: {message}'
    super(CircleCiError, self).__init__(msg)


class CircleCiAPI(object):
  """Interface class for executing queries agains the CircleCI API."""
  def __init__(self, token = None):
    self._token = token or env.get('CIRCLECI_API_ACCESS_TOKEN')


  def get_workflow_stats(self, reporting_window = models.CircleCiReportingWindow.LAST_90_DAYS) -> models.CircleCiWorkflowStats:
    params = {
      'reporting-window': reporting_window.value
    }
    endpoint = f'{INSIGHTS_API}/workflows{_dict_to_params(params)}'
    logging.info('Called {endpoint}')
    headers = { 'authorization': 'Basic %s' % env.get('CIRCLECI_API_ACCESS_TOKEN') }
    response = requests.get(endpoint, headers=headers)
    parsed = response.json()
    if response.status_code != HTTPStatus.OK:
      raise CircleCiError(response.status_code, parsed['message'])
    stats = models.CircleCiWorkflowStats.from_json(parsed['items'][0])
    
    return stats


"""Module for fetching data from the Travis API."""

from agithub import base as agithub_base
from flask_api import status
import datetime
import logging
from typing import Any, Dict, Sequence, Text
from urllib import parse

import env
from database import models

# Default/maximum page size from the API.
TRAVIS_PAGE_SIZE = 25


class TravisApiError(Exception):
  """Errors encountered while querying the Travis API."""

  def __init__(self, status_code: int, err_msg: Text):
    """Constructor.

    Args:
      status_code: HTTP status return code of the Travis API response.
      err_msg: error message provided by the API.
    """
    super(TravisApiError, self).__init__('Travis API Exception (HTTP %d): %s' %
                                         (status_code, err_msg))


class TravisApi(agithub_base.API):
  """Travis API interface."""

  def __init__(self, *args, **kwargs):
    extra_headers = {
        'User-Agent': 'AMPProjectMetrics/1.0.0',
        'Content-Type': 'application/json',
        'Authorization': 'token %s' % env.get('TRAVIS_API_ACCESS_TOKEN'),
        'Travis-API-Version': '3',
    }

    props = agithub_base.ConnectionProperties(
        api_url='api.travis-ci.org',
        secure_http=True,
        extra_headers=extra_headers)
    self.setClient(agithub_base.Client(*args, **kwargs))
    self.setConnectionProperties(props)

  @property
  def repo(self) -> agithub_base.IncompleteRequest:
    """Returns a partial Travis request for the repository in env.yaml."""
    return self['repo'][parse.quote(env.get('GITHUB_REPO'), safe='')]

  def _json_to_build(self, json_build: Dict[Text, Any]) -> models.Build:
    started_at = datetime.datetime.strptime(
        json_build['started_at'],
        '%Y-%m-%dT%H:%M:%SZ') if json_build['started_at'] else None
    finished_at = datetime.datetime.strptime(
        json_build['finished_at'],
        '%Y-%m-%dT%H:%M:%SZ') if json_build['finished_at'] else None
    duration = (finished_at -
                started_at) if (started_at and finished_at) else None

    return models.Build(
        id=json_build['id'],
        number=int(json_build['number']),
        duration=duration.seconds if duration else None,
        state=models.TravisState(json_build['state']),
        started_at=started_at,
        commit_hash=json_build['commit']['sha'])

  def fetch_builds(self, page_num: int = 0) -> Sequence[models.Build]:
    """Fetches push builds from Travis.

    Args:
      page_num: zero-indexed page number to fetch.

    Raises:
      TravisApiError: if the call to the Travis Builds API fails.

    Returns:
      A list of the fetched builds.
    """
    params = {
        'event_type': 'push',
        'sort_by': 'id:desc',
        'offset': page_num * TRAVIS_PAGE_SIZE,
        'limit': TRAVIS_PAGE_SIZE,
        'branch.name': 'master',
    }
    status_code, response = self.repo.builds.get(**params)

    if status_code == status.HTTP_200_OK:
      return [self._json_to_build(build) for build in response['builds']]
    raise TravisApiError(
        status_code,
        'Travis Builds API request failed with response: %s' % response)

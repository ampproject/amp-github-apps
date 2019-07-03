"""Module for fetching data from the Travis API."""

from agithub import base as agithub_base
from flask_api import status
import datetime
import functools
import logging
from typing import Any, Dict, Sequence, Text

import env
from database import models


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

  # Default/maximum page size from the API.
  TRAVIS_PAGE_SIZE = 25

  def __init__(self, *args, **kwargs):
    extra_headers = {
        'User-Agent': 'AMPProjectMetrics/1.0.0',
        'Content-Type': 'application/json',
    }

    props = agithub_base.ConnectionProperties(
        api_url='api.travis-ci.org',
        secure_http=True,
        extra_headers=extra_headers)
    self.setClient(agithub_base.Client(*args, **kwargs))
    self.setConnectionProperties(props)

    try:
      self.api_token = env.get('TRAVIS_API_ACCESS_TOKEN')
    except KeyError:
      logging.warn('No Travis API key found; exchanging GitHub token')
      self.api_token = self._get_travis_token(
          env.get('GITHUB_API_ACCESS_TOKEN'))

    extra_headers['Authorization'] = 'token %s' % self._token
    extra_headers['Travis-API-Version'] = '3'
    props = agithub_base.ConnectionProperties(
        api_url='api.travis-ci.org',
        secure_http=True,
        extra_headers=extra_headers)
    self.setConnectionProperties(props)

  @functools.lru_cache()
  def _get_travis_token(self, github_token: Text) -> Text:
    """Gets a Travis token using a current GitHub token.

    See https://docs.travis-ci.com/api/#with-a-github-token

    Args:
      github_token: GitHub API access token.

    Raises:
      TravisApiError: if the call to the Travis Auth API fails.

    Returns:
      Travis API access token.
    """
    logging.info('Exchanging GitHub API token for Travis API token')
    status_code, response = self.auth.github.post(github_token=github_token)
    if status_code == status.HTTP_200_OK:
      return response['access_token']
    raise TravisApiError(
        status_code,
        'Travis Auth API request failed with response: %s' % response)

  @property
  def repo(self) -> agithub_base.IncompleteRequest:
    """Returns a partial Travis request for the repository in env.yaml."""
    return self['repo'][env.get('GITHUB_REPO').replace('/', '%2F')]

  def _json_to_build(self, json_build: Dict[Text, Any]) -> models.Build:
    started_at = datetime.datetime.strptime(
        json_build['started_at'],
        '%Y-%m-%dT%H:%M:%SZ') if json_build['started_at'] else None
    return models.Build(
        id=json_build['id'],
        number=int(json_build['number']),
        duration=json_build['duration'],
        state=models.TravisState(json_build['state']),
        started_at=started_at,
        commit_hash=json_build['commit']['sha'])

  def fetch_builds(self, page_num: int = 0) -> Sequence[models.Build]:
    """Fetches pull request builds from Travis.

    Args:
      page_num: zero-indexed page number to fetch.

    Raises:
      TravisApiError: if the call to the Travis Builds API fails.

    Returns:
      The API response containing a `builds` list and associated `commits` list.
      See https://docs.travis-ci.com/api/#builds
    """
    params = {
        'event_type': 'pull_request',
        'sort_by': 'id:desc',
        'offset': page_num * self.TRAVIS_PAGE_SIZE,
        'limit': self.TRAVIS_PAGE_SIZE,
        'branch.name': 'master',
    }
    status_code, response = self.repo.builds.get(**params)

    if status_code == status.HTTP_200_OK:
      return [self._json_to_build(build) for build in response['builds']]
    raise TravisApiError(
        status_code,
        'Travis Builds API request failed with response: %s' % response)

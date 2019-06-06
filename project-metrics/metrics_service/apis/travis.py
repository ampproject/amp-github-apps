"""Module for fetching data from the Travis API."""

from agithub import base as agithub_base
from flask_api import status
import functools
import logging
from typing import Any, Dict, Text

import env


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
        'Accept': 'application/vnd.travis-ci.2.1+json',
        'Content-Type': 'application/json'
    }
    props = agithub_base.ConnectionProperties(
        api_url='api.travis-ci.org',
        secure_http=True,
        extra_headers=extra_headers)
    self.setClient(agithub_base.Client(*args, **kwargs))
    self.setConnectionProperties(props)

    self._token = self._get_travis_token(env.get('GITHUB_API_ACCESS_TOKEN'))
    extra_headers['Authorization'] = 'token %s' % self._token

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
    return self.repos[env.get('GITHUB_REPO')]

  def fetch_builds(self, after_number: int = None) -> Dict[Text, Any]:
    """Fetches pull request builds from Travis.

    Args:
      after_number: build number to start from (for paging).

    Raises:
      TravisApiError: if the call to the Travis Builds API fails.

    Returns:
      The API response containing a `builds` list and associated `commits` list.
      See https://docs.travis-ci.com/api/#builds
    """
    params = {'event_type': 'pull_request'}
    if after_number:
      params['after_number'] = after_number
    status_code, response = self.repo.builds.get(**params)
    if status_code == status.HTTP_200_OK:
      return response
    raise TravisApiError(
        status_code,
        'Travis Builds API request failed with response: %s' % response)

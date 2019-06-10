"""Module for fetching code coverage info from Codecov."""

from agithub import base as agithub_base
from flask_api import status
import logging
from typing import Any, Dict, Text

import env


class CodecovApiError(Exception):
  """Errors encountered while querying the Codecov API."""

  def __init__(self, status_code: int, err_msg: Text):
    """Constructor.

    Args:
      status_code: HTTP status return code of the Codecov API response.
      err_msg: error message provided by the API.
    """
    super(CodecovApiError, self).__init__(
        'Codecov API Exception (HTTP %d): %s' % (status_code, err_msg))


class CodecovApi(agithub_base.API):
  """Codecov API interface."""

  def __init__(self, *args, **kwargs):
    extra_headers = {
        'Authorization': 'token %s' % env.get('CODECOV_API_ACCESS_TOKEN'),
        'User-Agent': 'AMPProjectMetrics/1.0.0',
        'Content-Type': 'application/json'
    }
    props = agithub_base.ConnectionProperties(
        api_url='codecov.io',
        url_prefix='/api/gh',
        secure_http=True,
        extra_headers=extra_headers)
    self.setClient(agithub_base.Client(*args, **kwargs))
    self.setConnectionProperties(props)

  @property
  def repo(self) -> agithub_base.IncompleteRequest:
    """Returns a partial Codecov request for the repository in env.yaml."""
    return self[env.get('GITHUB_REPO')]

  def get_absolute_coverage(self) -> float:
    """Fetch the absolute coverage at HEAD.

    Raises:
      CodecovApiError: if the call to the Codecov API fails.

    Returns:
      Code coverage percentage in the range [0-100].
    """
    status_code, response = self.repo.branch.master.get(limit=1)
    if status_code == status.HTTP_200_OK:
      return float(response['commit']['totals']['c'])
    raise CodecovApiError(status_code, response['error']['reason'])

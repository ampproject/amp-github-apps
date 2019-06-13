"""GitHub client for issuing GraphQL queries to the GitHub API v4.

For an overview of the GraphQL API, see https://developer.github.com/v4.
"""

import datetime
import json
from absl import logging
import requests
from typing import Any, Dict, Text, Union

import env

GraphQL = Text
JsonDict = Dict[Text, Any]

PAGING_INFO = '''
pageInfo {
  hasPreviousPage
  hasNextPage
  endCursor
  startCursor
}
totalCount
'''
GRAPHQL_API_URI = 'https://api.github.com/graphql'
GITHUB_REPO = env.get('GITHUB_REPO')
GITHUB_REPO_OWNER, GITHUB_REPO_NAME = GITHUB_REPO.split('/')
GITHUB_API_ACCESS_TOKEN = env.get('GITHUB_API_ACCESS_TOKEN')


class Timestamp(object):
  """The GitHub API's timestamp format."""

  def __init__(self, timestamp: Union[datetime.datetime, Text]):
    if isinstance(timestamp, datetime.datetime):
      self.datetime = timestamp
    else:
      self.datetime = datetime.datetime.strptime(
          timestamp, '%Y-%m-%dT%H:%M:%SZ')

  def __str__(self):
    return str(self.datetime)

  @property
  def git_timestamp(self) -> Text:
    """Produces a GitTimestamp-formatted timestamp."""
    return self.datetime.strftime('%Y-%m-%dT%H:%M:%SZ')


class GitHubGraphQL(object):
  """Interface class for executing GraphQL queries against the GitHub API."""

  def __init__(self, repository: Text = GITHUB_REPO,
               token: Text = GITHUB_API_ACCESS_TOKEN):
    self._repository = repository
    self._token = token

  def _execute(self, payload: JsonDict) -> JsonDict:
    """Execute a GraphQL query on the GitHub API v4.

    Note that, in the context of the GraphQL API, a "query" may be either a
    "mutation" query or a "query" (non-mutation) query.

    Args:
      payload: JSON object specifying GraphQL query.

    Raises:
      HTTPError: if the request to the API endpoint fails.
      ValueError: if the response from the API is malformed JSON.
      GraphQLError: if the GraphQL API responded with errors.

    Returns:
      The parsed JSON response body.
    """
    logging.info('Sending Github GraphQL query')
    logging.debug(payload)
    response = requests.post(
        GRAPHQL_API_URI,
        data=json.dumps(payload),
        headers={'Authorization': 'bearer %s' % self._token})

    response.raise_for_status()
    response_content = response.json()

    if 'errors' in response_content:
      logging.error('Github GraphQL API returned an error response: %s',
                    response_content['errors'])
      raise GitHubGraphQL.GraphQLError(response_content['errors'][0])

    return response_content['data']

  def query(self, graphql: GraphQL) -> JsonDict:
    """Executes a non-mutation query against the API.

    Args:
      graphql: GraphQL query body.

    Returns:
      The parsed JSON response body.
    """
    return self._execute({'query': 'query {%s}' % graphql})

  def query_repo(self, graphql: GraphQL) -> JsonDict:
    """Executes a non-mutation query on the specified repository.

    Args:
      graphql: GraphQL query body.

    Returns:
      The unwrapped portion of the response within the ampproject/amphtml
      repository.
    """
    return self.query('''repository(owner: "{owner}", name: "{name}") {{
      {query}
    }}'''.format(
        owner=GITHUB_REPO_OWNER,
        name=GITHUB_REPO_NAME,
        query=graphql))['repository']

  def query_master_branch(self,
                          graphql: GraphQL) -> JsonDict:
    """Executes a non-mutation query on the repository's master branch.

    Args:
      graphql: GraphQL query body.

    Returns:
      The unwrapped portion of the response within the master branch of the
      repository.
    """
    return self.query_repo('''defaultBranchRef {{
      {query}
    }}'''.format(query=graphql))['defaultBranchRef']

  class GraphQLError(Exception):
    """Errors returned by the GitHub API."""
    pass

"""Tests for Travis API interface."""

import unittest
from unittest import mock
from agithub import base as agithub_base

from apis import travis
from database import models
import env


class TestTravisApi(unittest.TestCase):

  def setUp(self):
    super(TestTravisApi, self).setUp()

    mock.patch.object(
        env,
        'get',
        side_effect={
            'GITHUB_REPO': '__repo__',
            'GITHUB_API_ACCESS_TOKEN': '__github_token__',
        }.get).start()
    self.mock_request = mock.patch.object(
        agithub_base.Client, 'request', autospec=True).start()

    self.addCleanup(mock.patch.stopall)

  def testGetTravisToken(self):
    self.mock_request.return_value = (200, {'access_token': '__travis_token__'})

    travis_api = travis.TravisApi()

    self.assertEqual(travis_api._token, '__travis_token__')
    self.mock_request.assert_called_once_with(
        travis_api.client, 'POST', '/auth/github?github_token=__github_token__',
        mock.ANY, mock.ANY)

  def testGetTravisTokenError(self):
    self.mock_request.return_value = (403, 'Unauthorized.')

    with self.assertRaisesRegex(
        travis.TravisApiError,
        (r'Travis API Exception \(HTTP 403\): '
          'Travis Auth API request failed with response: Unauthorized\.')
    ):
      travis.TravisApi()

  @mock.patch.object(
      travis.TravisApi, '_get_travis_token', return_value='__travis_token__')
  def testFetchBuilds(self, unused_mock_get_travis_token):
    build = models.Build(duration=1000, state=models.TravisState.PASSED)
    self.mock_request.return_value = (200, [build])

    travis_api = travis.TravisApi()
    fetched_builds = travis_api.fetch_builds()

    self.assertEqual(fetched_builds, [build])
    self.mock_request.assert_called_once_with(
        travis_api.client, 'GET',
        '/repos/__repo__/builds?event_type=pull_request', mock.ANY, mock.ANY)

  @mock.patch.object(
      travis.TravisApi, '_get_travis_token', return_value='__travis_token__')
  def testFetchBuildsAfterNumber(self, unused_mock_get_travis_token):
    build = models.Build(duration=1000, state=models.TravisState.PASSED)
    self.mock_request.return_value = (200, [build])

    travis_api = travis.TravisApi()
    fetched_builds = travis_api.fetch_builds(after_number=3)

    self.assertEqual(fetched_builds, [build])
    self.mock_request.assert_called_once_with(
        travis_api.client, 'GET',
        '/repos/__repo__/builds?event_type=pull_request&after_number=3',
        mock.ANY, mock.ANY)

  @mock.patch.object(
      travis.TravisApi, '_get_travis_token', return_value='__travis_token__')
  def testFetchBuildsError(self, unused_mock_get_travis_token):
    travis_api = travis.TravisApi()
    self.mock_request.return_value = (500, 'Server error.')

    with self.assertRaisesRegex(
        travis.TravisApiError,
        (r'Travis API Exception \(HTTP 500\): '
          'Travis Builds API request failed with response: Server error\.')
    ):
      travis_api.fetch_builds(after_number=3)

"""Tests for Travis API interface."""

import datetime
import sqlalchemy
import sqlalchemy.testing
import unittest
from unittest import mock
from agithub import base as agithub_base

from apis import travis
from database import models
import env


class TestTravisApi(unittest.TestCase):

  def setUp(self):
    super(TestTravisApi, self).setUp()

    self.session = sqlalchemy.orm.create_session(bind=sqlalchemy.testing.db)
    self.build = models.Build(
        id=15492917,
        number=1,
        state=models.TravisState.FAILED,
        duration=8,
        started_at=datetime.datetime(2015, 9, 12, 19, 19, 25),
        commit_hash='5589a4d3d3fc008c77026f5e7f996a61200298bb',
    )
    self.build_json = {
        'id': 15492917,
        'number': '1',
        'state': 'failed',
        'duration': 8,
        'started_at': '2015-09-12T19:19:25Z',
        'commit': {
            'sha': '5589a4d3d3fc008c77026f5e7f996a61200298bb',
        },
    }

    mock.patch.object(
        env,
        'get',
        side_effect={
            'GITHUB_REPO': '__repo__',
            'GITHUB_API_ACCESS_TOKEN': '__github_token__',
        }.__getitem__).start()
    self.mock_request = mock.patch.object(
        agithub_base.Client, 'request', autospec=True).start()

    self.addCleanup(mock.patch.stopall)

  def testGetTravisToken(self):
    self.mock_request.return_value = (200, {'access_token': '__travis_token__'})

    travis_api = travis.TravisApi()

    self.assertEqual(travis_api.api_token, '__travis_token__')
    self.mock_request.assert_called_once_with(
        travis_api.client, 'POST', '/auth/github?github_token=__github_token__',
        mock.ANY, mock.ANY)

  def testGetTravisTokenError(self):
    self.mock_request.return_value = (403, 'Unauthorized.')

    with self.assertRaisesRegex(
        travis.TravisApiError,
        (r'Travis API Exception \(HTTP 403\): '
         r'Travis Auth API request failed with response: Unauthorized\.')):
      travis.TravisApi()

  @mock.patch.object(
      travis.TravisApi, '_get_travis_token', return_value='__travis_token__')
  def testFetchBuilds(self, unused_mock_get_travis_token):
    self.mock_request.return_value = (200, {'builds': [self.build_json]})

    travis_api = travis.TravisApi()
    fetched_builds = travis_api.fetch_builds()

    # Comparing the Build directly fails due to internal state properties used
    # by SQLAlchemy.
    self.assertEqual(fetched_builds[0].started_at, self.build.started_at)
    self.assertEqual(fetched_builds[0].id, self.build.id)
    self.assertEqual(fetched_builds[0].number, self.build.number)
    self.assertEqual(fetched_builds[0].duration, self.build.duration)
    self.assertEqual(fetched_builds[0].commit_hash, self.build.commit_hash)
    self.assertEqual(fetched_builds[0].state, self.build.state)

  @mock.patch.object(
      travis.TravisApi, '_get_travis_token', return_value='__travis_token__')
  def testFetchBuildsPage(self, unused_mock_get_travis_token):
    self.mock_request.return_value = (200, {'builds': [self.build_json]})

    travis_api = travis.TravisApi()
    fetched_builds = travis_api.fetch_builds(page_num=1)

    # Comparing the Build directly fails due to internal state properties used
    # by SQLAlchemy.
    self.assertEqual(fetched_builds[0].started_at, self.build.started_at)
    self.assertEqual(fetched_builds[0].id, self.build.id)
    self.assertEqual(fetched_builds[0].number, self.build.number)
    self.assertEqual(fetched_builds[0].duration, self.build.duration)
    self.assertEqual(fetched_builds[0].commit_hash, self.build.commit_hash)
    self.assertEqual(fetched_builds[0].state, self.build.state)

  @mock.patch.object(
      travis.TravisApi, '_get_travis_token', return_value='__travis_token__')
  def testFetchBuildsError(self, unused_mock_get_travis_token):
    travis_api = travis.TravisApi()
    self.mock_request.return_value = (500, 'Server error.')

    with self.assertRaisesRegex(
        travis.TravisApiError,
        (r'Travis API Exception \(HTTP 500\): '
         r'Travis Builds API request failed with response: Server error\.')):
      travis_api.fetch_builds()

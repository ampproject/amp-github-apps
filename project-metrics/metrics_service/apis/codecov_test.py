"""Tests for Codecov API interface."""

from agithub import base as agithub_base
import unittest
from unittest import mock

import env
from apis import codecov


class TestCodecovApi(unittest.TestCase):

  def setUp(self):
    super(TestCodecovApi, self).setUp()

    mock.patch.object(
        env, 'get', side_effect={
            'GITHUB_REPO': '__repo__',
        }.get).start()
    self.mock_request = mock.patch.object(
        agithub_base.Client, 'request', autospec=True).start()
    self.addCleanup(mock.patch.stopall)

    self.codecov_api = codecov.CodecovApi()

  def testGetAbsoluteCoverageForHead(self):
    self.mock_request.return_value = (200, {
        'commit': {
            'totals': {
                'c': '13.37'
            }
        }
    })
    coverage = self.codecov_api.get_absolute_coverage()

    self.assertEqual(coverage, 13.37)
    self.mock_request.assert_called_once_with(
        self.codecov_api.client, 'GET', '/__repo__/branch/master?limit=1',
        mock.ANY, mock.ANY)

  def testGetAbsoluteCoverageForCommit(self):
    self.mock_request.return_value = (200, {
        'commit': {
            'totals': {
                'c': '13.37'
            }
        }
    })
    coverage = self.codecov_api.get_absolute_coverage('test_commit_hash')

    self.assertEqual(coverage, 13.37)
    self.mock_request.assert_called_once_with(
        self.codecov_api.client, 'GET',
        '/__repo__/commits/test_commit_hash?limit=1', mock.ANY, mock.ANY)

  def testGetAbsoluteCoverageError(self):
    self.mock_request.return_value = (404, {'error': {'reason': 'Not found.'}})
    with self.assertRaises(
        codecov.CodecovApiError,
        msg='Codecov API Exception HTTP 404): Not found.'):
      self.codecov_api.get_absolute_coverage()

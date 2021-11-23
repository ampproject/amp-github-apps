"""Tests for CircleCI API interface"""

import unittest
from unittest import mock
import requests
from database import models

import env
from apis.circleci import CircleCiAPI

class FakeValidResponse():
  status_code = 200
  text = '''
  {
    "next_page_token" : null,
    "items" : [ {
      "name" : "CircleCI",
      "metrics" : {
        "total_runs" : 740,
        "successful_runs" : 423,
        "mttr" : 19686,
        "total_credits_used" : 3245482,
        "failed_runs" : 309,
        "median_credits_used" : 0,
        "success_rate" : 0.5716216216216217,
        "duration_metrics" : {
          "min" : 15,
          "mean" : 1124,
          "median" : 987,
          "p95" : 1447,
          "max" : 9031,
          "standard_deviation" : 914.0,
          "total_duration" : 0
        },
        "total_recoveries" : 0,
        "throughput" : 8.314606741573034
      },
      "window_start" : "2021-06-03T00:05:18.812Z",
      "window_end" : "2021-08-31T23:59:51.955Z",
      "project_id" : "16f524bf-6612-4bba-8e0c-c9b6b00ceb61"
    } ]
  }
  '''

def stub_circleci_api():
  mock.patch.object(
        env, 'get', side_effect={
            'GITHUB_REPO': '__repo__',
        }.get).start()

  mock.patch.object(
      env, 'get', side_effect={
          'CIRCLECI_API_ACCESS_TOKEN': 'FAKE_TOKEN',
      }.get).start()
  mock_request = mock.patch.object(requests, 'get', autospec=True).start()
  mock_request.return_value = (FakeValidResponse())
  return mock_request

class TestCircleCiApi(unittest.TestCase):
  def setUp(self) -> None:
    super(TestCircleCiApi, self).setUp()
    self.mock_request = stub_circleci_api()
    self.addCleanup(mock.patch.stopall)

  def testDictToParams(self):
    self.assertEqual(CircleCiAPI._dict_to_params({}), '')

    self.assertEqual(CircleCiAPI._dict_to_params({
      'reporting-window': '',
    }), '?reporting-window=')

    self.assertEqual(CircleCiAPI._dict_to_params({
      'reporting-window': models.CircleCiReportingWindow.LAST_90_DAYS.value
    }), '?reporting-window=last-90-days')

    self.assertEqual(CircleCiAPI._dict_to_params({'a': 1, 'b': 2}), '?a=1&b=2')

  def testGetWorkflowStats(self):
    CircleCiAPI().get_workflow_stats()

    self.mock_request.assert_called_with(
      'https://circleci.com/api/v2/insights/github/ampproject/amphtml/workflows?reporting-window=last-90-days',
      headers = { 'authorization': "Basic FAKE_TOKEN" }
    )

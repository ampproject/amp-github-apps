"""Provider of environment variables from env.yaml.

Because app.yaml is only parsed when run on AppEngine, os.environ.get() will
return None for key constants during local runs and testing. This module parses
env.yaml directly and provides the environment variables, rather than using the
env_variables part of app.yaml.
"""

import functools
import os
from typing import Any, Mapping, Sequence, Text
import yaml


ENV_YAML_PATH = os.path.join(os.path.dirname(__file__), 'env.yaml')


@functools.lru_cache()
def _load_env_yaml_constants() -> Mapping[Text, Any]:
  """Produces a dictionary of all environment variables defined in env.yaml."""
  with open(ENV_YAML_PATH, 'r') as env_yaml:
    return yaml.load(env_yaml, Loader=yaml.Loader)


def get(variable_name: Text) -> Any:
  """Get the value of an environment variable."""
  return _load_env_yaml_constants()[variable_name]

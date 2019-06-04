import os
from google.appengine.ext import vendor

vendor.add(os.path.join(
  os.path.dirname(os.path.realpath(__file__)),
  'third-party'))

def webapp_add_wsgi_middleware(app):
  """WSGI middleware configuration."""
  from google.appengine.ext.appstats import recording
  return recording.appstats_wsgi_middleware(app)

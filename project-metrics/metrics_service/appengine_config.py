import os
from google.appengine.ext import vendor

vendor.add(os.path.join(
  os.path.dirname(os.path.realpath(__file__)),
  'third-party'))

"""WSGI middleware configuration."""
def webapp_add_wsgi_middleware(app):
  from google.appengine.ext.appstats import recording
  return recording.appstats_wsgi_middleware(app)

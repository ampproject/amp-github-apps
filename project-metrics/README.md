AMP Project Metrics
===================

A GitHub App that reports metrics for the repository and scores each metric on a
common scale.


Components
----------

This app is composed of two parts. The first is a Google App Engine (GAE)
application in Python which collects data, computes metrics, and provides a REST
API interface to retrieve them. The other is a GitHub app which queries the REST
API to display the project metrics for a repository.


Local development
-----------------

### Setup

Follow these setup instructions to start developing for the GAE backend locally:

1. Clone this repository and cd into the `project_metrics/metrics_service`
   directory
2. Create and activate a Python 3 [virtualenv](virtualenv.pypa.io/en/latest/)
3. `pip install flask` to install the flask runtime
4. `pip install -r requirements.txt` to install Python dependencies
5. `pip install -r requirements.txt -t third_party/` to install Python
   dependencies into the `third_party` directory for App Engine deployment
6. Run a local SQL instance, or use the [Cloud SQL Proxy](https://cloud.google.com/sql/docs/postgres/sql-proxy)
7. Copy the `env.example.yaml` file to `env.yaml` and modify the fields based on
   the instructions in that file and the values from your GAE/CloudSQL instance
8. `python server.py` will start the development server locally

### Adding third-party dependencies

To add new libraries to the app:

1. `pip install <library>` to install the library in your
   virtualenv
2. `pip install -t third_party/ <library>` to install the library in
   `third_party` for App Engine deployment
3. `pip freeze > requirements.txt` to add the dependency

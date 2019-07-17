import git
import logging
from typing import Sequence, Text

import env

MERGE_BASE_BRANCH = 'origin/canary'


class GitRepo(object):

  def __init__(self, repo_dir):
    self._repo = git.Repo(repo_dir)

  def tag_exists(self, tag) -> bool:
    """Checks if a tag of a given name exists on the repo."""
    return tag in self._repo.tags

  def tag_commit_hash(self, tag) -> Text:
    """Get the commit hash for a Git tag.

    Args:
      tag: name of Git tag.

    Raises:
      git.exc.GitCommandError: if the tag does not exist.

    Returns:
      Commit SHA for the tag ref.
    """
    return self._repo.git.rev_list(tag, n=1)

  def tag_merge_base(self, tag, branch) -> Text:
    """Get the commit hash for the merge base between a tag and branch.

    Args:
      tag: name of Git tag.
      branch: branch to find merge base from.

    Raises:
      git.exc.GitCommandError: if the tag does not exist.

    Returns:
      Commit hash of the last commit shared by both refs.
    """
    return self._repo.git.merge_base(tag, branch)

  def commit_range(self, base_commit, head_commit) -> Sequence[Text]:
    """Get a range of commits.

    Args:
      base_commit: starting commit ref (excluded from list).
      head_commit: head commit ref (included in list).

    Returns:
      List of commit hashes past the base up to and including the head.
    """
    rev_list = self._repo.git.rev_list('%s..%s' % (base_commit, head_commit))
    return rev_list.split('\n') if rev_list else []

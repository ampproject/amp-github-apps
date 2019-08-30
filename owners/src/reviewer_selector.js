/**
 * Copyright 2019 The AMP HTML Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/** ******************
=== Reviewer Selection ===

-- Overview --

Inputs: a map from files needing approval to the nearest ownership subtree

1. Select the set of ownership rules at the greatest depth in the tree (referred
   to as "deepest rules" going forward) and union all owners; this is the set of
   potential reviewers.
2. For each potential reviewer, count the number of files they can approve, and
   select whichever potential reviewer could cover the most additional files.
3. Remove all files from the set that can be approved by the new reviewer, and
   all ownership rules which are fully satisfied/which contain the new reviewer.

Repeat until all files have an OWNER in the reviewer set.

-- Detailed Algorithm Python/Pseudocode --

> Note: Pseudocode is effectively Python, since it's easy to parse and has
        powerful collections natives (sets, iteration helpers, etc.)

def buildFileTreeMap(filenames, ownersTree):
  return dict(filename: ownersTree.atPath(filename) for filename in filenames)

- Part 1 -

def nearestRules(fileTreeMap):
  rules = set()
  for tree in fileTreeMap.values():
    rules.add(*tree.rules)
  return rules

def bestReviewersForRules(deepestRules):
  reviewers = set()
  for rule in deepestRules:
    reviewers.add(*rule.owners)
  return reviewers

def findPotentialReviwers(fileTreeMap)
  ruleSet = nearestRules(fileTreeMap)
  maxDepth = max(rule.depth for rule in ruleSet)
  deepestRules = filter(ruleSet, lambda rule: rule.depth == maxDepth)
  return bestReviewersForRules(deepestRules)

- Part 2 -

def filesOwnedByReviwer(fileTreeMap, reviewer):
  return [filename for filename, tree in fileTreeMap.items()
          if tree.hasOwner(reviewer)]

def reviewersWithMostFiles(reviewerFilesMap):
  mostFilesOwned = max(reviewerFilesMap.values().map(len))
  return filter(reviewerFileMap.items,
                lambda reviewer, files: len(files) == mostFilesOwned)

def pickBestReviewer(fileTreeMap):
  reviewerSet = findPotentialReviewers(fileTreeMap)
  reviewerFilesMap = {reviewer: filesOwnedByReviewer(fileTreeMap, reviewer)
                      for reviewer in reviewerSet}
  return choice(reviewerWithMostFiles(reviewerFilesMap))

- Part 3 -

def pickReviweers(fileTreeMap):
  reviewers = []

  while len(fileTreeMap):
    nextReviewer, coveredFiles = pickBestReviewer(fileTreeMap)
    reviewers.append(nextReviewer)
    for filename in coveredFiles:
      del fileTreeMap[filename]

  return reviewers

********************/

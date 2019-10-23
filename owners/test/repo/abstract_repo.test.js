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

const AbstractRepository = require('../../src/repo/abstract_repo');

describe('abstract repository', () => {
  const repo = new AbstractRepository();

  describe('readFile', () => {
    it('throws an error', () => {
      expect(repo.readFile('foo/file.txt')).rejects.toEqual(
        new Error('Not implemented')
      );
    });
  });

  describe('findOwnersFiles', () => {
    it('throws an error', () => {
      expect(repo.findOwnersFiles()).rejects.toEqual(
        new Error('Not implemented')
      );
    });
  });
});

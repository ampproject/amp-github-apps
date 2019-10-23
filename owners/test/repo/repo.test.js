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

const Repository = require('../../src/repo/repo');

describe('abstract repository', () => {
  const repo = new Repository();

  describe('sync', () => {
    it('throws an error', () => {
      expect(repo.sync()).rejects.toThrow('Not implemented');
    });
  });

  describe('readFile', () => {
    it('throws an error', () => {
      expect(repo.readFile('foo/file.txt')).rejects.toThrow('Not implemented');
    });
  });

  describe('findOwnersFiles', () => {
    it('throws an error', () => {
      expect(repo.findOwnersFiles()).rejects.toThrow('Not implemented');
    });
  });
});

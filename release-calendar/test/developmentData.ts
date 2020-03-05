import {Connection} from 'typeorm';
import {Release} from '../src/entities/release';
import {Channel} from '../src/types/channel';

export async function addingTestData(connection: Connection) {
  const releaseRepo = connection.getRepository(Release);
  const manyReleases = [
    new Release(
      '1234567890123',
      Channel.NIGHTLY,
      false,
      new Date('2020-03-17T08:44:29+0100')
    ),
    new Release(
      '2234567890123',
      Channel.STABLE,
      false,
      new Date('2020-03-12T08:44:29+0100')
    ),
    new Release(
      '3234567890123',
      Channel.LTS,
      true,
      new Date('2020-03-10T08:44:29+0100')
    ),
    new Release(
      '4234567890123',
      Channel.OPT_IN_EXPERIMENTAL,
      false,
      new Date('2020-03-16T08:44:29+0100')
    ),
    new Release(
      '5234567890123',
      Channel.LTS,
      true,
      new Date('2020-03-14T08:44:29+0100')
    ),
    new Release(
      '6234567890123',
      Channel.LTS,
      true,
      new Date('2020-03-14T08:44:29+0100')
    ),
  ];
  await Promise.all(manyReleases.map(release => releaseRepo.save(release)));

  return await releaseRepo.find();
}

import {Connection} from 'typeorm';
import {Release} from '../entities/release';
import {Channel} from '../types/channel';

export async function addingTestData(connection: Connection) {
  const releaseRepo = connection.getRepository(Release);

  const release1 = new Release(
    '1234567890123',
    Channel.NIGHTLY,
    false,
    new Date('2020-03-17T08:44:29+0100')
  );
  const release2 = new Release(
    '2234567890123',
    Channel.STABLE,
    false,
    new Date('2020-03-12T08:44:29+0100')
  );
  const release3 = new Release(
    '3234567890123',
    Channel.LTS,
    true,
    new Date('2020-03-10T08:44:29+0100')
  );
  const release4 = new Release(
    '4234567890123',
    Channel.OPT_IN_BETA,
    false,
    new Date('2020-03-16T08:44:29+0100')
  );
  const release5 = new Release(
    '5234567890123',
    Channel.NIGHTLY,
    false,
    new Date('2020-03-14T08:44:29+0100')
  );
  const manyReleases = [release1, release2, release3, release4, release5];
  await manyReleases.forEach(release => releaseRepo.save(release));

  return await releaseRepo.find();
}

import {Connection} from 'typeorm';
import {Release} from '../entities/release';
import {Channel} from '../types/channel';

export async function addingTestData(connection: Connection) {
  const releaseRepo = connection.getRepository(Release);

  const release1 = new Release(
    '1234567890123',
    Channel.LTS,
    false,
    new Date('2020-03-17T08:44:29+0100')
  );
  await releaseRepo.save(release1);
  const release2 = new Release(
    '2234567890123',
    Channel.STABLE,
    false,
    new Date('2020-03-12T08:44:29+0100')
  );
  await releaseRepo.save(release2);
  const release3 = new Release(
    '3234567890123',
    Channel.LTS,
    true,
    new Date('2020-03-10T08:44:29+0100')
  );
  await releaseRepo.save(release3);
  const release4 = new Release(
    '4234567890123',
    Channel.BETA_ONE_PERCENT,
    false,
    new Date('2020-03-16T08:44:29+0100')
  );
  await releaseRepo.save(release4);
  const release5 = new Release(
    '5234567890123',
    Channel.NIGHTLY,
    false,
    new Date('2020-03-14T08:44:29+0100')
  );
  await releaseRepo.save(release5);

  const savedReleases = releaseRepo.find();
  console.log(savedReleases);
}

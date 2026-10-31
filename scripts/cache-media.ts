import { writeSnapshot } from '../src/lib/server/snapshot';
import { allEvents, allCandidates, getDb } from '../src/lib/server/db';
import { cacheCommonsFile, findMediaSeed, mediaSeeds } from '../src/lib/server/media';

async function main() {
  const events = [...new Map([...allEvents(), ...allCandidates()].map(event => [event.id, event])).values()]; const prepare = process.argv.includes('--prepare-seeds'); let attached = 0; let bytes = 0; let failures = 0;
  // Re-evaluate only this pipeline's own known image paths when matching rules improve.
  // Unrelated media, including future user-provided pictures, is left untouched.
  for (const table of ['events', 'candidates']) {
    const pictured = getDb().prepare(`SELECT id,title,summary,date,month,image_url AS imageUrl FROM ${table} WHERE image_url LIKE '/images/events/%'`).all() as { id: string; title: string; summary: string; date: string; month: string; imageUrl: string }[];
    for (const event of pictured) {
      const assigned = mediaSeeds.find(seed => event.imageUrl.startsWith(`/images/events/${seed.key}-`) && event.imageUrl.endsWith('.webp'));
      if (assigned && findMediaSeed(event)?.key !== assigned.key) getDb().prepare(`UPDATE ${table} SET image_url=NULL,image_credit=NULL WHERE id=? AND image_url=?`).run(event.id, event.imageUrl);
    }
  }
  for (const seed of mediaSeeds) {
    const matching = events.filter(event => findMediaSeed(event)?.key === seed.key);
    if (!matching.length && !prepare) continue;
    try {
      const media = await cacheCommonsFile(seed); bytes += media.bytes;
      for (const event of matching) {
        for (const table of ['events', 'candidates']) getDb().prepare(`UPDATE ${table} SET image_url=?, image_credit=? WHERE id=?`).run(media.imageUrl, media.imageCredit, event.id);
        attached++;
      }
      console.log(`${seed.key}: ${media.width}×${media.height}, ${(media.bytes / 1024).toFixed(1)} KB, ${media.license}, ${matching.length} event(s)`);
    } catch (error) { failures++; console.error(`${seed.key}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  // Make fresh local databases restore exactly the same image references as the current one.
  await writeSnapshot();
  console.log(JSON.stringify({ attached, downloadedBytes: bytes, failures }));
  if (failures) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });

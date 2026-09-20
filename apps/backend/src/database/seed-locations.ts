import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Location } from './entities/location.entity.js';
import { APP_ENTITIES } from './database.module.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL ?? 'postgres://postgres:postgrespassword@localhost:5432/realmoney_db',
  entities: [...APP_ENTITIES, Location],
  synchronize: true,
});

async function main() {
  console.log('Starting Tanzania locations seed...');

  // Locate the tanzania-locations.json file
  const candidatePaths = [
    process.argv[2],
    path.join(__dirname, 'seeds', 'tanzania-locations.json'),
    path.join(__dirname, '..', '..', 'src', 'database', 'seeds', 'tanzania-locations.json'),
    '/home/shauritanga/Downloads/tanzania-locations.json',
    '/var/www/realmoney/apps/backend/src/database/seeds/tanzania-locations.json',
  ].filter(Boolean) as string[];

  let jsonPath: string | null = null;
  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      jsonPath = candidate;
      break;
    }
  }

  if (!jsonPath) {
    throw new Error('Could not find tanzania-locations.json in candidate paths: ' + candidatePaths.join(', '));
  }

  console.log(`Loading locations from: ${jsonPath}`);
  const raw = fs.readFileSync(jsonPath, 'utf8');
  const data: Record<string, Record<string, string[]>> = JSON.parse(raw);

  await dataSource.initialize();
  const repo = dataSource.getRepository(Location);

  const entries: Array<{ region: string; district: string; ward: string }> = [];
  let regionCount = 0;
  let districtCount = 0;

  for (const [region, districts] of Object.entries(data)) {
    regionCount++;
    for (const [district, wards] of Object.entries(districts)) {
      districtCount++;
      for (const ward of wards) {
        entries.push({
          region: region.trim(),
          district: district.trim(),
          ward: ward.trim(),
        });
      }
    }
  }

  console.log(`Parsed ${regionCount} regions, ${districtCount} districts, and ${entries.length} wards.`);

  // Insert in batches
  const batchSize = 500;
  let inserted = 0;

  for (let i = 0; i < entries.length; i += batchSize) {
    const chunk = entries.slice(i, i + batchSize);
    await repo
      .createQueryBuilder()
      .insert()
      .values(chunk)
      .orIgnore()
      .execute();

    inserted += chunk.length;
    process.stdout.write(`Processed ${inserted}/${entries.length} records...\r`);
  }

  console.log(`\nAll ${entries.length} locations processed.`);
  const totalInDb = await repo.count();
  console.log(`Total locations currently in database: ${totalInDb}`);
}

main()
  .catch((err) => {
    console.error('Failed to seed locations:', err);
    process.exit(1);
  })
  .finally(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

import { getDb } from '../config/db';
import { backfillLegacyGamePlatformEntries } from '../services/GamePlatformEntryService';

async function main() {
  const apply = process.argv.includes('--apply');
  const result = await backfillLegacyGamePlatformEntries(apply);
  console.log(JSON.stringify(result, null, 2));
  if (!apply) {
    console.log('这是只读预览；确认后使用 --apply 写入平台档案。');
  }
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getDb().$disconnect();
  });

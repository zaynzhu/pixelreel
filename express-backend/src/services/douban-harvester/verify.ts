import { makeBrowser } from "./scraper";
import { parseCollectListHtml } from "./parser";

async function main() {
  const { browser, context } = await makeBrowser();
  const page = await context.newPage();
  const response = await page.goto("https://movie.douban.com/people/174594598/collect?start=0&sort=time&rating=all&filter=all&mode=list", { waitUntil: "commit", timeout: 30000 });
  const rawHtml = await response!.text();
  const items = parseCollectListHtml(rawHtml);
  console.log(`共 ${items.length} 条`);
  for (const i of items) {
    console.log(`---`);
    console.log(`  title: ${i.title}`);
    console.log(`  altTitle: ${i.altTitle}`);
    console.log(`  intro: ${i.intro.slice(0, 60)}${i.intro.length > 60 ? "..." : ""}`);
    console.log(`  rating: ${i.rating}`);
    console.log(`  date: ${i.date}`);
    console.log(`  comment: ${i.comment}`);
    console.log(`  link: ${i.link ? "OK" : "MISS"}`);
  }
  await page.close();
  await context.close();
  await browser.close();
}
main().catch(console.error);

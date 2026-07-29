import type { Page } from "playwright";
import type { CollectItem, ReviewItem } from "./types";
import { normalizeDoubanShortReview } from "./short-review";

/**
 * 安全获取元素文本，元素不存在时返回默认值
 */
async function safeText(locator: any, fallback = ""): Promise<string> {
  if (await locator.count() === 0) return fallback;
  try {
    return (await locator.first().innerText()).trim();
  } catch {
    return fallback;
  }
}

/**
 * 安全获取元素属性，元素不存在时返回默认值
 */
async function safeAttr(locator: any, attr: string, fallback = ""): Promise<string> {
  if (await locator.count() === 0) return fallback;
  try {
    return (await locator.first().getAttribute(attr)) ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * 解码 HTML 实体
 */
function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * 从原始 HTML 解析 list 模式的评分数据
 * list 模式下条目是 <li id="listXXX" class="item">，标题在 .item-show .title a 中
 */
export function parseCollectListHtml(html: string): CollectItem[] {
  const items: CollectItem[] = [];
  // 按 <li id="listXXX" class="item"> 分割条目
  const blocks = html.split(/<li id="list\d+"\s+class="item"/);
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    // 链接
    const linkMatch = block.match(/href="(https:\/\/movie\.douban\.com\/subject\/\d+\/)"/);
    const link = linkMatch ? linkMatch[1] : "";

    // 标题（.title a 内文本，含 / 分隔的外文名）
    const titleMatch = block.match(/<div class="title">\s*<a[^>]*>([\s\S]*?)<\/a>/);
    const rawTitle = titleMatch ? decodeHtml(titleMatch[1].replace(/<em>/g, "").replace(/<\/em>/g, "").trim()) : "";
    // 中文标题：/ 前的部分
    const title = rawTitle.split(/\s*\/\s*/)[0].trim();
    // 外文名：/ 后的部分
    const slashParts = rawTitle.split(/\s*\/\s+/);
    const altTitle = slashParts.length > 1 ? slashParts.slice(1).join(" / ").trim() : "";

    // 简介（在 .comment-item.hide 中的 <span class="intro">）
    const introMatch = block.match(/<span class="intro">([\s\S]*?)<\/span>/);
    const intro = introMatch ? decodeHtml(introMatch[1].trim()) : "";

    // 评分（rating1-t 到 rating5-t）
    const ratingMatch = block.match(/class="rating(\d)-t"/);
    const rating = ratingMatch ? ratingMatch[1] : "";

    // 日期（在 .date 中）
    const dateMatch = block.match(/<div class="date">[\s\S]*?(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : "";

    // 短评（在 <div class="comment"> 中）
    const commentMatch = block.match(/<div class="comment">([\s\S]*?)<\/div>/);
    const comment = normalizeDoubanShortReview(commentMatch?.[1]) ?? "";

    if (title) {
      items.push({ title, altTitle, intro, rating, date, comment, link });
    }
  }
  return items;
}

/**
 * 从原始 HTML 解析 grid 模式的评分数据
 */
export function parseCollectGridHtml(html: string): CollectItem[] {
  const items: CollectItem[] = [];
  const blocks = html.split(/class="item comment-item"/);
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    const linkMatch = block.match(/href="(https:\/\/movie\.douban\.com\/subject\/\d+\/)"/);
    const link = linkMatch ? linkMatch[1] : "";

    const emMatch = block.match(/<em>([^<]+)<\/em>/);
    const title = emMatch ? emMatch[1].split(" / ")[0].trim() : "";

    const altMatch = block.match(/<\/em>\s*(?:\/\s*([^<]+?))?\s*<\/a>/);
    const altTitle = altMatch && altMatch[1] ? altMatch[1].trim() : "";

    const introMatch = block.match(/<li class="intro">(.*?)<\/li>/);
    const intro = introMatch ? introMatch[1].trim() : "";

    const ratingMatch = block.match(/class="rating(\d)-t"/);
    const rating = ratingMatch ? ratingMatch[1] : "";

    const dateMatch = block.match(/<span class="date">(.*?)<\/span>/);
    const date = dateMatch ? dateMatch[1].trim() : "";

    const commentMatch = block.match(/<span class="comment">(.*?)<\/span>/);
    const comment = normalizeDoubanShortReview(commentMatch?.[1]) ?? "";

    if (title) {
      items.push({ title, altTitle, intro, rating, date, comment, link });
    }
  }
  return items;
}

/**
 * 解析一页评分数据
 * 优先用原始 HTML 解析（list 模式），回退到 DOM 选择器（grid 模式）
 */
export async function parseCollectPage(page: Page): Promise<CollectItem[]> {
  const html = await page.content();

  // 优先尝试 list 模式解析
  const listItems = parseCollectListHtml(html);
  if (listItems.length > 0) {
    return listItems;
  }

  // 尝试 grid 模式解析
  const gridItems = parseCollectGridHtml(html);
  if (gridItems.length > 0) {
    return gridItems;
  }

  // 最终回退：DOM 选择器
  const items: CollectItem[] = [];
  const cards = page.locator(".item.comment-item");

  for (const card of await cards.all()) {
    try {
      let title = await safeText(card.locator(".title a em"));
      if (!title) {
        title = await safeText(card.locator(".title a"));
      }
      const fullTitle = await safeText(card.locator(".title a"));
      const altTitle = fullTitle
        .replace(title, "")
        .replace(/^\s*\/\s*/, "")
        .trim();

      const intro = await safeText(card.locator(".intro"));

      const ratingCls = await safeAttr(card.locator("[class*='rating']"), "class");
      let rating = "";
      for (let i = 1; i <= 5; i++) {
        if (ratingCls.includes(`rating${i}-t`)) {
          rating = String(i);
          break;
        }
      }

      const date = await safeText(card.locator(".date"));
      const comment = normalizeDoubanShortReview(await safeText(card.locator(".comment"))) ?? "";
      const link = await safeAttr(card.locator(".title a"), "href");

      if (title) {
        items.push({ title, altTitle, intro, rating, date, comment, link });
      }
    } catch (e: any) {
      console.log(`  解析单条失败: ${e.message}`);
    }
  }
  return items;
}

/**
 * 解析一页影评（每页约20条）
 */
export async function parseReviewsPage(page: Page): Promise<ReviewItem[]> {
  const items: ReviewItem[] = [];
  const cards = page.locator(".review-item");

  for (const card of await cards.all()) {
    try {
      const movie = await safeText(card.locator(".main-title-name"));
      const title = await safeText(card.locator("h2 a"));
      const reviewLink = await safeAttr(card.locator("h2 a"), "href");

      const ratingCls = await safeAttr(card.locator("[class*='allstar']"), "class");
      let rating = "";
      for (let i = 1; i <= 5; i++) {
        if (ratingCls.includes(`allstar${i * 10}`)) {
          rating = String(i);
          break;
        }
      }

      const date = await safeText(card.locator(".main-meta"));
      const abstract = await safeText(card.locator(".review-short-content"));

      if (title) {
        items.push({ movie, title, rating, date, abstract, link: reviewLink });
      }
    } catch (e: any) {
      console.log(`  解析影评失败: ${e.message}`);
    }
  }
  return items;
}

// @ts-nocheck
// 此文件包含 Playwright 浏览器上下文脚本，DOM API 在 Node.js 端不存在，需要跳过类型检查
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import {
  USER_ID, SLEEP_MIN, SLEEP_MAX,
  LONG_BREAK_EVERY, LONG_BREAK_SECONDS, MAX_PAGES_PER_RUN,
} from "./config";
import { loadData, saveData, saveProgress, dedupByLink } from "./storage";
import { parseCollectPage, parseReviewsPage } from "./parser";
import type { CollectItem, ReviewItem, Progress } from "./types";

function randomSleep(minS?: number, maxS?: number): Promise<void> {
  const t = Math.random() * ((maxS ?? SLEEP_MAX) - (minS ?? SLEEP_MIN)) + (minS ?? SLEEP_MIN);
  console.log(`  ⏱ 等待 ${t.toFixed(1)}s...`);
  return new Promise((r) => setTimeout(r, t * 1000));
}

async function longBreak(): Promise<void> {
  console.log(`\n⏸ 主动休息 ${LONG_BREAK_SECONDS}s，防风控...`);
  for (let remaining = LONG_BREAK_SECONDS; remaining > 0; remaining -= 10) {
    process.stdout.write(`  剩余 ${remaining}s...\r`);
    await new Promise((r) => setTimeout(r, 10_000));
  }
  console.log();
}

export async function makeBrowser(): Promise<{ browser: Browser; context: BrowserContext }> {
  const browser = await chromium.launch({
    headless: false, // 调试期用有头；稳定后可改 true
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
    ],
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  });
  // 综合隐身脚本：覆盖主流自动化检测点
  // addInitScript 的回调在浏览器上下文中执行，需要 as any 绕过 Node.js 端的类型检查
  await context.addInitScript((() => {
    // 1. webdriver 标志
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });

    // 2. window.chrome 完整伪装
    if (!(window as any).chrome) {
      (window as any).chrome = {};
    }
    const origChrome = (window as any).chrome;
    origChrome.runtime = origChrome.runtime || {};
    if (!origChrome.runtime.connect) {
      origChrome.runtime.connect = function () {};
    }
    if (!origChrome.runtime.sendMessage) {
      origChrome.runtime.sendMessage = function () {};
    }
    if (!origChrome.loadTimes) {
      origChrome.loadTimes = function () {
        return {
          commitLoadTime: performance.now() / 1000,
          requestTime: performance.now() / 1000,
          startLoadTime: performance.now() / 1000,
          finishDocumentLoadTime: performance.now() / 1000,
          finishLoadTime: performance.now() / 1000,
          firstPaintTime: performance.now() / 1000,
          firstPaintAfterLoadTime: 0,
          navigationType: "Other",
          wasFetchedViaSpdy: false,
          wasNpnNegotiated: true,
          npnNegotiatedProtocol: "h2",
          wasAlternateProtocolAvailable: false,
          connectionInfo: "h2",
        };
      };
    }
    if (!origChrome.csi) {
      origChrome.csi = function () {
        return {
          onloadT: performance.now(),
          startE: performance.now(),
          pageT: Math.random() * 1000 + 500,
          tran: 15,
        };
      };
    }

    // 3. navigator.plugins — 伪造真实 PluginArray
    const fakePlugins = [
      { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer",
        description: "Portable Document Format",
        length: 1, 0: { type: "application/x-google-chrome-pdf", suffixes: "pdf" } },
      { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjhh",
        description: "",
        length: 1, 0: { type: "application/pdf", suffixes: "pdf" } },
      { name: "Native Client", filename: "internal-nacl-plugin",
        description: "",
        length: 2, 0: { type: "application/x-nacl", suffixes: "" },
        1: { type: "application/x-pnacl", suffixes: "" } },
    ];
    const pluginArray: any = Object.create(Array.prototype);
    for (let i = 0; i < fakePlugins.length; i++) {
      pluginArray[i] = fakePlugins[i];
      pluginArray[fakePlugins[i].name] = fakePlugins[i];
    }
    pluginArray.length = fakePlugins.length;
    Object.defineProperty(navigator, "plugins", { get: () => pluginArray });

    // 4. Permissions API — query 永远返回 "prompt"
    const origQuery = (window as any).Permissions?.prototype?.query;
    if (origQuery) {
      (window as any).Permissions.prototype.query = function (params: any) {
        if (params.name === "notifications") {
          return Promise.resolve({ state: "default" } as any);
        }
        return origQuery.call(this, params);
      };
    }

    // 5. navigator.languages
    Object.defineProperty(navigator, "languages", {
      get: () => ["zh-CN", "zh", "en-US", "en"],
    });

    // 6. WebGL 渲染器伪装
    const getParamOrig = (WebGLRenderingContext as any).prototype.getParameter;
    (WebGLRenderingContext as any).prototype.getParameter = function (param: number) {
      if (param === 37445) return "Google Inc. (NVIDIA)";
      if (param === 37446) return "ANGLE (NVIDIA, NVIDIA GeForce GTX 1060, OpenGL 4.6)";
      return getParamOrig.call(this, param);
    };
    const getParam2Orig = (WebGL2RenderingContext as any).prototype.getParameter;
    (WebGL2RenderingContext as any).prototype.getParameter = function (param: number) {
      if (param === 37445) return "Google Inc. (NVIDIA)";
      if (param === 37446) return "ANGLE (NVIDIA, NVIDIA GeForce GTX 1060, OpenGL 4.6)";
      return getParam2Orig.call(this, param);
    };

    // 7. iframe contentWindow 一致性
    const origContentWindow = Object.getOwnPropertyDescriptor(
      (HTMLIFrameElement as any).prototype, "contentWindow"
    );
    if (origContentWindow?.get) {
      Object.defineProperty((HTMLIFrameElement as any).prototype, "contentWindow", {
        get: function () {
          const win = origContentWindow.get.call(this);
          if (win) {
            try {
              Object.defineProperty((win as any).navigator, "webdriver", { get: () => undefined });
            } catch {}
          }
          return win;
        },
      });
    }

    // 8. console.debug 保留（部分检测脚本通过 console.debug 行为判断）
    // 不做改动，保持原样即可
  }) as any);
  return { browser, context };
}

function checkBlocked(page: Page): { blocked: boolean; reason: string } {
  const url = page.url();
  try {
    // 同步检查 URL 级别的风控信号
    if (url.includes("accounts.douban.com")) {
      return { blocked: true, reason: "跳转到登录页" };
    }
    if (url.includes("verification") || url.includes("captcha")) {
      return { blocked: true, reason: "验证码页面" };
    }
    return { blocked: false, reason: "" };
  } catch {
    return { blocked: true, reason: "页面内容获取失败" };
  }
}

async function checkBlockedAsync(page: Page): Promise<{ blocked: boolean; reason: string }> {
  const urlCheck = checkBlocked(page);
  if (urlCheck.blocked) return urlCheck;

  try {
    const content = await page.content();

    // 豆瓣风控页特征：标题含"确认"或"验证"，且无正常页面标志
    if (content.includes("访问频率")) {
      return { blocked: true, reason: "频率限制提示" };
    }

    // 只匹配 <meta name="robots"> 之外的 "robot" 出现
    // 正常豆瓣页面有 <meta name="robots">，不算风控
    const stripped = content.replace(/<meta[^>]*name\s*=\s*["']robots["'][^>]*\/?>/gi, "");
    if (stripped.toLowerCase().includes("robot") && !stripped.includes("douban")) {
      console.log("  [DEBUG] 页面前200字:", content.slice(0, 200));
      return { blocked: true, reason: "机器人检测" };
    }
  } catch {
    return { blocked: true, reason: "页面内容获取失败" };
  }
  return { blocked: false, reason: "" };
}

function isOlderThan(dateStr: string, cutoff: string): boolean {
  try {
    return dateStr.slice(0, 10) < cutoff;
  } catch {
    return false;
  }
}

export type ScrapeProgressCallback = (info: { total: number; label: string }) => void;

export async function scrapeCollect(
  context: BrowserContext,
  progress: Progress,
  cutoffDate?: string,
  maxPages?: number,
  signal?: AbortSignal,
  onProgress?: ScrapeProgressCallback,
): Promise<{ ok: boolean; newItems: CollectItem[]; error?: string }> {
  let data: CollectItem[] = cutoffDate === undefined ? loadData<CollectItem>("data/collect.json") : [];
  const newItems: CollectItem[] = [];
  let pageCount = 0;
  const page = await context.newPage();
  const mode = cutoffDate ? "增量" : "全量";
  console.log(`\n🚀 评分抓取模式：${mode}${cutoffDate ? `，截止日期 ${cutoffDate}` : ""}`);

  try {
    while (true) {
      if (signal?.aborted) {
        console.log('⏹ 爬取被用户取消');
        return { ok: false, newItems, error: '用户取消' };
      }
      const start = cutoffDate
        ? pageCount * 15
        : progress.collectDone
          ? -1
          : progress.collectStart;

      if (!cutoffDate && progress.collectDone) break;

      const url =
        `https://movie.douban.com/people/${USER_ID}/collect` +
        `?start=${start}&sort=time&rating=all&filter=all&mode=list`;

      console.log(`\n📄 评分页 offset=${start} | 已抓 ${data.length + newItems.length} 条`);
      onProgress?.({ total: data.length + newItems.length, label: `正在爬取评分数据...` });
      console.log(`   正在加载 ${url}`);
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
      } catch (e: any) {
        console.log(`❌ 页面加载失败: ${e.message}`);
        return { ok: false, newItems, error: '页面加载超时，可能是网络问题或 IP 被封' };
      }
      // 滚动页面触发懒加载
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await randomSleep(1.5, 2.5);

      const { blocked, reason } = await checkBlockedAsync(page);
      if (blocked) {
        console.log(`❌ 被风控: ${reason}`);
        console.log("   请等待 2 小时以上再运行，进度已保存");
        if (cutoffDate === undefined) {
          saveData("data/collect.json", data);  // 先存数据
          saveProgress(progress);           // 再存进度
        }
        return { ok: false, newItems, error: `被豆瓣风控: ${reason}` };
      }

      console.log("   正在解析页面...");
      let items: CollectItem[];
      try {
        items = await parseCollectPage(page);
      } catch (e: any) {
        console.log(`❌ 页面解析失败: ${e.message}`);
        return { ok: false, newItems, error: `页面解析失败: ${e.message}` };
      }

      // 少条页重试：非末页应返回15条，少于15条可能是风控截断
      for (let retry = 1; retry <= 2 && items.length > 0 && items.length < 28; retry++) {
        console.log(`  ⚠ 本页仅 ${items.length} 条（预期28+），重试 ${retry}/2...`);
        await randomSleep(5, 10);
        try {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
          await randomSleep(2, 3);
          const retried = await parseCollectPage(page);
          if (retried.length > items.length) {
            console.log(`  ✓ 重试获取 ${retried.length} 条（原 ${items.length} 条）`);
            items = retried;
            if (items.length >= 28) break;
          }
        } catch {
          // 重试失败，保留原结果
        }
      }

      if (items.length === 0) {
        console.log("✅ 评分数据全部抓完！");
        if (cutoffDate === undefined) {
          progress.collectDone = true;
          saveProgress(progress);
        }
        break;
      }

      if (cutoffDate) {
        const fresh = items.filter((i) => !isOlderThan(i.date, cutoffDate));
        newItems.push(...fresh);
        console.log(`   本页新增 ${fresh.length} 条（共${items.length}条）`);
        onProgress?.({ total: newItems.length, label: `增量爬取 ${newItems.length} 条新数据` });
        if (fresh.length < items.length) {
          console.log("   遇到旧数据，增量抓取完毕");
          break;
        }
      } else {
        const before = data.length;
        data.push(...items);
        data = dedupByLink(data);
        const removed = before + items.length - data.length;
        if (removed > 0) {
          console.log(`   去重：移除 ${removed} 条重复`);
        }
        saveData("data/collect.json", data);
        progress.collectStart = start + 30;
        saveProgress(progress);          // 再推进 offset
        console.log(`   本页获取 ${items.length} 条，累计 ${data.length} 条`);
        onProgress?.({ total: data.length + newItems.length, label: `已爬取 ${data.length + newItems.length} 条评分` });
      }

      pageCount++;

      if (cutoffDate === undefined && pageCount >= MAX_PAGES_PER_RUN) {
        console.log(`\n⏹ 本次运行已达 ${MAX_PAGES_PER_RUN} 页上限，进度已保存`);
        return { ok: true, newItems: [] };
      }

      if (pageCount % LONG_BREAK_EVERY === 0) {
        await longBreak();
      } else {
        await randomSleep();
      }
    }
  } finally {
    await page.close();
  }

  return { ok: true, newItems };
}

export async function scrapeReviews(
  context: BrowserContext,
  progress: Progress,
  cutoffDate?: string,
): Promise<{ ok: boolean; newItems: ReviewItem[] }> {
  const data: ReviewItem[] = cutoffDate === undefined ? loadData<ReviewItem>("data/reviews.json") : [];
  const newItems: ReviewItem[] = [];
  let pageCount = 0;
  const page = await context.newPage();
  const mode = cutoffDate ? "增量" : "全量";
  console.log(`\n🚀 影评抓取模式：${mode}${cutoffDate ? `，截止日期 ${cutoffDate}` : ""}`);

  try {
    while (true) {
      const p = cutoffDate ? pageCount + 1 : progress.reviewsDone ? -1 : progress.reviewsPage;

      if (!cutoffDate && progress.reviewsDone) break;

      const url =
        `https://movie.douban.com/people/${USER_ID}/reviews` +
        `?start=${(p - 1) * 20}&sortby=time`;

      console.log(`\n📝 影评第 ${p} 页 | 已抓 ${data.length + newItems.length} 条`);
      await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await randomSleep(1.5, 2.5);

      const { blocked, reason } = await checkBlockedAsync(page);
      if (blocked) {
        console.log(`❌ 被风控: ${reason}`);
        console.log("   请等待 2 小时以上再运行，进度已保存");
        if (cutoffDate === undefined) {
          saveData("data/reviews.json", data);  // 先存数据
          saveProgress(progress);           // 再存进度
        }
        return { ok: false, newItems };
      }

      let items = await parseReviewsPage(page);

      // 少条页重试：非末页应返回20条
      for (let retry = 1; retry <= 2 && items.length > 0 && items.length < 20; retry++) {
        console.log(`  ⚠ 本页仅 ${items.length} 条（预期20），重试 ${retry}/2...`);
        await randomSleep(5, 10);
        try {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
          await randomSleep(2, 3);
          const retried = await parseReviewsPage(page);
          if (retried.length > items.length) {
            console.log(`  ✓ 重试获取 ${retried.length} 条（原 ${items.length} 条）`);
            items = retried;
            if (items.length >= 20) break;
          }
        } catch {
          // 重试失败，保留原结果
        }
      }

      if (items.length === 0) {
        console.log("✅ 影评全部抓完！");
        if (cutoffDate === undefined) {
          progress.reviewsDone = true;
          saveProgress(progress);
        }
        break;
      }

      if (cutoffDate) {
        const fresh = items.filter((i) => !isOlderThan(i.date, cutoffDate));
        newItems.push(...fresh);
        console.log(`   本页新增 ${fresh.length} 条（共${items.length}条）`);
        if (fresh.length < items.length) {
          console.log("   遇到旧数据，增量抓取完毕");
          break;
        }
      } else {
        data.push(...items);
        saveData("data/reviews.json", data);  // 先存数据
        progress.reviewsPage = p + 1;
        saveProgress(progress);           // 再推进 offset
        console.log(`   本页获取 ${items.length} 条，累计 ${data.length} 条`);
      }

      pageCount++;

      if (cutoffDate === undefined && pageCount >= MAX_PAGES_PER_RUN) {
        console.log(`\n⏹ 本次运行已达 ${MAX_PAGES_PER_RUN} 页上限，进度已保存`);
        return { ok: true, newItems: [] };
      }

      if (pageCount % LONG_BREAK_EVERY === 0) {
        await longBreak();
      } else {
        await randomSleep();
      }
    }
  } finally {
    await page.close();
  }

  return { ok: true, newItems };
}

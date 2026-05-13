import { create } from "zustand";
import { persist } from "zustand/middleware";

type Language = "en" | "zh";

const dictionaries = {
  en: {
    // Nav
    "nav.overview": "OVERVIEW",
    "nav.movies": "MOVIES",
    "nav.games": "GAMES",
    "nav.tv": "TV SHOWS",
    "nav.library": "LIBRARY",
    "nav.terminate": "TERMINATE",
    "nav.live": "Live",
    "nav.system": "System // Command Deck",
    "nav.title": "PIXELREEL DATABANK",
    "nav.desc": "/// ESTABLISHED CONNECTION.\nMonitoring all media metrics, gaming telemetry, and entertainment records.\nData synchronized across nodes.",

    // Login
    "login.sys_auth": "SYSTEM.AUTH",
    "login.title": "PIXELREEL LOGIN",
    "login.desc": "/// Identity verification required for database access.",
    "login.user_id": "USER_ID",
    "login.user_placeholder": "ENTER USERNAME",
    "login.access_code": "ACCESS_CODE",
    "login.btn_verify": "VERIFYING...",
    "login.btn_login": "INITIALIZE LOGIN",
    "login.err_auth": "AUTHENTICATION FAILED",

    // Dashboard
    "dash.telemetry": "PROFILE // TELEMETRY",
    "dash.overview": "SYSTEM OVERVIEW",
    "dash.overview_desc": "/// Aggregating multi-domain data sources. Current sync status: Online.",
    "dash.syncing": "SYNCING...",
    "dash.force_sync": "FORCE SYNC",
    
    "dash.metrics.total": "TOTAL.ENTRIES",
    "dash.metrics.total_cap": "Sum of all media",
    "dash.metrics.movies": "MOVIES",
    "dash.metrics.completed": "COMPLETED",
    "dash.metrics.games": "GAMES",
    "dash.metrics.tv": "TV_SHOWS",
    "dash.metrics.imported": "IMPORTED",
    "dash.metrics.imported_cap": "External syncs",

    "dash.avg.global": "GLOBAL.AVG",
    "dash.avg.global_note": "All platforms",
    "dash.avg.movie": "MOVIE.AVG",
    "dash.avg.movie_note": "rated",
    "dash.avg.tv": "TV.AVG",
    "dash.avg.tv_note": "TV series",
    "dash.avg.game": "GAME.AVG",
    "dash.avg.game_note": "reviewed",

    "dash.routes": "ROUTES // ACCESS_POINTS",
    "dash.nodes": "NAV.NODES",
    "dash.nodes.movie_title": "MOVIE.SEARCH",
    "dash.nodes.movie_desc": "Scan multiple providers for movie telemetry.",
    "dash.nodes.game_title": "GAME.SEARCH",
    "dash.nodes.game_desc": "Access RAWG and Steam data nodes.",
    "dash.nodes.tv_title": "TV.SEARCH",
    "dash.nodes.tv_desc": "Locate television series records.",
    "dash.nodes.lib_title": "LIBRARY.DB",
    "dash.nodes.lib_desc": "Access local synchronized database.",
    "dash.btn.exec": "EXEC",

    "dash.status.movie": "MOVIE.STATUS",
    "dash.status.game": "GAME.STATUS",
    "dash.status.tv": "TV.STATUS",
    "dash.status.data": "DATA // STATUS",
    
    "dash.origin": "METRICS // ORIGIN",
    "dash.origin.movie": "MOVIE.SOURCES",
    "dash.origin.tv": "TV.SOURCES",
    "dash.platforms": "METRICS // PLATFORMS",
    "dash.platforms.game": "GAME.PLATFORMS",

    "dash.sync.trakt": "SYNC // TRAKT",
    "dash.sync.trakt_movies": "PULL TRAKT MOVIES",
    "dash.sync.trakt_shows": "PULL TRAKT TV",
    "dash.sync.fix_posters": "FILL MISSING POSTERS",
    "dash.sync.success": "SYNC SUCCESS. SKIPPED: {0}",
    "dash.sync.failed": "SYNC FAILED",

    "dash.log": "LOG // RECENT_ACTIVITY",
    "dash.recent": "LATEST ACQUISITIONS",
    "dash.recent_desc": "Chronological stream of new database entries.",
    "dash.no_signal": "NO_SIGNAL",
    "dash.awaiting": "AWAITING_TELEMETRY...",
    "dash.no_data": "NO_DATA_AVAILABLE",
    "dash.null": "NULL",

    // Library
    "lib.kicker": "DATABASE // ACCESS",
    "lib.title": "LOCAL RECORDS",
    "lib.desc": "/// Unified query interface for movies, games, and TV shows.",
    "lib.fetching": "FETCHING...",
    "lib.query": "QUERY DB",
    
    "lib.met.results": "RESULTS",
    "lib.met.results_cap": "Matched nodes",
    "lib.met.rated": "RATED",
    "lib.met.rated_cap": "Has metric",
    "lib.met.reviewed": "REVIEWED",
    "lib.met.reviewed_cap": "Has log",
    "lib.met.done": "DONE",
    "lib.met.done_cap": "Finished",

    "lib.search.param": "SEARCH_PARAM",
    "lib.search.placeholder": "INPUT QUERY",
    "lib.search.cat": "CATEGORY",
    "lib.search.status": "STATUS",
    "lib.search.source": "SOURCE",
    "lib.search.log": "LOG",
    "lib.search.all": "ALL",
    "lib.search.has_log": "HAS_LOG",
    "lib.search.null_log": "NULL_LOG",
    "lib.search.order": "ORDER_BY",

    "lib.list.executing": "/// EXECUTING QUERY...",
    "lib.list.zero": "/// QUERY RETURNED 0 RESULTS. ADJUST PARAMS.",
    "lib.list.metric": "METRIC",
    "lib.list.no_log": "/// NO LOG ENTRY. AWAITING INPUT.",
    "lib.list.hr": "HR",
    "lib.list.ach": "ACH",

    "lib.edit.kicker": "CONTROL // OVERRIDE",
    "lib.edit.title": "RECORD_EDITOR",
    "lib.edit.no_img": "NO_IMAGE_DATA",
    "lib.edit.status_flag": "STATUS_FLAG",
    "lib.edit.eval_metric": "EVAL_METRIC",
    "lib.edit.clr": "CLR",
    "lib.edit.sys_log": "SYSTEM_LOG",
    "lib.edit.log_placeholder": "/// ENTER LOG DATA HERE...",
    "lib.edit.buffer": "INPUT_BUFFER",
    "lib.edit.committing": "COMMITTING...",
    "lib.edit.commit": "COMMIT_CHANGES",
    "lib.edit.waiting": "/// WAITING FOR TARGET SELECTION. \nNO RECORD CURRENTLY IN FOCUS.",
    "lib.edit.success": "DATA_COMMITTED",

    // Search
    "search.movie.title": "MOVIE_SEARCH_NODE",
    "search.game.title": "GAME_SEARCH_NODE",
    "search.tv.title": "TV_SEARCH_NODE",
    "search.query_node": "QUERY NODE:",
    "search.btn.searching": "SEARCHING...",
    "search.btn.exec": "EXECUTE_QUERY",
    "search.empty": "EMPTY QUERY. ABORTING.",
    "search.failed": "QUERY FAILED",
    "search.commit_failed": "COMMIT FAILED",
    "search.release": "RELEASE_DATE",
    "search.first_air": "FIRST_AIR_DATE",
    "search.unknown": "UNKNOWN",
    "search.no_data": "/// NO DATA FOUND FOR THIS NODE.",
    "search.already": "IN_DATABASE",
    "search.committing": "COMMITTING...",
    "search.add": "ADD_RECORD",
    "search.prev": "PREV_PAGE",
    "search.next": "NEXT_PAGE",
    "search.page": "PAGE {0} OF {1}",

    // Global
    "global.status.unset": "UNSET",
    "global.status.want": "WANT",
    "global.status.active": "ACTIVE",
    "global.status.done": "DONE",
    "global.cat.mov": "MOV",
    "global.cat.gam": "GAM",
    "global.cat.tvs": "TVS",
    "global.sort.latest": "LATEST",
    "global.sort.rating": "RATING",
    "global.sort.az": "A-Z"
  },
  zh: {
    // Nav
    "nav.overview": "系统总览",
    "nav.movies": "电影检索",
    "nav.games": "游戏检索",
    "nav.tv": "剧集检索",
    "nav.library": "本地记录库",
    "nav.terminate": "终止连接",
    "nav.live": "实时",
    "nav.system": "系统 // 指令终端",
    "nav.title": "PIXELREEL 数据库",
    "nav.desc": "/// 连接已建立。\n正在监控所有媒体指标、游戏遥测和娱乐记录。\n数据已跨节点同步。",

    // Login
    "login.sys_auth": "系统.授权",
    "login.title": "PIXELREEL 登录终端",
    "login.desc": "/// 访问数据库前需要进行身份验证。",
    "login.user_id": "用户_标识",
    "login.user_placeholder": "输入用户名",
    "login.access_code": "访问_秘钥",
    "login.btn_verify": "验证中...",
    "login.btn_login": "初始化登录",
    "login.err_auth": "身份验证失败",

    // Dashboard
    "dash.telemetry": "档案 // 遥测",
    "dash.overview": "系统总览",
    "dash.overview_desc": "/// 聚合多域数据源。当前同步状态：在线。",
    "dash.syncing": "同步中...",
    "dash.force_sync": "强制同步",
    
    "dash.metrics.total": "总计条目",
    "dash.metrics.total_cap": "所有媒体总和",
    "dash.metrics.movies": "电影",
    "dash.metrics.completed": "已完成",
    "dash.metrics.games": "游戏",
    "dash.metrics.tv": "电视剧",
    "dash.metrics.imported": "已导入",
    "dash.metrics.imported_cap": "外部同步",

    "dash.avg.global": "全局均分",
    "dash.avg.global_note": "跨全平台",
    "dash.avg.movie": "电影均分",
    "dash.avg.movie_note": "条带评分",
    "dash.avg.tv": "剧集均分",
    "dash.avg.tv_note": "电视剧",
    "dash.avg.game": "游戏均分",
    "dash.avg.game_note": "条带短评",

    "dash.routes": "路由 // 访问节点",
    "dash.nodes": "导航节点",
    "dash.nodes.movie_title": "电影检索",
    "dash.nodes.movie_desc": "扫描多个服务商获取电影遥测数据。",
    "dash.nodes.game_title": "游戏检索",
    "dash.nodes.game_desc": "访问 RAWG 和 Steam 数据节点。",
    "dash.nodes.tv_title": "剧集检索",
    "dash.nodes.tv_desc": "定位电视剧记录。",
    "dash.nodes.lib_title": "记录数据库",
    "dash.nodes.lib_desc": "访问本地同步的数据库。",
    "dash.btn.exec": "执行",

    "dash.status.movie": "电影状态分布",
    "dash.status.game": "游戏状态分布",
    "dash.status.tv": "剧集状态分布",
    "dash.status.data": "数据 // 状态",
    
    "dash.origin": "指标 // 来源",
    "dash.origin.movie": "电影数据源",
    "dash.origin.tv": "剧集数据源",
    "dash.platforms": "指标 // 平台",
    "dash.platforms.game": "游戏平台分布",

    "dash.sync.trakt": "同步 // TRAKT",
    "dash.sync.trakt_movies": "拉取 Trakt 电影",
    "dash.sync.trakt_shows": "拉取 Trakt 剧集",
    "dash.sync.fix_posters": "修复缺失海报",
    "dash.sync.success": "同步成功。跳过已有：{0}",
    "dash.sync.failed": "同步失败",

    "dash.log": "日志 // 最近活动",
    "dash.recent": "最新入库记录",
    "dash.recent_desc": "按时间排序的新增数据库条目流。",
    "dash.no_signal": "无信号",
    "dash.awaiting": "等待遥测数据...",
    "dash.no_data": "暂无可用数据",
    "dash.null": "空",

    // Library
    "lib.kicker": "数据库 // 访问",
    "lib.title": "本地记录",
    "lib.desc": "/// 电影、游戏与剧集的统一查询接口。",
    "lib.fetching": "提取中...",
    "lib.query": "查询数据库",
    
    "lib.met.results": "结果数",
    "lib.met.results_cap": "匹配的节点",
    "lib.met.rated": "已评分",
    "lib.met.rated_cap": "包含评价指标",
    "lib.met.reviewed": "已写评",
    "lib.met.reviewed_cap": "包含短评日志",
    "lib.met.done": "已完成",
    "lib.met.done_cap": "状态为完成",

    "lib.search.param": "搜索参数",
    "lib.search.placeholder": "输入查询词",
    "lib.search.cat": "类别",
    "lib.search.status": "状态",
    "lib.search.source": "来源",
    "lib.search.log": "日志",
    "lib.search.all": "全部",
    "lib.search.has_log": "含日志",
    "lib.search.null_log": "空日志",
    "lib.search.order": "排序方式",

    "lib.list.executing": "/// 正在执行查询...",
    "lib.list.zero": "/// 查询返回 0 个结果。请调整参数。",
    "lib.list.metric": "指标",
    "lib.list.no_log": "/// 无日志条目。等待输入。",
    "lib.list.hr": "小时",
    "lib.list.ach": "成就",

    "lib.edit.kicker": "控制 // 覆写",
    "lib.edit.title": "记录编辑器",
    "lib.edit.no_img": "无图像数据",
    "lib.edit.status_flag": "状态标识",
    "lib.edit.eval_metric": "评估指标",
    "lib.edit.clr": "清空",
    "lib.edit.sys_log": "系统日志",
    "lib.edit.log_placeholder": "/// 在此输入日志数据...",
    "lib.edit.buffer": "输入缓冲",
    "lib.edit.committing": "提交中...",
    "lib.edit.commit": "提交更改",
    "lib.edit.waiting": "/// 等待目标选择。\n当前没有选中的记录。",
    "lib.edit.success": "数据已提交",

    // Search
    "search.movie.title": "电影检索节点",
    "search.game.title": "游戏检索节点",
    "search.tv.title": "剧集检索节点",
    "search.query_node": "查询节点：",
    "search.btn.searching": "搜索中...",
    "search.btn.exec": "执行查询",
    "search.empty": "查询词为空。终止操作。",
    "search.failed": "查询失败",
    "search.commit_failed": "提交失败",
    "search.release": "发布日期",
    "search.first_air": "首播日期",
    "search.unknown": "未知",
    "search.no_data": "/// 该节点未找到数据。",
    "search.already": "已在库中",
    "search.committing": "提交中...",
    "search.add": "添加记录",
    "search.prev": "上一页",
    "search.next": "下一页",
    "search.page": "第 {0} 页，共 {1} 页",

    // Global
    "global.status.unset": "未设置",
    "global.status.want": "想看/想玩",
    "global.status.active": "进行中",
    "global.status.done": "已完成",
    "global.cat.mov": "电影",
    "global.cat.gam": "游戏",
    "global.cat.tvs": "剧集",
    "global.sort.latest": "最新",
    "global.sort.rating": "评分优先",
    "global.sort.az": "A-Z"
  }
};

type I18nStore = {
  lang: Language;
  toggleLang: () => void;
  t: (key: keyof typeof dictionaries.en, ...args: (string | number)[]) => string;
};

export const useI18nStore = create<I18nStore>()(
  persist(
    (set, get) => ({
      lang: "en", // default
      toggleLang: () => set((state) => ({ lang: state.lang === "en" ? "zh" : "en" })),
      t: (key, ...args) => {
        let str = dictionaries[get().lang][key];
        if (!str) str = dictionaries["en"][key] || key;
        args.forEach((arg, i) => {
          str = str.replace(`{${i}}`, String(arg));
        });
        return str;
      },
    }),
    { name: "pixelreel-lang" }
  )
);

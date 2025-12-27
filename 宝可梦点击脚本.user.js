// ==UserScript==
// @name         宝可梦点击脚本
// @namespace    https://github.com/mianfeipiao123/poke-clicker-auto
// @version      0.10.42
// @description  内核汉化（任务线/NPC/成就/地区/城镇/道路/道馆）+ 镜像站 locales 回源（配合游戏内简体中文）
// @homepageURL  https://github.com/mianfeipiao123/poke-clicker-auto
// @supportURL   https://github.com/mianfeipiao123/poke-clicker-auto/issues
// @updateURL    https://raw.githubusercontent.com/mianfeipiao123/poke-clicker-auto/main/%E5%AE%9D%E5%8F%AF%E6%A2%A6%E7%82%B9%E5%87%BB%E8%84%9A%E6%9C%AC.user.js
// @downloadURL  https://raw.githubusercontent.com/mianfeipiao123/poke-clicker-auto/main/%E5%AE%9D%E5%8F%AF%E6%A2%A6%E7%82%B9%E5%87%BB%E8%84%9A%E6%9C%AC.user.js
// @match        http://localhost:3000/*
// @match        https://www.pokeclicker.com/*
// @match        https://g8hh.github.io/pokeclicker/*
// @match        https://pokeclicker.g8hh.com/*
// @match        https://pokeclicker.g8hh.com.cn/*
// @match        https://yx.g8hh.com/pokeclicker/*
// @match        https://dreamnya.github.io/pokeclicker/*
// @icon         https://scriptcat.org/api/v2/resource/image/Y3VU6C1i3QnlBewG
// @grant        none
// @run-at       document-start
// @license      MIT
// @connect      cdn.jsdelivr.net
// @connect      raw.githubusercontent.com
// ==/UserScript==
/* global TownList, QuestLine:true, Notifier, MultipleQuestsQuest, App, NPC, NPCController, GameController, ko, Achievement:true, AchievementHandler, AchievementTracker, GameConstants, Routes, SubRegions, GymList, Gym, $ */

;(async () => {
    const SCRIPT_VERSION = "0.10.42";
    const SCRIPT_TITLE = "宝可梦点击脚本";
    const LOG_PREFIX = "PokeClickerHelper-Translation";
    const STORAGE_PREFIX = "PokeClickerHelper-Translation";

    // 修复镜像站缺失/过期的界面翻译：将 i18next 的 locales 请求重定向到可用来源
    const OFFICIAL_TRANSLATIONS_BASE = "https://www.pokeclicker.com";
    const LOCALES_PATH_RE = /\/locales\/([^/]+)\/([^/]+\.json)$/i;
    const localesPatchState = {
        enabled: false,
        // 强制将游戏的 i18next 语言资源请求重写为该语言（即使游戏语言仍为英文）
        // 默认简体中文：zh-Hans
        forceLanguage: "zh-Hans",
        baseUrl: OFFICIAL_TRANSLATIONS_BASE,
        rewrites: 0,
        lastRewritten: null,
    };

    function normalizeTranslationsBaseUrl(raw) {
        if (raw == null) {
            return OFFICIAL_TRANSLATIONS_BASE;
        }
        let value = String(raw).trim();
        if (!value) {
            return OFFICIAL_TRANSLATIONS_BASE;
        }
        if (value.startsWith("github:")) {
            value = `https://raw.githubusercontent.com/${value.slice("github:".length)}`;
        }
        return value.replace(/\/+$/, "");
    }

    function computeLocalesBaseUrl() {
        const override = new URLSearchParams(window.location.search).get("translations");
        return normalizeTranslationsBaseUrl(override ?? OFFICIAL_TRANSLATIONS_BASE);
    }

    function shouldForceLocalesBaseUrl() {
        const params = new URLSearchParams(window.location.search);
        if (params.has("translations")) {
            return true;
        }
        const host = window.location.hostname;
        const isLocal = host === "localhost" || host === "127.0.0.1";
        const isOfficial = host === "www.pokeclicker.com";
        return !isLocal && !isOfficial;
    }

    function computeForcedLocaleLanguage() {
        const params = new URLSearchParams(window.location.search);
        const disable = params.get("pchForceLang") || params.get("forceLang");
        if (disable && ["0", "false", "off", "disable", "disabled"].includes(disable.toLowerCase())) {
            return null;
        }
        const override = params.get("pchLang") || params.get("pchLocale") || params.get("lang");
        if (override) {
            return override.trim() || null;
        }
        return localesPatchState.forceLanguage || null;
    }

    function rewriteLocalesUrl(inputUrl) {
        const forceLanguage = localesPatchState.forceLanguage;
        if (!localesPatchState.enabled && !forceLanguage) {
            return null;
        }
        if (typeof inputUrl !== "string" || !inputUrl) {
            return null;
        }
        try {
            const url = new URL(inputUrl, window.location.href);
            const match = url.pathname.match(LOCALES_PATH_RE);
            if (!match) {
                return null;
            }
            const lng = match[1];
            const file = match[2];
            const targetLng = forceLanguage || lng;
            const base = localesPatchState.enabled ? localesPatchState.baseUrl : url.origin;
            const rewritten = `${base}/locales/${targetLng}/${file}`;
            if (rewritten === url.href) {
                return null;
            }
            return rewritten;
        } catch {
            const match = inputUrl.match(/\/locales\/([^/]+)\/([^/?#]+\.json)(?:[?#]|$)/i);
            if (!match) {
                return null;
            }
            const targetLng = forceLanguage || match[1];
            const base = localesPatchState.enabled ? localesPatchState.baseUrl : window.location.origin;
            return `${base}/locales/${targetLng}/${match[2]}`;
        }
    }

    function installLocalesRequestRewrite() {
        localesPatchState.baseUrl = computeLocalesBaseUrl();
        localesPatchState.enabled = shouldForceLocalesBaseUrl();
        localesPatchState.forceLanguage = computeForcedLocaleLanguage();
        if (!localesPatchState.enabled && !localesPatchState.forceLanguage) {
            return;
        }

        const flag = "__PCH_LOCALES_PATCHED__";
        if (window[flag]) {
            return;
        }
        Object.defineProperty(window, flag, { value: true });

        // fetch
        if (typeof window.fetch === "function") {
            const realFetch = window.fetch.bind(window);
            const wrappedFetch = async (input, init) => {
                const url = typeof input === "string" ? input : input?.url;
                const rewritten = rewriteLocalesUrl(url);
                if (rewritten) {
                    localesPatchState.rewrites += 1;
                    localesPatchState.lastRewritten = { from: url, to: rewritten };
                    if (input instanceof Request) {
                        return realFetch(new Request(rewritten, input), init);
                    }
                    return realFetch(rewritten, init);
                }
                return realFetch(input, init);
            };
            wrappedFetch.__PCH_REAL_FETCH__ = realFetch;
            window.fetch = wrappedFetch;
        }

        // XHR
        if (typeof window.XMLHttpRequest !== "undefined" && XMLHttpRequest?.prototype?.open) {
            const realOpen = XMLHttpRequest.prototype.open;
            const wrappedOpen = function (method, url, async, user, password) {
                const rewritten = rewriteLocalesUrl(url);
                if (rewritten) {
                    localesPatchState.rewrites += 1;
                    localesPatchState.lastRewritten = { from: url, to: rewritten };
                    return realOpen.call(this, method, rewritten, async, user, password);
                }
                return realOpen.call(this, method, url, async, user, password);
            };
            wrappedOpen.__PCH_REAL_OPEN__ = realOpen;
            XMLHttpRequest.prototype.open = wrappedOpen;
        }
    }

    installLocalesRequestRewrite();

    const requiredResources = ["QuestLine", "Town", "NPC", "Achievement", "Regions", "Route", "Gym"];
    const optionalResources = ["UI", "UIRaw", "Items", "Berry", "Badge", "Dungeon", "Underground", "GameEnums", "Stone", "Farm", "SpecialEvent", "KeyItem"];
    const resources = [...requiredResources, ...optionalResources];
    const failed = [];

    const storageKey = (resource) => `${STORAGE_PREFIX}-${resource}`;
    const storageLastModifiedKey = (resource) => `${STORAGE_PREFIX}-${resource}-lastModified`;
    const storageScriptVersionKey = `${STORAGE_PREFIX}-scriptVersion`;

    function readCache(resource) {
        const cache = localStorage.getItem(storageKey(resource));
        if (!cache) {
            console.log(LOG_PREFIX, `缓存不存在: ${resource}`);
            return null;
        }
        try {
            const parsed = JSON.parse(cache);
            if (resource === 'UI') {
                console.log(LOG_PREFIX, `从缓存读取UI:`, parsed);
                console.log(LOG_PREFIX, `UI缓存有menu字段:`, !!parsed.menu);
            }
            return parsed;
        } catch (error) {
            console.warn(LOG_PREFIX, "缓存解析失败，已清空", resource, error);
            localStorage.removeItem(storageKey(resource));
            localStorage.removeItem(storageLastModifiedKey(resource));
            return null;
        }
    }

    function writeCache(resource, json) {
        localStorage.setItem(storageKey(resource), JSON.stringify(json));
        localStorage.setItem(storageLastModifiedKey(resource), String(Date.now()));
    }

    function removeCache(resource) {
        localStorage.removeItem(storageKey(resource));
        localStorage.removeItem(storageLastModifiedKey(resource));
    }

    // 脚本更新后自动清理UI缓存，避免仍使用旧的 UI.json（默认缓存 30 天）
    try {
        const lastVersion = localStorage.getItem(storageScriptVersionKey);
        if (lastVersion !== SCRIPT_VERSION) {
            removeCache("UI");
            removeCache("UIRaw");
            localStorage.removeItem(`${STORAGE_PREFIX}-missingUIText`);
            localStorage.setItem(storageScriptVersionKey, SCRIPT_VERSION);
        }
    } catch {
        // ignore
    }

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async function waitFor(predicate, { timeoutMs = 30000, intervalMs = 200, name = "条件" } = {}) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            try {
                if (predicate()) {
                    return;
                }
            } catch {
                // ignore
            }
            await sleep(intervalMs);
        }
        throw new Error(`等待超时: ${name}`);
    }

    async function waitForGameReady() {
        await waitFor(
            () =>
                typeof Notifier !== "undefined" &&
                typeof Notifier.notify === "function" &&
                typeof $ === "function" &&
                typeof ko !== "undefined" &&
                typeof TownList !== "undefined" &&
                typeof QuestLine !== "undefined" &&
                typeof NPC !== "undefined" &&
                typeof NPCController !== "undefined" &&
                typeof GameController !== "undefined" &&
                typeof MultipleQuestsQuest !== "undefined" &&
                typeof Achievement !== "undefined" &&
                typeof AchievementHandler !== "undefined" &&
                typeof AchievementTracker !== "undefined" &&
                typeof GameConstants !== "undefined" &&
                typeof Routes !== "undefined" &&
                typeof SubRegions !== "undefined" &&
                typeof GymList !== "undefined" &&
                typeof Gym !== "undefined",
            { name: "PokeClicker 关键对象" }
        );
    }

    async function fetchWithTimeout(url, timeoutMs) {
        const timeout = +timeoutMs > 0 ? +timeoutMs : 10000;
        const hasAbortSignalTimeout = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function";
        const controller =
            !hasAbortSignalTimeout && typeof AbortController !== "undefined" ? new AbortController() : undefined;
        const signal = hasAbortSignalTimeout ? AbortSignal.timeout(timeout) : controller?.signal;

        let timerId;
        if (controller && timeout > 0) {
            timerId = setTimeout(() => controller.abort(), timeout);
        }
        try {
            return await fetch(url, {
                cache: "no-store",
                signal,
            });
        } finally {
            if (timerId) {
                clearTimeout(timerId);
            }
        }
    }

    //储存汉化文本
    const Translation = {};
    const TranslationHelper = { Translation, exporting: false };
    TranslationHelper.Locales = localesPatchState;

    const getCoreModule = () => window.PokeClickerHelper ?? window.PokeClickerHelperPlus;
    let CoreModule = getCoreModule();

    (CoreModule ?? window).TranslationHelper = TranslationHelper;
    window.TranslationHelper = TranslationHelper;
    TranslationHelper.config = {
        CDN: CoreModule?.get("TranslationHelperCDN", "GitHub", true) ?? "GitHub",
        UpdateDelay: CoreModule?.get("TranslationHelperUpdateDelay", 30, true) ?? 30,
        Timeout: CoreModule?.get("TranslationHelperTimeout", 5000, true) ?? 5000,
    };

// 引用外部资源
// CDN-jsDelivr: https://cdn.jsdelivr.net
// CDN-GitHub: https://raw.githubusercontent.com
// GIT: https://github.com/mianfeipiao123/poke-clicker-auto
const CDN = {
    jsDelivr: "https://cdn.jsdelivr.net/gh/mianfeipiao123/poke-clicker-auto@main/json/",
    GitHub: "https://raw.githubusercontent.com/mianfeipiao123/poke-clicker-auto/main/json/",
};

    const notifierReadyPromise = waitFor(
        () => typeof Notifier !== "undefined" && typeof Notifier.notify === "function",
        { name: "Notifier" }
    );
    notifierReadyPromise
        .then(() => {
            Notifier.notify({
                title: SCRIPT_TITLE,
                message: `汉化正在加载中\n此时加载存档可能导致游戏错误\n若超过1分钟此提示仍未消失，则脚本可能运行出错`,
                timeout: 600000,
            });
        })
        .catch(() => {
            // ignore
        });

    async function FetchResource(resource, force = false) {
        const now = Date.now();
        const past = +(localStorage.getItem(storageLastModifiedKey(resource)) ?? 0);
        const updateDelayDays = Number(TranslationHelper.config.UpdateDelay);
        if (
            !force &&
            (updateDelayDays < 0 || now - past <= 86400 * 1000 * (Number.isFinite(updateDelayDays) ? updateDelayDays : 30))
        ) {
            const cache = readCache(resource);
            if (cache) {
                console.log(LOG_PREFIX, "从存储获取json", resource);
                return cache;
            }
        }

        const selected = Object.prototype.hasOwnProperty.call(CDN, TranslationHelper.config.CDN)
            ? TranslationHelper.config.CDN
            : "jsDelivr";
        const baseOrder = [selected, ...Object.keys(CDN).filter((k) => k !== selected)];
        const cdnOrder =
            resource === "UI" || resource === "UIRaw"
                ? ["GitHub", ...baseOrder.filter((k) => k !== "GitHub")]
                : baseOrder;
        const errors = [];

        for (const cdn of cdnOrder) {
            const url = `${CDN[cdn]}${resource}.json?v=${encodeURIComponent(SCRIPT_VERSION)}`;
            try {
                const response = await fetchWithTimeout(url, TranslationHelper.config.Timeout);
                if (response.status !== 200) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const json = await response.json();
                console.log(LOG_PREFIX, "从CDN获取json", resource, cdn);
                writeCache(resource, json);
                return json;
            } catch (error) {
                errors.push({ cdn, url, error });
                console.warn(LOG_PREFIX, "CDN获取json失败", resource, cdn, error);
            }
        }

        const error = new Error(`获取${resource}.json失败`);
        error.errors = errors;
        throw error;
    }

    async function loadAllTranslations() {
        await Promise.all(
            resources.map(async (resource) => {
                console.log(LOG_PREFIX, `开始加载资源: ${resource}`);
                Translation[resource] = await FetchResource(resource).catch((error) => {
                    const cache = readCache(resource);
                    if (cache) {
                        console.warn(LOG_PREFIX, "fallback获取json", resource, error);
                        return cache;
                    }
                    console.warn(LOG_PREFIX, "all failed获取json", resource, error);
                    if (requiredResources.includes(resource)) {
                        failed.push(resource);
                    }
                    return {};
                });
                console.log(LOG_PREFIX, `资源加载完成: ${resource}`, Translation[resource]);
            })
        );
    }

    const translationLoadPromise = loadAllTranslations();
    await Promise.all([translationLoadPromise, waitForGameReady()]);

Translation.NPCName = Translation.NPC.NPCName ?? {};
Translation.NPCDialog = Translation.NPC.NPCDialog ?? {};
TranslationHelper._toggleRaw = ko.observable(false).extend({ boolean: null });
Object.defineProperty(TranslationHelper, "toggleRaw", {
    get() {
        return TranslationHelper._toggleRaw();
    },
    set(newValue) {
        TranslationHelper._toggleRaw(newValue);
    },
});

// 汉化城镇
Object.values(TownList).forEach((t) => {
    const name = Translation.Town[t.name];
    t.displayName = name ?? t.name;
});
// 修改城镇文本显示绑定
$('[data-bind="text: player.town.name"]').attr(
    "data-bind",
    "text: player.town[TranslationHelper.toggleRaw ? 'name' : 'displayName']"
);
$("[data-town]").each(function () {
    const name = $(this).attr("data-town");
    $(this).attr("data-town", Translation.Town[name] || name);
});

GameController.realShowMapTooltip = GameController.showMapTooltip;
GameController.showMapTooltip = function (tooltipText) {
    const translationTown = TranslationHelper.toggleRaw ? tooltipText : Translation.Town[tooltipText] ?? tooltipText;
    return this.realShowMapTooltip(translationTown);
};

// 汉化任务线
QuestLine.prototype.realAddQuest = QuestLine.prototype.addQuest;
QuestLine.prototype.addQuest = new Proxy(QuestLine.prototype.realAddQuest, {
    apply(target, questline, [quest]) {
        const name = questline.name;
        const translation = Translation.QuestLine[name];
        if (translation) {
            const description = quest.description;
            const displayDescription = translation.descriptions[description];
            if (displayDescription) {
                Object.defineProperty(quest, "description", {
                    get: () => (TranslationHelper.exporting || TranslationHelper.toggleRaw ? description : displayDescription),
                });
            }
            if (quest instanceof MultipleQuestsQuest) {
                quest.quests.forEach((q) => {
                    const description = q.description;
                    const displayDescription = translation.descriptions[description];
                    if (displayDescription) {
                        Object.defineProperty(q, "description", {
                            get: () =>
                                TranslationHelper.exporting || TranslationHelper.toggleRaw ? description : displayDescription,
                        });
                    }
                });
            }
        }

        return Reflect.apply(target, questline, [quest]);
    },
});
window.realQuestLine = QuestLine;
QuestLine = new Proxy(window.realQuestLine, {
    construct(...args) {
        const questline = Reflect.construct(...args);
        const { name, description } = questline;
        const translation = Translation.QuestLine[name];

        const displayName = translation?.name;
        const displayDescription = translation?.description[description];
        Object.defineProperty(questline, "displayName", {
            get: () => (TranslationHelper.exporting || TranslationHelper.toggleRaw ? name : displayName ?? name),
        });

        if (displayDescription) {
            Object.defineProperty(questline, "description", {
                get: () => (TranslationHelper.exporting || TranslationHelper.toggleRaw ? description : displayDescription),
            });
        }

        return questline;
    },
});

// 修改任务线文本显示绑定
$("#questLineDisplayBody knockout[data-bind='text: $data.name']").attr(
    "data-bind",
    "text: $data[TranslationHelper.toggleRaw ? 'name' : 'displayName']"
);
$("#bulletinBoardModal div.modal-body h5[data-bind='text: $data.name']").attr(
    "data-bind",
    "text: $data[TranslationHelper.toggleRaw ? 'name' : 'displayName']"
);
$('#questsModalQuestLinesPane knockout.font-weight-bold.d-block[data-bind="text: $data.name"]').each(function () {
    this.dataset.bind = "text: $data[TranslationHelper.toggleRaw ? 'name' : 'displayName']";
});

// 汉化NPC
Object.values(TownList)
    .flatMap((i) => i.npcs)
    .forEach((npc) => {
        if (!npc || "rawDialog" in npc) {
            return;
        }
        npc.displayName = Translation.NPCName[npc.name] ?? npc.name;
        npc.rawDialog = npc.dialog;
        npc.translatedDialog = npc.rawDialog?.map((d) => Translation.NPCDialog[d] ?? d);
        delete npc.dialog;
    });
Object.defineProperty(NPC.prototype, "dialog", {
    get() {
        return TranslationHelper.toggleRaw ? this.rawDialog : this.translatedDialog;
    },
});

// 修改NPC文本显示绑定
$("#townView button[data-bind='text: $data.name, click: () => NPCController.openDialog($data)']").each(function () {
    this.dataset.bind =
        "text: $data[TranslationHelper.toggleRaw ? 'name' : 'displayName'], click: () => NPCController.openDialog($data)";
});
$("#npc-modal h5").each(function () {
    this.dataset.bind = "text: $data[TranslationHelper.toggleRaw ? 'name' : 'displayName']";
});

// 汉化成就
Translation.AchievementName = Translation.Achievement.name ?? {};
Translation.AchievementDescription = Translation.Achievement.description ?? {};
Translation.AchievementHint = Translation.Achievement.hint ?? {};
Translation.AchievementNameRegs = Object.entries(Translation.Achievement.nameReg ?? {}).map(([reg, value]) => [
    new RegExp(reg),
    value,
]);
Translation.AchievementDescriptionRegs = Object.entries(Translation.Achievement.descriptionReg ?? {}).map(([reg, value]) => [
    new RegExp(reg),
    value,
]);

function formatRegex(text, reg, value) {
    const methods = {
        Town: (i) => Translation.Town[i],
        Region: (i) => Translation.Region[i],
        RegionFull: (i) => Translation.RegionFull[i],
        SubRegion: (i) => Translation.SubRegion[i],
        Route: (i) => formatRouteName(i, false),
        GymFormat: (i) => i.replace(/^ /, ""),
        GymFormatRegion: (i) => i.replace(GymRegionReg, (m) => Translation.Region[m] ?? m),
    };

    return text.replace(reg, (...args) => {
        // 动态数量捕获组
        const groups = args.slice(1, -2);

        return (
            value
                // 替换 #Method{$n}
                .replace(/#([\w/]+)\{\$(\d)}/g, (_, matcher, n) => {
                    const group = groups[n - 1];

                    const formatters = matcher.split("/").map((method) => methods[method]);
                    const formatter = formatters.find((fromatter) => fromatter(group));
                    return formatter?.(group) ?? group;
                })
                // 替换 原生$n
                .replace(/\$(\d)/g, (_, n) => {
                    return groups[n - 1] ?? "";
                })
        );
    });
}

function formatAchievement(text, type) {
    const raw = Translation["Achievement" + type][text];
    if (raw) {
        return raw;
    }
    const [reg, value] = Translation["Achievement" + type + "Regs"].find(([reg]) => reg.test(text)) ?? [];
    if (reg) {
        return formatRegex(text, reg, value);
    }

    return text;
}

window.realAchievement = Achievement;
Achievement = new Proxy(window.realAchievement, {
    construct(...args) {
        const ahievement = Reflect.construct(...args);
        const { name, _description } = ahievement;

        const displayName = formatAchievement(name, "Name");
        const displayDescription = formatAchievement(_description, "Description");

        // Achievement几乎不会被读取 直接覆盖原始值
        Object.defineProperties(ahievement, {
            name: {
                get: () => (TranslationHelper.exporting || TranslationHelper.toggleRaw ? name : displayName),
            },
            _description: {
                get: () => (TranslationHelper.exporting || TranslationHelper.toggleRaw ? _description : displayDescription),
            },
            rawName: {
                get: () => name,
            },
        });

        return ahievement;
    },
});

window.realSecretAchievement = SecretAchievement;
SecretAchievement = new Proxy(window.realSecretAchievement, {
    construct(...args) {
        const ahievement = Reflect.construct(...args);
        const { name, _description, _hint } = ahievement;

        const displayName = formatAchievement(name, "Name");
        const displayDescription = formatAchievement(_description, "Description");
        const displayHint = formatAchievement(_hint, "Hint");

        // Achievement几乎不会被读取 直接覆盖原始值
        Object.defineProperties(ahievement, {
            name: {
                get: () => (TranslationHelper.exporting || TranslationHelper.toggleRaw ? name : displayName),
            },
            _description: {
                get: () => (TranslationHelper.exporting || TranslationHelper.toggleRaw ? _description : displayDescription),
            },
            _hint: {
                get: () => (TranslationHelper.exporting || TranslationHelper.toggleRaw ? _hint : displayHint),
            },
            rawName: {
                get: () => name,
            },
        });

        return ahievement;
    },
});

AchievementHandler.findByName = function (name) {
    return AchievementHandler.achievementList.find((achievement) => achievement.rawName === name && achievement.achievable());
};
AchievementTracker.prototype.toJSON = function () {
    return {
        trackedAchievementName: this.hasTrackedAchievement() ? this.trackedAchievement().rawName : null,
    };
};

// 汉化地区
Translation.Region = Translation.Regions.Region ?? {};
Translation.RegionFull = Object.fromEntries(Object.entries(Translation.Region).map(([region, name]) => [region, name + "地区"]));
Translation.SubRegion = Object.assign(Translation.Regions.SubRegion ?? {}, Translation.RegionFull);
// 特殊处理
Object.assign(Translation.Region, { "Sevii Islands": "七之岛" });

waitFor(() => document.querySelector("[href='#mapBody'] > span"), { timeoutMs: 30000, name: "城镇地图标题" })
    .then(() => {
        $("[href='#mapBody'] > span").attr(
            "data-bind",
            "text: `${TranslationHelper.toggleRaw ? 'Town Map' : '城镇地图'} (${TranslationHelper.toggleRaw ? GameConstants.camelCaseToString(GameConstants.Region[player.region]) : (TranslationHelper.Translation.RegionFull[GameConstants.camelCaseToString(GameConstants.Region[player.region])] ?? GameConstants.camelCaseToString(GameConstants.Region[player.region]))})`"
        );
    })
    .catch((err) => console.warn("[翻译] 城镇地图标题绑定修改失败", err));

waitFor(() => document.querySelector("#subregion-travel-buttons > button.btn.btn-sm.btn-primary"), {
    timeoutMs: 30000,
    name: "副区域旅行按钮",
})
    .then(() => {
        $("#subregion-travel-buttons > button.btn.btn-sm.btn-primary").attr(
            "data-bind",
            "click: () => SubRegions.openModal(), text: `${TranslationHelper.toggleRaw ? 'Subregional Travel' : '副区域旅行'} (${TranslationHelper.toggleRaw ? (player.subregionObject()?.name ?? '') : (TranslationHelper.Translation.SubRegion[player.subregionObject()?.name] ?? player.subregionObject()?.name ?? '')})`"
        );
    })
    .catch((err) => console.warn("[翻译] 副区域旅行按钮绑定修改失败", err));

// 汉化道路
const regionRouteReg = new RegExp(`^(${Object.keys(Translation.Region).join("|")}) Route (\\d+)$`);
// 水路范围
const waterRoute = {
    Kanto: [19, 20, 21],
    Johto: [40, 41],
    Hoenn: [105, 106, 107, 109, 109, 122, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134],
    Sinnoh: [220, 223, 226, 230],
    Unova: [17, 21],
    Alola: [15],
};
function formatRouteName(routeName, returnRaw = true) {
    if (Translation.Route[routeName]) {
        return Translation.Route[routeName];
    }
    if (regionRouteReg.test(routeName)) {
        return routeName.replace(regionRouteReg, (match, region, number) => {
            const regionName = Translation.Region[region] ?? region;
            // 将数字转换为全角数字
            const formatNumber = number.replace(/\d/g, (digit) => String.fromCharCode(digit.charCodeAt(0) + 0xff10 - 0x30));
            const routeType = waterRoute[region]?.includes(+number) ? "水路" : "道路";
            return `${regionName}${formatNumber}号${routeType}`;
        });
    }
    return returnRaw ? routeName : undefined;
}

Routes.real_getName = Routes.getName;
Routes.getName = function (route, region, alwaysIncludeRegionName = false, includeSubRegionName = false) {
    if (TranslationHelper.exporting) {
        return this.real_getName(route, region, alwaysIncludeRegionName, includeSubRegionName);
    }
    const rawRegionName = GameConstants.camelCaseToString(GameConstants.Region[region]);
    const regionName = Translation.Region[rawRegionName] ?? rawRegionName;
    const regionFullName = Translation.RegionFull[rawRegionName] ?? rawRegionName;

    const resultRoute = this.regionRoutes.find((routeData) => routeData.region === region && routeData.number === route);
    let routeName = formatRouteName(resultRoute?.routeName) ?? "Unknown Route";
    if (alwaysIncludeRegionName && !routeName.includes(regionName)) {
        routeName = `${regionFullName}-${routeName}`;
    } else if (includeSubRegionName && resultRoute) {
        const subRegionName =
            Translation.SubRegion[SubRegions.getSubRegionById(region, resultRoute.subRegion ?? 0).name] ?? "Unknown SubRegion";
        if (!routeName.includes(subRegionName)) {
            routeName = `${subRegionName}-${routeName}`;
        }
    }
    return routeName;
};

// 汉化道馆
const GymRegionReg = new RegExp(`^${Object.keys(Translation.Region).join("|")}`);

Object.values(GymList).forEach((gym) => {
    const rawLeaderName = gym.leaderName;
    const leaderName = Translation.Gym[rawLeaderName] ?? rawLeaderName;
    const rawButtonText = gym.buttonText;
    const buttonText =
        gym.buttonText == rawLeaderName.replace(/\d/, "") + "'s Gym"
            ? leaderName.replace(/\d/, "") + "的道馆"
            : Translation.Gym[rawButtonText] ?? rawButtonText;

    Object.defineProperties(gym, {
        leaderName: {
            get: () => (TranslationHelper.exporting || TranslationHelper.toggleRaw ? rawLeaderName : leaderName),
        },
        buttonText: {
            get: () => (TranslationHelper.exporting || TranslationHelper.toggleRaw ? rawButtonText : buttonText),
        },
        displayName: {
            get: () => (TranslationHelper.exporting || TranslationHelper.toggleRaw ? rawButtonText : buttonText),
        },
        rawButtonText: {
            get: () => rawButtonText,
        },
        rawLeaderName: {
            get: () => rawLeaderName,
        },
    });
});

Object.defineProperty(Gym.prototype, "imagePath", {
    get() {
        return `assets/images/npcs/${this.imageName ?? this.rawLeaderName}.png`;
    },
});

// ========== 物品翻译 ==========
function translateItems() {
    if (!Translation.Items) return;

    // 合并所有分类的翻译
    const allItems = {};
    Object.values(Translation.Items).forEach(category => {
        if (typeof category === 'object') {
            Object.assign(allItems, category);
        }
    });

    Object.entries(ItemList).forEach(([key, item]) => {
        if (!item || item._translationApplied) return;

        const rawDisplayName = item.displayName;
        const translatedName = allItems[key] || allItems[rawDisplayName];

        if (translatedName) {
            Object.defineProperty(item, 'displayName', {
                get: () => TranslationHelper.toggleRaw ? rawDisplayName : translatedName,
                configurable: true
            });
            item._translationApplied = true;
        }
    });
}

// ========== 浆果翻译 ==========
function translateBerries() {
    if (!Translation.Berry) return;

    // 创建浆果显示名称获取函数
    window.getBerryDisplayName = (berryType) => {
        const name = typeof berryType === 'number' ? BerryType[berryType] : berryType;
        return TranslationHelper.toggleRaw ? name : (Translation.Berry[name] || name);
    };

    // 修改浆果图鉴模态框中的浆果名称绑定
    waitFor(() => document.querySelector('#berryDexModal'), { timeoutMs: 30000 }).then(() => {
        $('#berryDexModal h5[data-bind="text: BerryType[$data]"]').attr(
            'data-bind', 'text: getBerryDisplayName($data)'
        );
        console.log('[翻译] 浆果图鉴DOM绑定已修改');
    }).catch(err => {
        console.warn('[翻译] 浆果图鉴DOM绑定修改失败', err);
    });

    // 修改农场显示中的浆果名称
    waitFor(() => document.querySelector('#farmDisplay'), { timeoutMs: 30000 }).then(() => {
        $('knockout[data-bind="text: BerryType[$data]"]').attr(
            'data-bind', 'text: getBerryDisplayName($data)'
        );
        console.log('[翻译] 农场浆果名称DOM绑定已修改');
    }).catch(err => {
        console.warn('[翻译] 农场浆果名称DOM绑定修改失败', err);
    });
}

// ========== 徽章翻译 ==========
function translateBadges() {
    if (!Translation.Badge) return;

    // 合并所有地区的徽章翻译
    const allBadges = {};
    Object.values(Translation.Badge).forEach(region => {
        if (typeof region === 'object') {
            Object.assign(allBadges, region);
        }
    });

    // 创建徽章显示名称获取函数
    window.getBadgeDisplayName = (badge) => {
        const badgeName = typeof badge === 'number' ? BadgeEnums[badge] : badge;
        return TranslationHelper.toggleRaw ? badgeName : (allBadges[badgeName] || badgeName);
    };

    // 创建地区名称翻译函数
    window.getRegionDisplayName = (region) => {
        if (TranslationHelper.toggleRaw) return region;
        return Translation.Regions?.Region?.[region] || region;
    };

    // 等待徽章盒模态框加载后修改DOM绑定
    waitFor(() => document.querySelector('#badgeCaseModal'), { timeoutMs: 30000 }).then(() => {
        // 修改地区名称绑定
        $('#badgeCaseModal h4[data-bind="text: $data[0]"]').attr(
            'data-bind', 'text: getRegionDisplayName($data[0])'
        );
        // 修改徽章名称绑定
        $('#badgeCaseModal p[data-bind="text: $data.replace(/_/g, \' \')"]').attr(
            'data-bind', 'text: getBadgeDisplayName($data)'
        );
        console.log('[翻译] 徽章盒DOM绑定已修改');
    }).catch(err => {
        console.warn('[翻译] 徽章盒DOM绑定修改失败', err);
    });
}

// ========== 地下城翻译 ==========
function translateDungeons() {
    // 合并所有地区的地下城翻译
    const allDungeons = {};
    if (Translation.Dungeon) {
        Object.values(Translation.Dungeon).forEach((region) => {
            if (typeof region === 'object') {
                Object.assign(allDungeons, region);
            }
        });
    }

    // 创建地下城显示名称获取函数（优先 Dungeon.json，其次 Town.json）
    window.getDungeonDisplayName = (dungeonName) => {
        if (TranslationHelper.toggleRaw) return dungeonName;
        return allDungeons[dungeonName] || Translation.Town?.[dungeonName] || dungeonName;
    };

    // 为 dungeonList 补充可用于其他脚本/调试的 displayName（不修改 name，避免破坏游戏逻辑）
    if (typeof dungeonList !== 'undefined') {
        Object.values(dungeonList).forEach((dungeon) => {
            if (!dungeon || dungeon._translationApplied) return;

            const rawName = dungeon.name;
            const translatedName = allDungeons[rawName] || Translation.Town?.[rawName];
            if (translatedName) {
                Object.defineProperty(dungeon, 'displayName', {
                    get: () => (TranslationHelper.toggleRaw ? rawName : translatedName),
                    configurable: true,
                });
            } else {
                Object.defineProperty(dungeon, 'displayName', {
                    get: () => rawName,
                    configurable: true,
                });
            }
            dungeon._translationApplied = true;
        });
    }

    // 修复UI中仍使用 dungeon.name 的绑定
    waitFor(() => document.querySelector('knockout[data-bind="text: DungeonRunner.dungeon.name"]'), { timeoutMs: 30000, name: '地下城名称' })
        .then(() => {
            $('knockout[data-bind="text: DungeonRunner.dungeon.name"]').attr(
                'data-bind',
                'text: getDungeonDisplayName(DungeonRunner.dungeon.name)'
            );
            console.log('[翻译] 地下城名称DOM绑定已修改');
        })
        .catch((err) => {
            console.warn('[翻译] 地下城名称DOM绑定修改失败', err);
        });

    // 修复地下城界面的通关次数文字（Clears）
    waitFor(() => document.querySelector('knockout[data-bind*="dungeonsCleared[GameConstants.getDungeonIndex(DungeonRunner.dungeon.name)]"]'), { timeoutMs: 30000, name: '地下城通关次数' })
        .then(() => {
            $('knockout[data-bind*="dungeonsCleared[GameConstants.getDungeonIndex(DungeonRunner.dungeon.name)]"]').attr(
                'data-bind',
                "text: `${App.game.statistics.dungeonsCleared[GameConstants.getDungeonIndex(DungeonRunner.dungeon.name)]().toLocaleString('en-US')} ${TranslationHelper.toggleRaw ? 'Clears' : '次通关'}`"
            );
            console.log('[翻译] 地下城通关次数DOM绑定已修改');
        })
        .catch((err) => {
            console.warn('[翻译] 地下城通关次数DOM绑定修改失败', err);
        });
}

// ========== 地下物品翻译 ==========
function translateUndergroundItems() {
    if (!Translation.Underground) return;

    // 合并所有分类的翻译
    const allUnderground = {};
    Object.values(Translation.Underground).forEach(category => {
        if (typeof category === 'object') {
            Object.assign(allUnderground, category);
        }
    });

    // 创建地下物品显示名称获取函数
    window.getUndergroundItemDisplayName = (itemName) => {
        return TranslationHelper.toggleRaw ? itemName : (allUnderground[itemName] || itemName);
    };

    // 修改地下物品的displayName属性
    if (typeof UndergroundItems !== 'undefined' && UndergroundItems.list) {
        UndergroundItems.list.forEach(item => {
            const translation = allUnderground[item.name];
            if (translation) {
                const rawName = item.displayName || item.name;
                Object.defineProperty(item, 'displayName', {
                    get: () => TranslationHelper.toggleRaw ? rawName : translation,
                    configurable: true
                });
            }
        });
        console.log('[翻译] 地下物品displayName属性已修改');
    }

    // 修改背包/商店等 ItemList 中地下物品的 displayName
    if (typeof ItemList !== 'undefined') {
        Object.entries(ItemList).forEach(([key, item]) => {
            if (!item || item._undergroundTranslationApplied) return;

            const translation = allUnderground[key];
            if (!translation) return;

            const rawName = item.displayName;
            Object.defineProperty(item, 'displayName', {
                get: () => TranslationHelper.toggleRaw ? rawName : translation,
                configurable: true
            });
            item._undergroundTranslationApplied = true;
        });
        console.log('[翻译] 地下物品ItemList displayName属性已修改');
    }
}

// 执行新增翻译
translateItems();
translateBerries();
translateBadges();
translateDungeons();
translateUndergroundItems();

// ========== 游戏枚举翻译 ==========
function translateGameEnums() {
    if (!Translation.GameEnums) return;

    // 宝可梦属性类型翻译
    window.getPokemonTypeDisplayName = (type) => {
        const name = typeof type === 'number' ? PokemonType[type] : type;
        return TranslationHelper.toggleRaw ? name : (Translation.GameEnums.pokemonType?.[name] || name);
    };

    // 天气类型翻译
    window.getWeatherDisplayName = (weather) => {
        const name = typeof weather === 'number' ? WeatherType[weather] : weather;
        return TranslationHelper.toggleRaw ? name : (Translation.GameEnums.weatherType?.[name] || name);
    };

    // 货币类型翻译
    window.getCurrencyDisplayName = (currency) => {
        const name = typeof currency === 'number' ? GameConstants.Currency[currency] : currency;
        return TranslationHelper.toggleRaw ? name : (Translation.GameEnums.currency?.[name] || name);
    };
}

// ========== 进化石翻译 ==========
function translateStones() {
    if (!Translation.Stone) return;

    const getStoneTranslation = (stone) => {
        if (!stone) return undefined;
        return Translation.Stone.evolutionStone?.[stone]
            || Translation.Stone.megaStone?.[stone]
            || Translation.Stone.zCrystal?.[stone]
            // 兼容 Z 纯晶的 key（游戏里是 "Normalium Z"，旧数据可能是 "Normalium_Z"）
            || Translation.Stone.zCrystal?.[String(stone).replace(/ /g, '_')]
            || Translation.Stone.zCrystal?.[String(stone).replace(/_/g, ' ')];
    };

    window.getStoneDisplayName = (stone) => {
        if (TranslationHelper.toggleRaw) return stone;
        return getStoneTranslation(stone) || stone;
    };

    // 直接修改 ItemList 中相关道具的 displayName（进化石/超级石/Z纯晶）
    if (typeof ItemList !== 'undefined') {
        Object.entries(ItemList).forEach(([key, item]) => {
            if (!item || item._stoneTranslationApplied) return;

            const translation = getStoneTranslation(key) || getStoneTranslation(item.displayName);
            if (!translation) return;

            const rawName = item.displayName;
            Object.defineProperty(item, 'displayName', {
                get: () => TranslationHelper.toggleRaw ? rawName : translation,
                configurable: true
            });
            item._stoneTranslationApplied = true;
        });
        console.log('[翻译] 进化石/超级石/Z纯晶 displayName属性已修改');
    }
}

// ========== 农场翻译 ==========
function translateFarm() {
    if (!Translation.Farm) return;

    window.getFarmToolDisplayName = (tool) => {
        const name = typeof tool === 'number' ? FarmingTool[tool] : tool;
        return TranslationHelper.toggleRaw ? name : (Translation.Farm.farmingTool?.[name] || name);
    };

    window.getPlotStageDisplayName = (stage) => {
        const name = typeof stage === 'number' ? PlotStage[stage] : stage;
        return TranslationHelper.toggleRaw ? name : (Translation.Farm.plotStage?.[name] || name);
    };

    window.getAuraDisplayName = (aura) => {
        const name = typeof aura === 'number' ? AuraType[aura] : aura;
        return TranslationHelper.toggleRaw ? name : (Translation.Farm.auraType?.[name] || name);
    };
}

// ========== 特殊事件翻译 ==========
function translateSpecialEvents() {
    if (!Translation.SpecialEvent?.events) return;

    window.getSpecialEventDisplayName = (eventName) => {
        return TranslationHelper.toggleRaw ? eventName : (Translation.SpecialEvent.events[eventName] || eventName);
    };
}

// ========== 关键物品翻译 ==========
function translateKeyItems() {
    if (!Translation.KeyItem) return;

    window.getKeyItemDisplayName = (item) => {
        const name = typeof item === 'number' ? KeyItemType[item] : item;
        return TranslationHelper.toggleRaw ? name : (Translation.KeyItem.keyItem?.[name] || name);
    };

    window.getOakItemDisplayName = (item) => {
        const name = typeof item === 'number' ? OakItemType[item] : item;
        return TranslationHelper.toggleRaw ? name : (Translation.KeyItem.oakItem?.[name] || name);
    };

    // 修改KeyItems的displayName
    if (typeof KeyItems !== 'undefined' && KeyItems.list) {
        Object.values(KeyItems.list).forEach(item => {
            const name = KeyItemType[item.id];
            const translation = Translation.KeyItem.keyItem?.[name];
            if (translation) {
                const rawName = item.displayName;
                Object.defineProperty(item, 'displayName', {
                    get: () => TranslationHelper.toggleRaw ? rawName : translation,
                    configurable: true
                });
            }
        });
        console.log('[翻译] KeyItems displayName属性已修改');
    }

    // 修改OakItems的displayName（需要等待游戏加载）
    waitFor(() => App?.game?.oakItems?.itemList, { timeoutMs: 30000 }).then(() => {
        App.game.oakItems.itemList.forEach(item => {
            const name = OakItemType[item.id];
            const translation = Translation.KeyItem.oakItem?.[name];
            if (translation) {
                const rawName = item.displayName;
                Object.defineProperty(item, 'displayName', {
                    get: () => TranslationHelper.toggleRaw ? rawName : translation,
                    configurable: true
                });
            }
        });
        console.log('[翻译] OakItems displayName属性已修改');
    }).catch(err => {
        console.warn('[翻译] OakItems displayName修改失败', err);
    });
}

// 执行新增翻译
translateGameEnums();
translateStones();
translateFarm();
translateSpecialEvents();
translateKeyItems();

// ========== UI界面翻译 ==========
// UI翻译数据从CDN加载（Translation.UI）

// 辅助函数：获取嵌套对象的值
function getNestedValue(obj, path) {
    if (!obj || !path) return undefined;
    return path.split('.').reduce((current, key) => current?.[key], obj);
}

// 静态UI文本翻译
function translateStaticUI() {
    console.log('[UI翻译] 开始执行translateStaticUI');
    console.log('[UI翻译] Translation.UI:', Translation.UI);
    console.log('[UI翻译] Translation.UI.menu:', Translation.UI?.menu);
    if (!Translation.UI) {
        console.log('[UI翻译] Translation.UI不存在，退出');
        return;
    }
    if (!Translation.UI.menu) {
        console.log('[UI翻译] Translation.UI.menu不存在，退出');
        return;
    }

    // 主菜单按钮
    const menuButton = document.querySelector('#startMenu .dropdown-toggle');
    console.log('[UI翻译] 主菜单按钮:', menuButton);
    if (menuButton && Translation.UI.menu?.['Start Menu']) {
        const textNode = Array.from(menuButton.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
        if (textNode) {
            textNode.textContent = Translation.UI.menu['Start Menu'] + '\n';
            console.log('[UI翻译] 主菜单按钮翻译成功');
        }
    }

    // 主菜单项
    const menuItems = document.querySelectorAll('#startMenu .dropdown-item');
    console.log('[UI翻译] 主菜单项数量:', menuItems.length);
    menuItems.forEach(el => {
        const text = el.textContent.trim();
        const translation = Translation.UI.menu?.[text];
        if (translation) {
            el.textContent = translation;
        }
    });
    console.log('[UI翻译] translateStaticUI执行完成');

    // 设置标签页
    document.querySelectorAll('#settingsModal .nav-link').forEach(el => {
        const text = el.textContent.trim();
        const translation = Translation.UI.settings?.tabs?.[text];
        if (translation) {
            el.textContent = translation;
        }
    });

    // 设置分组标题
    document.querySelectorAll('#settingsModal thead th').forEach(el => {
        const text = el.textContent.trim();
        const translation = Translation.UI.settings?.sections?.[text];
        if (translation) {
            el.textContent = translation;
        }
    });
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const FallbackUIText = {
    Next: "下一步",
    "Professor Oak": "大木博士",
    "Hello, there! Welcome to the world of Pokémon!": "你好！欢迎来到宝可梦的世界！",
    "My name is Oak. People affectionately refer to me as the Pokémon Professor.": "我叫大木。人们亲切地称我为宝可梦博士。",
    "This world is inhabited by creatures called Pokémon!": "这个世界居住着一种名为宝可梦的生物！",
    "For some people, Pokémon are pets. Other use them for battling.": "有的人把宝可梦当作伙伴，也有人用它们进行对战。",
    "As for myself… I study Pokémon as a profession.": "至于我……我的职业是研究宝可梦。",
    "As for myself... I study Pokémon as a profession.": "至于我……我的职业是研究宝可梦。",
    "However, your very own Pokémon legend is about to unfold!": "而你专属的宝可梦传奇，即将展开！",
    "A world of dreams and adventures with Pokémon awaits! Let's go!": "充满梦想与冒险的宝可梦世界在等着你！出发吧！",
    "on now!": "正在进行！",
    "Start time:": "开始时间：",
    "End time:": "结束时间：",
    "Encounter Santa Snorlax roaming the regions and Reindeer Stantler in Johto, discover the mystical creatures of Ilex Forest, Seafoam Islands and Sandgem Town or party at Bill's House.":
        "在各地区邂逅游走的圣诞老人卡比兽，并在城都地区遇到驯鹿惊角鹿；探索桧皮森林、双子岛、随意镇的神秘生物，或前往比尔的小屋参加派对。",
};

const missingUIText = new Set();
const missingUITextStorageKey = `${STORAGE_PREFIX}-missingUIText`;

function shouldRecordMissingUIText(text) {
    if (!text) return false;
    if (!/[A-Za-z]/.test(text)) return false;
    if (text.length > 200) return false;
    return true;
}

function recordMissingUIText(text) {
    if (!shouldRecordMissingUIText(text)) return;
    if (missingUIText.size >= 5000) return;
    missingUIText.add(text);
    try {
        localStorage.setItem(missingUITextStorageKey, JSON.stringify(Array.from(missingUIText)));
    } catch {
        // ignore
    }
}

function loadMissingUITextCache() {
    try {
        const raw = localStorage.getItem(missingUITextStorageKey);
        if (!raw) return;
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
            list.forEach((item) => {
                if (typeof item === "string") {
                    missingUIText.add(item);
                }
            });
        }
    } catch {
        // ignore
    }
}

function downloadTextFile(filename, content) {
    const blob = new Blob([content], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

window.PCHExportMissingUIText = () => {
    const entries = Array.from(missingUIText).sort();
    const json = Object.fromEntries(entries.map((key) => [key, ""]));
    downloadTextFile(`PokeClicker-missing-ui-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(json, null, 2));
};

loadMissingUITextCache();

function normalizeUITextKey(text) {
    return String(text)
        .replace(/\u00a0/g, " ")
        .replace(/\u200b/g, "")
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/\u2026/g, "...")
        .replace(/\s+/g, " ")
        .trim();
}

function getUITextCandidates(text) {
    const candidates = [];
    const push = (value) => {
        if (!value) return;
        const str = String(value);
        if (!str) return;
        if (!candidates.includes(str)) candidates.push(str);
    };

    push(text);
    const normalized = normalizeUITextKey(text);
    push(normalized);
    // 兼容 … / ...
    push(normalized.replace(/\.{3}/g, "…"));
    push(String(text).replace(/\u2026/g, "..."));
    push(String(text).replace(/\.{3}/g, "…"));
    return candidates;
}

function translateDurationAbbr(text) {
    const match = String(text).trim().match(
        /^(?:(\d{1,2})w\s*)?(?:(\d{1,2})d\s*)?(?:(\d{1,2})h\s*)?(?:(\d{1,2})m\s*)?(?:(\d{1,2})s\s*)?$/
    );
    if (!match) return undefined;
    if (!match[1] && !match[2] && !match[3] && !match[4] && !match[5]) return undefined;

    const parts = [];
    if (match[1] != null) parts.push(`${match[1]}周`);
    if (match[2] != null) parts.push(`${match[2]}天`);
    if (match[3] != null) parts.push(`${match[3]}小时`);
    if (match[4] != null) parts.push(`${match[4]}分`);
    if (match[5] != null) parts.push(`${match[5]}秒`);
    return parts.join(" ");
}

function translateUIPattern(text) {
    const key = String(text).trim();
    if (!key) return undefined;

    const bonusMatch = key.match(/^\+(\d+)% Bonus to (.+?) for (\d+) seconds$/i);
    if (bonusMatch) {
        const percent = bonusMatch[1];
        const target = bonusMatch[2].trim();
        const seconds = bonusMatch[3];

        const targetMap = {
            "Dungeon Tokens gained": "地牢代币获取量",
            "Pokédollars gained": "宝可币获取量",
            "Pokémon attack": "宝可梦攻击",
            "click attack": "点击攻击",
            "experience gained": "经验获取量",
        };
        const targetZh = targetMap[target] ?? target;
        return `+${percent}% ${targetZh}（持续 ${seconds} 秒）`;
    }

    const lootBonusMatch = key.match(
        /^Increases chance for Pokémon to drop rare hold items and chance to multiply loot from dungeon chests, for (\d+) seconds\.$/i
    );
    if (lootBonusMatch) {
        const seconds = lootBonusMatch[1];
        return `增加宝可梦掉落稀有携带道具的概率，并提高地牢宝箱战利品倍增的概率（持续 ${seconds} 秒）。`;
    }

    if (/^See the Pokémon available on this route\.$/i.test(key)) {
        return "查看此道路可出现的宝可梦。";
    }

    const leftMatch = key.match(/^(.+?) left$/i);
    if (leftMatch) {
        const remaining = leftMatch[1].trim();
        const duration = translateDurationAbbr(remaining);
        return `剩余 ${duration ?? remaining}`;
    }

    const catchMatch = key.match(/^(\+)?(\d+)% chance to catch$/i);
    if (catchMatch) {
        const sign = catchMatch[1] ? "+" : "";
        return `捕获率 ${sign}${catchMatch[2]}%`;
    }

    const fasterMatch = key.match(/^(\d+)% faster\.$/i);
    if (fasterMatch) {
        return `速度提高 ${fasterMatch[1]}%。`;
    }

    const clearsMatch = key.match(/^(\d+) clears$/i);
    if (clearsMatch) {
        return `${clearsMatch[1]} 次通关`;
    }

    const slotsMatch = key.match(/^(\d+) slots?$/i);
    if (slotsMatch) {
        return `${slotsMatch[1]} 个槽位`;
    }

    const damageMatch = key.match(/^([0-9.]+)x Damage$/i);
    if (damageMatch) {
        return `${damageMatch[1]} 倍伤害`;
    }

    const evMatch = key.match(/^([0-9.,]+)\s*EVs?$/i);
    if (evMatch) {
        return `${evMatch[1]} 努力值`;
    }

    const duration = translateDurationAbbr(key);
    if (duration) {
        return duration;
    }

    return undefined;
}

function getUITranslation(text) {
    if (!text) return undefined;
    const ui = Translation?.UI;
    const raw = Translation?.UIRaw;
    for (const key of getUITextCandidates(text)) {
        const pattern = translateUIPattern(key);
        if (pattern) {
            return pattern;
        }
        const translation =
            ui?.buttons?.[key] ||
            ui?.labels?.[key] ||
            ui?.modals?.[key] ||
            ui?.menu?.[key] ||
            ui?.settings?.tabs?.[key] ||
            ui?.settings?.sections?.[key] ||
            ui?.pokedex?.[key] ||
            ui?.pokemon?.[key] ||
            ui?.shop?.[key] ||
            raw?.[key] ||
            FallbackUIText[key];
        if (translation) {
            return translation;
        }
    }
    return undefined;
}

function translateLeafUIElement(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
    if (el.childElementCount > 0) return;

    const currentText = el.textContent;
    const currentTrimmed = currentText.trim();
    if (!currentTrimmed) return;

    if (TranslationHelper.toggleRaw && el.dataset.pchUiRaw != null) {
        el.textContent = el.dataset.pchUiRaw;
        return;
    }

    // 动态计数：Quests (0/4)
    const questsLabel = Translation?.UI?.labels?.Quests || '任务';
    if (!TranslationHelper.toggleRaw) {
        const match = currentTrimmed.match(/^Quests \((\d+)\/(\d+)\)$/);
        if (match) {
            el.textContent = `${questsLabel} (${match[1]}/${match[2]})`;
            return;
        }
    } else {
        const match = currentTrimmed.match(new RegExp(`^${escapeRegExp(questsLabel)} \\((\\d+)\\/(\\d+)\\)$`));
        if (match) {
            el.textContent = `Quests (${match[1]}/${match[2]})`;
            return;
        }
    }

    const rawText = el.dataset.pchUiRaw ?? currentText;
    const rawTrimmed = rawText.trim();

    if (!TranslationHelper.toggleRaw) {
        const eventMatch = rawTrimmed.match(/^\[EVENT\]\s*(.+)$/);
        if (eventMatch) {
            const eventTitle = eventMatch[1].trim();
            const translatedTitle =
                Translation?.SpecialEvent?.events?.[eventTitle] || getUITranslation(eventTitle) || eventTitle;
            if (el.dataset.pchUiRaw == null) {
                el.dataset.pchUiRaw = currentText;
            }
            el.textContent = el.dataset.pchUiRaw.replace(rawTrimmed, `[活动] ${translatedTitle}`);
            return;
        }

        const startsInMatch = rawTrimmed.match(/^starts in (.+)!$/);
        if (startsInMatch) {
            if (el.dataset.pchUiRaw == null) {
                el.dataset.pchUiRaw = currentText;
            }
            el.textContent = el.dataset.pchUiRaw.replace(rawTrimmed, `距离开始：${startsInMatch[1]}!`);
            return;
        }

        const endsInMatch = rawTrimmed.match(/^ends in (.+)!$/);
        if (endsInMatch) {
            if (el.dataset.pchUiRaw == null) {
                el.dataset.pchUiRaw = currentText;
            }
            el.textContent = el.dataset.pchUiRaw.replace(rawTrimmed, `距离结束：${endsInMatch[1]}!`);
            return;
        }

        if (rawTrimmed === 'just ended!') {
            if (el.dataset.pchUiRaw == null) {
                el.dataset.pchUiRaw = currentText;
            }
            el.textContent = el.dataset.pchUiRaw.replace(rawTrimmed, '刚刚结束！');
            return;
        }
    }

    const translation = getUITranslation(rawTrimmed);
    if (!translation) {
        if (!TranslationHelper.toggleRaw) {
            recordMissingUIText(normalizeUITextKey(rawTrimmed));
        }
        return;
    }

    if (el.dataset.pchUiRaw == null) {
        el.dataset.pchUiRaw = currentText;
    }
    el.textContent = TranslationHelper.toggleRaw ? el.dataset.pchUiRaw : el.dataset.pchUiRaw.replace(rawTrimmed, translation);
}

const uiTextNodeRaw = new WeakMap();

function translateUITextNode(textNode) {
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;
    const parent = textNode.parentElement;
    if (!parent) return;

    // 仅处理“包含子元素”的节点（例如带 <br> / <strong> 的文本容器），避免和元素级翻译冲突
    if (parent.childElementCount === 0) return;

    const storedRaw = uiTextNodeRaw.get(textNode);
    const rawText = storedRaw ?? textNode.textContent;
    const rawTrimmed = rawText.trim();
    if (!rawTrimmed) return;

    if (TranslationHelper.toggleRaw) {
        if (storedRaw != null && textNode.textContent !== storedRaw) {
            textNode.textContent = storedRaw;
        }
        return;
    }

    let translation = getUITranslation(rawTrimmed);
    if (!translation) {
        const eventMatch = rawTrimmed.match(/^\[EVENT\]\s*(.+)$/);
        if (eventMatch) {
            const eventTitle = eventMatch[1].trim();
            const translatedTitle =
                Translation?.SpecialEvent?.events?.[eventTitle] || getUITranslation(eventTitle) || eventTitle;
            translation = `[活动] ${translatedTitle}`;
        }
    }

    if (!translation) {
        const startsInMatch = rawTrimmed.match(/^starts in (.+)!$/);
        if (startsInMatch) {
            translation = `距离开始：${startsInMatch[1]}!`;
        }
    }

    if (!translation) {
        const endsInMatch = rawTrimmed.match(/^ends in (.+)!$/);
        if (endsInMatch) {
            translation = `距离结束：${endsInMatch[1]}!`;
        }
    }

    if (!translation && rawTrimmed === 'just ended!') {
        translation = '刚刚结束！';
    }

    if (!translation) {
        recordMissingUIText(normalizeUITextKey(rawTrimmed));
        return;
    }

    if (storedRaw == null) {
        uiTextNodeRaw.set(textNode, rawText);
    }
    textNode.textContent = rawText.replace(rawTrimmed, translation);
}

function translateUIComplexTextNodes(scope) {
    if (!scope || scope.nodeType !== Node.ELEMENT_NODE) return;

    const walker = document.createTreeWalker(
        scope,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: (node) => {
                const parent = node?.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                const tag = parent.tagName;
                if (tag === 'SCRIPT' || tag === 'STYLE') return NodeFilter.FILTER_REJECT;
                if (parent.childElementCount === 0) return NodeFilter.FILTER_REJECT;
                if (!node.textContent || !node.textContent.trim()) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            },
        },
        false
    );

    while (walker.nextNode()) {
        translateUITextNode(walker.currentNode);
    }
}

function translateUIRoot(root) {
    if (!Translation?.UI || !root) return;
    const scope = root.nodeType === Node.ELEMENT_NODE ? root : root?.documentElement;
    if (!scope || scope.nodeType !== Node.ELEMENT_NODE) return;

    scope.querySelectorAll('span, button, a, p, div, label, th, td, h1, h2, h3, h4, h5, h6, code').forEach((el) => {
        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
        translateLeafUIElement(el);
    });
    translateUIComplexTextNodes(scope);
}

function translateStartSequenceModal() {
    const modal = document.querySelector('#startSequenceModal');
    if (!modal) return;

    modal.querySelectorAll('h5.modal-title, .modal-body p, .modal-footer button').forEach((el) => {
        if (!el || el.nodeType !== Node.ELEMENT_NODE) return;

        // 直接翻译标题/按钮
        if (el.childElementCount === 0) {
            translateLeafUIElement(el);
            return;
        }

        // 翻译包含 <br> 的段落：逐个 textNode 替换
        el.childNodes.forEach((node) => {
            if (node.nodeType !== Node.TEXT_NODE) return;
            translateUITextNode(node);
        });
    });
}

function setupQuestCountAutoTranslate() {
    const spans = Array.from(document.querySelectorAll('span[data-bind]')).filter((span) => {
        const bind = span.getAttribute('data-bind') || '';
        return bind.includes('Quests (') && bind.includes('currentQuests()') && bind.includes('questSlots()');
    });

    spans.forEach((span) => {
        if (span.__pchQuestCountObserver) {
            translateLeafUIElement(span);
            return;
        }
        const observer = new MutationObserver(() => translateLeafUIElement(span));
        observer.observe(span, { characterData: true, childList: true, subtree: true });
        span.__pchQuestCountObserver = observer;
        translateLeafUIElement(span);
    });
}

function setupUIAutoTranslation() {
    if (setupUIAutoTranslation._installed) return;
    setupUIAutoTranslation._installed = true;

    // 初始扫一遍
    translateUIRoot(document.body);
    setupQuestCountAutoTranslate();
    translateStartSequenceModal();

    const pending = new Set();
    let scheduled = false;
    const flush = () => {
        scheduled = false;
        pending.forEach((node) => translateUIRoot(node));
        pending.clear();
        setupQuestCountAutoTranslate();
        translateStartSequenceModal();
    };

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    pending.add(node);
                }
            }
        }
        if (!scheduled) {
            scheduled = true;
            setTimeout(flush, 0);
        }
    });

    waitFor(() => document.body, { timeoutMs: 30000, name: 'document.body' })
        .then(() => observer.observe(document.body, { childList: true, subtree: true }))
        .catch(() => {
            // ignore
        });

    // 切换原文/汉化时，重新应用 UI 文本
    TranslationHelper._toggleRaw?.subscribe?.(() => {
        translateUIRoot(document.body);
        setupQuestCountAutoTranslate();
        translateStartSequenceModal();
    });
}

// 模态框翻译
function translateModalContent(modal) {
    if (!Translation.UI || !modal) return;

    // 翻译标题
    const title = modal.querySelector('.modal-title');
    if (title) {
        const text = title.textContent.trim();
        const translation = Translation.UI.modals?.[text];
        if (translation) {
            title.textContent = translation;
        }
    }

    // 翻译标签页
    modal.querySelectorAll('.nav-link').forEach(el => {
        const text = el.textContent.trim();
        const translation = Translation.UI.settings?.tabs?.[text]
            || Translation.UI.labels?.[text];
        if (translation) {
            el.textContent = translation;
        }
    });

    // 翻译表头
    modal.querySelectorAll('thead th').forEach(el => {
        const text = el.textContent.trim();
        const translation = Translation.UI.settings?.sections?.[text]
            || Translation.UI.labels?.[text];
        if (translation) {
            el.textContent = translation;
        }
    });

    // 翻译按钮
    modal.querySelectorAll('.btn').forEach(btn => {
        const text = btn.textContent.trim();
        const translation = Translation.UI.buttons?.[text];
        if (translation) {
            btn.textContent = translation;
        }
    });

    // 翻译标签文本
    modal.querySelectorAll('label, .form-label').forEach(el => {
        const text = el.textContent.trim();
        const translation = Translation.UI.labels?.[text];
        if (translation) {
            el.textContent = translation;
        }
    });
}

// 设置模态框事件监听
function setupModalTranslation() {
    $(document).on('show.bs.modal', '.modal', function() {
        const modal = this;
        if (modal.dataset.uiTranslated) return;
        translateModalContent(modal);
        modal.dataset.uiTranslated = 'true';
    });
}

// 导出完整json方法
TranslationHelper.ExportTranslation = TranslationHelper.ExportTranslation ?? {};
TranslationHelper.ExportTranslation.QuestLine = function () {
    TranslationHelper.exporting = true;
    const json = App.game.quests.questLines().reduce((obj, questline) => {
        const { name, _description } = questline;
        const translation = Translation.QuestLine[name];
        const subObj = {};
        subObj.name = translation?.name ?? "";
        subObj.description = { [_description]: translation?.description[_description] ?? "" };
        subObj.descriptions = questline.quests().reduce((d, q) => {
            const description = q.customDescription ?? q.description;
            d[description] = translation?.descriptions[description] ?? "";
            if (q instanceof MultipleQuestsQuest) {
                q.quests.forEach((qq) => {
                    const description = qq.customDescription ?? qq.description;
                    d[description] = translation?.descriptions[description] ?? "";
                });
            }
            return d;
        }, {});
        obj[name] = subObj;
        return obj;
    }, {});
    TranslationHelper.exporting = false;
    return json;
};

TranslationHelper.ExportTranslation.NPC_format = function () {
    const toggleRaw = TranslationHelper.toggleRaw;
    TranslationHelper.toggleRaw = true;
    const json = Object.values(TownList).reduce((obj, town) => {
        const npcs = town.npcs;
        if (npcs?.length > 0) {
            obj[town.name] = npcs.map((npc) => {
                const subObj = {
                    name: { [npc.name]: Translation.NPCName[npc.name] ?? "" },
                };
                if (npc.dialog?.length > 0) {
                    subObj.dialog = Object.fromEntries(npc.dialog.map((d) => [d, Translation.NPCDialog[d] ?? ""]));
                }
                return subObj;
            });
        }
        return obj;
    }, {});
    TranslationHelper.toggleRaw = toggleRaw;
    return json;
};

TranslationHelper.ExportTranslation.NPC = function (override) {
    const NPC_format = override || this.NPC_format();
    const NPCDialog = Object.assign(
        {},
        ...Object.values(NPC_format)
            .flat()
            .map((i) => i.dialog)
            .filter((i) => i)
    );
    const NPCName = Object.assign(
        {},
        ...Object.values(NPC_format)
            .flat()
            .map((i) => i.name)
            .filter((i) => i)
    );
    const json = {
        NPCName,
        NPCDialog,
    };
    return json;
};

TranslationHelper.ExportTranslation.Town = function () {
    TranslationHelper.exporting = true;
    const json = Object.fromEntries(
        Object.keys(TownList).map((townName) => {
            return [townName, Translation.Town[townName] ?? ""];
        })
    );
    TranslationHelper.exporting = false;
    return json;
};

TranslationHelper.ExportTranslation.Gym = function () {
    TranslationHelper.exporting = true;
    const json = {};
    Object.values(GymList).forEach((gym) => {
        json[gym.rawLeaderName] = Translation.Gym[gym.rawLeaderName] ?? "";
        if (!gym.rawButtonText.endsWith("'s Gym")) {
            json[gym.rawButtonText] = Translation.Gym[gym.rawButtonText] ?? "";
        }
    });
    TranslationHelper.exporting = false;
    return json;
};

TranslationHelper.ExportTranslation.Route = function () {
    TranslationHelper.exporting = true;
    const json = Routes.regionRoutes.reduce((obj, { routeName }) => {
        if (regionRouteReg.test(routeName)) {
            return obj;
        }
        obj[routeName] = formatRouteName(routeName, false) ?? "";
        return obj;
    }, {});
    TranslationHelper.exporting = false;
    return json;
};

// 新增导出功能
TranslationHelper.ExportTranslation.Items = function () {
    const json = {};
    Object.entries(ItemList).forEach(([key, item]) => {
        if (item && item.displayName) {
            json[key] = Translation.Items?.[key] || "";
        }
    });
    return json;
};

TranslationHelper.ExportTranslation.Berry = function () {
    const json = {};
    Object.keys(BerryType).forEach(key => {
        if (isNaN(Number(key)) && key !== 'None') {
            json[key] = Translation.Berry?.[key] || "";
        }
    });
    return json;
};

TranslationHelper.ExportTranslation.Dungeon = function () {
    const json = {};
    Object.keys(dungeonList).forEach(name => {
        json[name] = Translation.Dungeon?.[name] || "";
    });
    return json;
};

TranslationHelper.ImportTranslation = async function (files) {
    for (const file of files) {
        const name = file.name;
        const type = name.replace(/\.json$/, "");
        if (!resources.includes(type)) {
            Notifier.notify({
                title: SCRIPT_TITLE,
                message: `导入本地汉化json失败\n不支持的文件名：${name}`,
                timeout: 6000000,
            });
            continue;
        }

        await new Promise((resolve) => {
            const fr = new FileReader();
            fr.readAsText(file);
            fr.addEventListener("loadend", function () {
                let result;
                try {
                    result = JSON.parse(this.result);
                } catch (error) {
                    Notifier.notify({
                        title: SCRIPT_TITLE,
                        message: `导入本地汉化json失败\nJSON解析错误：${name}`,
                        timeout: 6000000,
                    });
                    console.warn(LOG_PREFIX, "本地导入json解析失败", type, error);
                    resolve();
                    return;
                }

                writeCache(type, result);
                console.log(LOG_PREFIX, "本地导入json", type);
                Notifier.notify({
                    title: SCRIPT_TITLE,
                    message: `导入本地汉化json成功\n刷新游戏后生效：${name}`,
                    type: 1,
                    timeout: 6000000,
                });
                resolve();
            });
        });
    }
};

// UI (需要PokeClickerHelper)
CoreModule = CoreModule ?? getCoreModule();
if (CoreModule) {
    CoreModule.TranslationHelper = TranslationHelper;
    const prefix = CoreModule.UIContainerID[0].replace("#", "").replace("Container", "") + "TranslationHelper";

    // 挂载汉化api供其他脚本使用
    CoreModule.TranslationAPI = {
        Route: formatRouteName,
        Town: (townName) => Translation.Town[townName] ?? townName,
        Region: (region) => {
            if (typeof region == "string") {
                return Translation.SubRegion[region] ?? region;
            } else if (typeof region == "number") {
                const regionName = GameConstants.camelCaseToString(GameConstants.Region[region]);
                return Translation.SubRegion[regionName] ?? regionName;
            }
        },
        NPC: (npcName) => Translation.NPCName[npcName] ?? npcName,
        QuestLine: (questLineName) => Translation.QuestLine[questLineName]?.name ?? questLineName,
        Gym: (leaderName) => Translation.Gym[leaderName] ?? leaderName,
        Achievement: (achievementName) => Translation.AchievementName[achievementName] ?? achievementName,
        // 新增翻译API
        Item: (itemName) => {
            if (!Translation.Items) return itemName;
            for (const category of Object.values(Translation.Items)) {
                if (typeof category === 'object' && category[itemName]) {
                    return category[itemName];
                }
            }
            return itemName;
        },
        Berry: (berryName) => Translation.Berry?.[berryName] ?? berryName,
        Dungeon: (dungeonName) => {
            if (!Translation.Dungeon) return dungeonName;
            for (const region of Object.values(Translation.Dungeon)) {
                if (typeof region === 'object' && region[dungeonName]) {
                    return region[dungeonName];
                }
            }
            return dungeonName;
        },
        Badge: (badgeName) => {
            if (!Translation.Badge) return badgeName;
            for (const region of Object.values(Translation.Badge)) {
                if (typeof region === 'object' && region[badgeName]) {
                    return region[badgeName];
                }
            }
            return badgeName;
        },
    };

    CoreModule.UIDOM.push(`
    <div id="${prefix}" class="custom-row">
        <div class="contentLabel">
            <label>内核汉化</label>
        </div>
        <div style="flex: auto;">
            <button id="${prefix}Refresh" class="btn btn-sm btn-primary mr-1" data-save="false" title="刷新游戏后强制请求汉化json&#10;*仅清空脚本缓存，可能存在浏览器缓存需手动清理">清空缓存</button>
            <button id="${prefix}Import" class="btn btn-sm btn-primary mr-1" data-save="false" title="导入本地汉化文件覆盖汉化缓存">导入汉化</button>
            <button id="${prefix}ExportMissing" class="btn btn-sm btn-primary mr-1" data-save="false" title="导出当前检测到的未翻译英文文本（用于补翻译）">导出未翻译</button>
            <button id="${prefix}Toggle" class="btn btn-sm btn-primary mr-1" data-save="false" value="切换原文" title="">切换原文</button>
        </div>
        <div class="contentContainer d-flex ml-2 mt-2" style="flex: auto;align-items: center;flex-wrap: wrap;">
            <div class="m-auto d-flex" style="align-items: baseline; width: 100%;">
                <label>
                    CDN
                </label>
                <select id="${prefix}CDN" title="选择任一可连通CDN即可" data-save="global" class="custom-select m-2" style="width: 67%; text-align: center;">
                    <option value="jsDelivr">
                        cdn.jsdelivr.net
                    </option>
                    <option value="GitHub">
                        raw.githubusercontent.com
                    </option>
                </select>
                <button id="${prefix}Test" class="btn btn-sm btn-primary" data-save="false" title="测试CDN连通情况">
                    测试
                </button>
            </div>
            <div class="mt-2 m-auto d-flex">
                <div class="form-floating" style="width: 30%;">
                    <input type="number" class="form-control" id="${prefix}UpdateDelay" data-save="global" step="1" value="${TranslationHelper.config.UpdateDelay}" style="text-align: right; height: 45px;">
                    <label style="padding-right: 0!important; padding-top: 12px!important; font-size: 12px;">
                        更新周期（天）
                    </label>
                </div>
                <div class="form-floating ml-3" style="width: 32%;">
                    <input type="number" class="form-control" id="${prefix}Timeout" data-save="global" step="100" value="${TranslationHelper.config.Timeout}" min="3000" style="text-align: right; height: 45px;">
                    <label style="padding-right: 0!important; padding-top: 12px!important; font-size: 12px;">
                        请求超时（毫秒）
                    </label>
                </div>
                <div id="${prefix}TestResult" style="margin: auto; width: 30%; text-align: center; color: blue;">
                    测试结果：未测试
                </div>
            </div>
        </div>
    </div>
    `);
    CoreModule.UIlistener.push(() => {
        $(`#${prefix}`)
            .on("click", `#${prefix}Refresh`, function () {
                this.disabled = true;
                window.PCHForceRefreshTranslation(false);
            })
            .on("click", `#${prefix}Toggle`, function () {
                if (this.value == "切换原文") {
                    $(this).text((this.value = "切换汉化"));
                    TranslationHelper.toggleRaw = true;
                } else {
                    $(this).text((this.value = "切换原文"));
                    TranslationHelper.toggleRaw = false;
                }
                if ($("#npc-modal").is(":visible")) {
                    NPCController.selectedNPC(NPCController.selectedNPC());
                }
            })
            .on("click", `#${prefix}Import`, function () {
                window.PCHImportAction();
            })
            .on("click", `#${prefix}ExportMissing`, function () {
                window.PCHExportMissingUIText?.();
            })
            .on("change", "[data-save=global]", function () {
                const id = this.id.replace(prefix, "");
                if (this.value != "") {
                    TranslationHelper.config[id] = this.value;
                }
            })
            .on("click", `#${prefix}Test`, async function () {
                this.disabled = true;
                const start = Date.now();
                const result = await FetchResource("Town", true)
                    .then(() => {
                        const now = Date.now();
                        return `测试结果：成功<br>${now - start}ms`;
                    })
                    .catch(() => {
                        return `测试结果：超时<br>不够科学`;
                    });
                this.disabled = false;
                $(`#${prefix}TestResult`).html(result);
            });
    });
}

window.PCHImportAction = () => {
    $(`<input type="file" accept=".json" style="display:none;" multiple />`)
        .appendTo(document.body)
        .on("change", function () {
            TranslationHelper.ImportTranslation(this.files);
            this.remove();
        })
        .on("cancel", function () {
            this.remove();
        })
        .trigger("click");
};

window.PCHForceRefreshTranslation = (refresh = true) => {
    resources.forEach((resource) => removeCache(resource));
    refresh && location.reload();
};

if (failed.length == 0) {
    Notifier.notify({
        title: SCRIPT_TITLE,
        message: `汉化加载完毕\n可以正常加载存档\n\n<div class="d-flex" style="justify-content: space-around;"><button class="btn btn-block btn-info m-0 col-5" onclick="window.PCHForceRefreshTranslation()">清空汉化缓存</button><button class="btn btn-block btn-info m-0 col-5" onclick="window.PCHImportAction()">本地导入汉化</button></div>`,
        timeout: 15000,
    });
    setupUIAutoTranslation();
    // 初始化UI翻译 - 等待DOM元素渲染完成
    waitFor(
        () => document.querySelector('#startMenu .dropdown-toggle'),
        { timeoutMs: 30000, intervalMs: 500, name: '主菜单按钮' }
    ).then(() => {
        console.log(LOG_PREFIX, 'DOM元素已渲染，开始UI翻译');
        translateStaticUI();
    }).catch((err) => {
        console.warn(LOG_PREFIX, 'UI翻译等待超时', err);
    });
    setupModalTranslation();
} else {
    Notifier.notify({
        title: SCRIPT_TITLE,
        message: `请求汉化json失败，请检查网络链接或更新脚本\n无法完成汉化：${failed.join(
            " / "
        )}\n\n<div class="d-flex" style="justify-content: space-around;"><button class="btn btn-block btn-info m-0 col-5" onclick="window.PCHForceRefreshTranslation()">清空汉化缓存</button><button class="btn btn-block btn-info m-0 col-5" onclick="window.PCHImportAction()">本地导入汉化</button></div>`,
        timeout: 6000000,
    });
}

setTimeout(() => $('.toast:contains("汉化正在加载中") [data-dismiss="toast"]').trigger("click"), 1000);
})().catch((error) => console.error("宝可梦点击脚本 初始化失败", error));

import {
    generateRaw,
    eventSource,
    event_types,
    saveSettingsDebounced,
} from "/script.js";
import {
    extension_settings,
} from "/scripts/extensions.js";
import {
    regex_placement,
} from "/scripts/extensions/regex/engine.js";
import {
    world_names,
    loadWorldInfo,
} from "/scripts/world-info.js";

import { getPresetManager } from "/scripts/preset-manager.js";





// 注：不需要引入 oai_settings 和 power_user 了，因为我们要直接读文件
jQuery(async () => {
    // ==========================================
    // 0. 数据存储管理 (LocalStorage)
    // ==========================================
async function injectTutuRegex() {
    const REGEX_SCRIPT_NAME = '🐰兔兔小剧场过滤';

    const tutuRegexScript = {
        /*
         * id 是 SillyTavern 正则扩展当前版本需要的字段。
         * 没有 id 时，页面渲染时虽然可能自动补，
         * 但这里直接生成最稳妥。
         */
        id:
            typeof crypto?.randomUUID === 'function'
                ? crypto.randomUUID()
                : `tutu-theater-${Date.now()}-${Math.random()
                    .toString(16)
                    .slice(2)}`,

        scriptName: REGEX_SCRIPT_NAME,

        findRegex:
            '<!--\\s*TUTU_THEATER_START\\s*-->[\\s\\S]*?<!--\\s*TUTU_THEATER_END\\s*-->',

        replaceString: '',

        trimStrings: [],

        /*
         * 1 = AI 输出。
         */
        placement: [1],

        disabled: false,

        markdownOnly: false,

        /*
         * 只处理发送给 AI 的 prompt，
         * 不修改聊天界面的显示。
         */
        promptOnly: true,

        runOnEdit: true,

        substituteRegex: false,

        minDepth: null,
        maxDepth: null,
    };

    try {
        /*
         * 你的 SillyTavern 版本中：
         *
         * extension_settings.regex
         *
         * 本身就是全局正则数组。
         */
        let regexScripts;

        if (Array.isArray(extension_settings.regex)) {
            regexScripts = extension_settings.regex;
        } else if (
            extension_settings.regex &&
            Array.isArray(extension_settings.regex.scripts)
        ) {
            /*
             * 清理之前错误写入的：
             * extension_settings.regex.scripts
             */
            regexScripts = extension_settings.regex.scripts;
            extension_settings.regex = regexScripts;
        } else if (
            extension_settings.regex &&
            Array.isArray(extension_settings.regex.global_scripts)
        ) {
            /*
             * 清理之前错误写入的：
             * extension_settings.regex.global_scripts
             */
            regexScripts = extension_settings.regex.global_scripts;
            extension_settings.regex = regexScripts;
        } else {
            regexScripts = [];
            extension_settings.regex = regexScripts;
        }

        /*
         * 查找已有同名正则。
         */
        const existingIndex = regexScripts.findIndex(script => {
            return script?.scriptName === REGEX_SCRIPT_NAME;
        });

        if (existingIndex >= 0) {
            /*
             * 已存在则更新。
             * 保留原来的 id，避免页面重复或排序异常。
             */
            const oldId = regexScripts[existingIndex].id;

            regexScripts[existingIndex] = {
                ...tutuRegexScript,
                ...regexScripts[existingIndex],
                id: oldId || tutuRegexScript.id,
            };

            console.log(
                '[兔兔小剧场] 全局正则已存在，已更新'
            );
        } else {
            /*
             * 当前版本全局正则应该直接 push 到
             * extension_settings.regex 数组。
             */
            regexScripts.push(tutuRegexScript);

            console.log(
                '[兔兔小剧场] 已注入 extension_settings.regex'
            );
        }

        /*
         * 再次确保最终结构是数组，而不是：
         * { scripts: [...] }
         */
        extension_settings.regex = regexScripts;

        /*
         * 保存到 SillyTavern 设置。
         */
        saveSettingsDebounced();

        console.log(
            '[兔兔小剧场] 当前全局正则数组：',
            extension_settings.regex
        );

        /*
         * 调试用。
         */
        window.tutuRegexDebug = extension_settings.regex;

    } catch (error) {
        console.error(
            '[兔兔小剧场] 注入全局正则失败：',
            error
        );
    }
}





const STORAGE_KEY = 'tutu_theater_scenarios';
const SETTINGS_KEY = 'tutu_theater_settings';
const API_PRESETS_KEY = 'tutu_theater_api_presets';
const CHARACTER_CONTEXT_KEY = 'tutu_theater_character_context';
const CATEGORIES_KEY = 'tutu_theater_categories';
const THEATER_CONTENT_KEY = 'tutu_theater_embed_contents';
const FAVORITES_KEY = 'tutu_theater_favorites';
const FAVORITES_EXPANDED_KEY =
    'tutu_theater_favorites_expanded_groups';
const TUTU_PACKAGE_TYPE = 'tutu-theater-package';
const TUTU_PACKAGE_VERSION = 1;

// 当前面板中正在显示的小剧场
let tutuCurrentResultContent = '';
let tutuCurrentResultCharacter = 'AI';
let tutuCurrentResultType = 'text';

let tutuCategories = loadLocalJson(CATEGORIES_KEY, []);

tutuCategories = Array.isArray(tutuCategories)
    ? tutuCategories
        .map(category => String(category || '').trim())
        .filter(Boolean)
    : [];


function loadLocalJson(key, defaultValue) {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : defaultValue;
    } catch (error) {
        console.error(`读取 LocalStorage 失败：${key}`, error);
        return defaultValue;
    }
}
function getTutuTheaterStorageKey(mesIndex) {
    const context =
        SillyTavern.getContext();

    const chatId =
        context.chatId ||
        context.chat_metadata?.chat_id ||
        'default';

    const characterId =
        context.characterId !== undefined
            ? String(context.characterId)
            : 'none';

    const character =
        context.characterId !== undefined &&
        context.characters?.[context.characterId]
            ? context.characters[context.characterId]
            : null;

    const characterName =
        character?.name ||
        character?.data?.name ||
        'AI';

    const avatar =
        character?.avatar ||
        character?.data?.avatar ||
        '';

    return [
        chatId,
        characterId,
        characterName,
        avatar,
        mesIndex,
    ].join('::');
}


function saveTutuTheaterContent(mesIndex, content) {
    const stored =
        loadLocalJson(
            THEATER_CONTENT_KEY,
            {}
        );

    const key =
        getTutuTheaterStorageKey(mesIndex);

    stored[key] = {
        content: String(content || ''),
        characterName:
            getCurrentTutuCharacterName(),
        savedAt: Date.now(),
    };

    /*
     * 只保留最近 100 条。
     */
    const keys = Object.keys(stored);

    if (keys.length > 100) {
        keys
            .slice(0, keys.length - 100)
            .forEach(key => {
                delete stored[key];
            });
    }

    localStorage.setItem(
        THEATER_CONTENT_KEY,
        JSON.stringify(stored)
    );
}


function getTutuStoredTheaterContent(mesIndex) {
    const stored =
        loadLocalJson(
            THEATER_CONTENT_KEY,
            {}
        );

    const key =
        getTutuTheaterStorageKey(mesIndex);

    const value = stored[key];

    /*
     * 兼容旧版本以前直接保存字符串的格式。
     */
    if (typeof value === 'string') {
        return {
            content: value,
            characterName:
                getCurrentTutuCharacterName(),
        };
    }

    if (!value || typeof value !== 'object') {
        return null;
    }

    return {
        content: String(value.content || ''),
        characterName:
            String(
                value.characterName ||
                getCurrentTutuCharacterName()
            ),
    };
}

function loadTutuFavorites() {
    const data = loadLocalJson(FAVORITES_KEY, []);
    return Array.isArray(data) ? data : [];
}

function saveTutuFavorites(favorites) {
    localStorage.setItem(
        FAVORITES_KEY,
        JSON.stringify(favorites)
    );
}

function getCurrentTutuCharacterName() {
    return String(
        tutuCurrentCharacterContext?.characterName ||
        tutuCurrentResultCharacter ||
        'AI'
    ).trim() || 'AI';
}

function createTutuFavoriteRecord(content, title = '') {
    const text = String(content || '').trim();

    const characterName =
        getCurrentTutuCharacterName();

    const cleanTitle =
        String(title || '').trim() ||
        '未命名小剧场';

    return {
        id:
            typeof crypto?.randomUUID === 'function'
                ? crypto.randomUUID()
                : `favorite-${Date.now()}-${Math.random()
                    .toString(16)
                    .slice(2)}`,

        title: cleanTitle,

        content: text,

        type: isProbablyHtml(text)
            ? 'html'
            : 'text',

        characterName,

        createdAt: Date.now(),
    };
}
function favoriteCurrentTutuTheater() {
    const content =
        String(tutuCurrentResultContent || '').trim();

    if (!content) {
        toastr.warning('当前没有可以收藏的小剧场');
        return;
    }

    favoriteTutuContent(
        content,
        getCurrentTutuCharacterName()
    );

    $('#tutu_favorite_current_btn')
        .addClass('active')
        .find('i')
        .attr(
            'class',
            'fa-solid fa-heart'
        );
}


function removeTutuFavorite(id) {
    const favorites = loadTutuFavorites()
        .filter(item => item.id !== id);

    saveTutuFavorites(favorites);

    renderTutuFavorites();
}
function renameTutuFavorite(id) {
    const favorites = loadTutuFavorites();


    const favorite =
        favorites.find(item => item.id === id);

    if (!favorite) {
        toastr.error('找不到这条收藏');
        return;
    }

    const oldTitle =
        String(
            favorite.title ||
            '未命名小剧场'
        ).trim();

    const newTitleInput = window.prompt(
        '请输入新的收藏名称：',
        oldTitle
    );

    if (newTitleInput === null) {
        return;
    }

    const newTitle =
        String(newTitleInput || '').trim();

    if (!newTitle) {
        toastr.warning('收藏名称不能为空');
        return;
    }

    favorite.title = newTitle;

    saveTutuFavorites(favorites);
    renderTutuFavorites();

    toastr.success('收藏名称已修改');
}
function loadTutuFavoriteExpandedGroups() {
    const data = loadLocalJson(
        FAVORITES_EXPANDED_KEY,
        []
    );

    return new Set(
        Array.isArray(data)
            ? data.map(item => String(item))
            : []
    );
}

function saveTutuFavoriteExpandedGroups(groups) {
    localStorage.setItem(
        FAVORITES_EXPANDED_KEY,
        JSON.stringify(Array.from(groups))
    );
}

function clearTutuFavorites() {
    const favorites = loadTutuFavorites();

    if (!favorites.length) {
        toastr.info('收藏列表已经是空的');
        return;
    }

    if (!confirm('确定要清空全部小剧场收藏吗？')) {
        return;
    }

    saveTutuFavorites([]);

    renderTutuFavorites();

    toastr.success('收藏已清空');
}

function formatTutuFavoriteTime(timestamp) {
    if (!timestamp) {
        return '';
    }

    try {
        return new Date(timestamp).toLocaleString();
    } catch {
        return '';
    }
}

function renderTutuFavorites() {
    const $list =
        $('#tutu_favorites_list');

    if (!$list.length) {
        return;
    }

    const favorites =
        loadTutuFavorites();

    $list.empty();

    if (!favorites.length) {
        $list.html(`
            <div class="tutu-empty-library">
                <i class="fa-regular fa-heart"></i>
                <div>还没有收藏的小剧场</div>
                <small>
                    生成内容后，点击心形按钮即可收藏
                </small>
            </div>
        `);

        return;
    }

    /*
     * 旧版本收藏可能没有 title 字段。
     * 这里自动补充默认名称，但不立即写入，
     * 避免渲染时频繁修改 LocalStorage。
     */
    favorites.forEach(item => {
        if (!item.title) {
            item.title = '未命名小剧场';
        }

        if (!item.characterName) {
            item.characterName = 'AI';
        }
    });

    /*
     * 按角色名称分组
     */
    const groupedFavorites =
        new Map();

    favorites.forEach(item => {
        const characterName =
            String(
                item.characterName || 'AI'
            ).trim() || 'AI';

        if (!groupedFavorites.has(characterName)) {
            groupedFavorites.set(
                characterName,
                []
            );
        }

        groupedFavorites
            .get(characterName)
            .push(item);
    });

    /*
     * 读取上一次的展开状态
     *
     * 没有记录时，默认全部折叠
     */
    const expandedGroups =
        loadTutuFavoriteExpandedGroups();

    groupedFavorites.forEach(
        (items, characterName) => {
            const isExpanded =
                expandedGroups.has(characterName);

            const $group = $(`
                <div class="tutu-favorite-group">
                    <div class="tutu-favorite-group-header">
                        <div class="tutu-favorite-group-title">
                            <i class="fa-solid fa-user"></i>
                            <span class="tutu-favorite-character-name"></span>
                        </div>

                        <div class="tutu-favorite-group-right">
                            <span class="tutu-favorite-group-count">
                                ${items.length} 条收藏
                            </span>

                            <i class="
                                fa-solid
                                ${isExpanded
                                    ? 'fa-chevron-up'
                                    : 'fa-chevron-down'}
                                tutu-favorite-group-arrow
                            "></i>
                        </div>
                    </div>

                    <div class="tutu-favorite-group-list"
                         style="display:${isExpanded ? 'flex' : 'none'};">
                    </div>
                </div>
            `);

            /*
             * 使用 .text() 设置角色名，
             * 避免角色名中包含 HTML 造成注入。
             */
            $group
                .find('.tutu-favorite-character-name')
                .text(characterName);

            const $groupList =
                $group.find(
                    '.tutu-favorite-group-list'
                );

            items.forEach(item => {
                const content =
                    String(item.content || '');

                const title =
                    String(
                        item.title ||
                        '未命名小剧场'
                    );

                const time =
                    escapeHtml(
                        formatTutuFavoriteTime(
                            item.createdAt
                        )
                    );

const isHtmlFavorite =
    isProbablyHtml(content);

const preview =
    isHtmlFavorite
        ? ''
        : content;


                const $card = $(`
                    <div
                        class="tutu-favorite-card"
                        data-id="${escapeHtml(item.id)}">

                        <div class="tutu-favorite-card-header">
                            <div class="tutu-favorite-card-info">
                                <div class="
                                    tutu-favorite-title
                                "></div>

                                <div class="
                                    tutu-favorite-time
                                ">
                                    ${time}
                                </div>
                            </div>

                            <div class="
                                tutu-favorite-actions
                            ">
                                <div
                                    class="
                                        menu_button
                                        margin0
                                        tutu-favorite-edit-btn
                                    "
                                    title="编辑名称">
                                    <i class="fa-solid fa-pen"></i>
                                </div>

<div
    class="
        menu_button
        margin0
        tutu-favorite-export-btn
    "
    title="导出">
    <i class="fa-solid fa-download"></i>
</div>

<div
    class="
        menu_button
        margin0
        tutu-favorite-fullscreen-btn
    "
    title="全屏查看">
    <i class="fa-solid fa-expand"></i>
</div>

<div
    class="
        menu_button
        margin0
        tutu-favorite-delete-btn
    "
    title="删除收藏">
    <i class="fa-solid fa-trash"></i>
</div>

                            </div>
                        </div>

<div class="tutu-favorite-preview">
    ${
        isHtmlFavorite
            ? `
                <div class="tutu-favorite-html-actions">
                    <button
                        type="button"
                        class="tutu-favorite-html-preview-btn">
                        <i class="fa-solid fa-display"></i>
                        预览 HTML 小剧场
                    </button>

                    <span class="tutu-favorite-html-tip">
                        点击按钮展开预览
                    </span>
                </div>

                <div
                    class="tutu-favorite-html-container"
                    style="display:none;">
                    <iframe
                        class="tutu-favorite-html-iframe"
                        sandbox="allow-scripts allow-forms allow-modals">
                    </iframe>
                </div>
            `
            : escapeHtml(preview)
    }
</div>

                    </div>
                `);
$card
    .find('.tutu-favorite-title')
    .text(title);

/*
 * HTML 收藏不直接拼进模板，
 * 而是使用 iframe.srcdoc 安全地设置预览内容。
 */
if (isHtmlFavorite) {
    const iframe =
        $card.find('.tutu-favorite-html-iframe')[0];

    if (iframe) {
        iframe.srcdoc = content;
    }
}

$groupList.append($card);

            });

            $list.append($group);
        }
    );
}


let tutuScenarios = loadLocalJson(STORAGE_KEY, []);
// 展开的分类集合，可以同时展开多个
const EXPANDED_KEY = 'tutu_theater_expanded_categories';

const tutuStoredExpanded = loadLocalJson(EXPANDED_KEY, null);

let tutuExpandedCategories = new Set(
    Array.isArray(tutuStoredExpanded) ? tutuStoredExpanded : []
);

// 第一次使用时默认全部展开
let tutuExpandedInitialized = Array.isArray(tutuStoredExpanded);

function saveTutuExpandedCategories() {
    localStorage.setItem(
        EXPANDED_KEY,
        JSON.stringify(Array.from(tutuExpandedCategories))
    );
}

let tutuIsGenerating = false;
let tutuLastAutoMessageKey = '';
let tutuSettings = loadLocalJson(SETTINGS_KEY, {
    provider: 'main',
    endpoint: '',
    apiKey: '',
    model: '',

    autoGenerateEnabled: false,
    autoGenerateMode: 'current',
    autoSequenceIndex: 0,
});
tutuSettings = {
    provider: 'main',
    endpoint: '',
    apiKey: '',
    model: '',

    autoGenerateEnabled: false,

    // 嵌入 AI 回复楼层时的默认状态
    // false = 默认展开
    // true = 默认折叠
    embedDefaultCollapsed: false,
    autoGenerateMode: 'current',
    autoGenerateScope: 'all',
    autoGenerateCategory: '',
    autoSequenceIndex: 0,
    autoSequenceIndexes: {},

    // ★ 新增：输出方式
    // 'panel' = 外置面板预览
    // 'embed' = 嵌入聊天楼层
    outputMode: 'panel',

    ...tutuSettings,
};
if (typeof tutuSettings.embedDefaultCollapsed !== 'boolean') {
    tutuSettings.embedDefaultCollapsed = false;
}


let tutuApiPresets = loadLocalJson(API_PRESETS_KEY, []);

let tutuCharacterContexts = loadLocalJson(
    CHARACTER_CONTEXT_KEY,
    {}
);
// 给旧剧本补充分类字段
let tutuScenarioChanged = false;

tutuScenarios = Array.isArray(tutuScenarios)
    ? tutuScenarios.map(item => {
        if (!item || typeof item !== 'object') {
            tutuScenarioChanged = true;

            return {
                name: '未命名剧本',
                desc: '',
                category: '未分类',
                prompt: '',
            };
        }

        if (!item.category || !String(item.category).trim()) {
            tutuScenarioChanged = true;

            return {
                ...item,
                category: '未分类',
            };
        }

        return {
            ...item,
            category: String(item.category).trim(),
        };
    })
    : [];

if (tutuScenarioChanged) {
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(tutuScenarios)
    );
}

    if (tutuScenarios.length === 0) {
tutuScenarios = [
    {
        name: "🍳 厨房大乱斗",
        desc: "角色在厨房里手忙脚乱地准备晚餐。",
        prompt: "角色正在厨房里手忙脚乱地准备晚餐，结果把盐当成了糖..."
    }
];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tutuScenarios));
    }
const scenarioCategories = tutuScenarios
    .map(item => String(item.category || '未分类').trim())
    .filter(Boolean);

tutuCategories = Array.from(
    new Set([
        ...tutuCategories,
        ...scenarioCategories,
    ])
);

if (!tutuCategories.length) {
    tutuCategories = ['未分类'];
}

localStorage.setItem(
    CATEGORIES_KEY,
    JSON.stringify(tutuCategories)
);

    // ==========================================
    // 1. 注入 CSS 样式
    // ==========================================
    const tutuStyle = `
        <style>
        </style>
    `;
    $('head').append(tutuStyle);



    // ==========================================
    // 2. 构建面板 HTML
    // ==========================================
    const menuButtonHtml = `
        <div id="option_tutu_theater" class="list-group-item flex-container flexGap5 interactable" title="生成外置小剧场" tabindex="0" role="listitem">
            <div class="fa-fw fa-solid fa-carrot extensionsMenuExtensionButton"></div>
            <span>兔兔小剧场</span>
        </div>
    `;

    const panelHtml = `
       <div id="tutu_theater_panel">


            
            <!-- 头部 -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h3 style="margin: 0; font-size: 1.3em;">🐰 兔兔小剧场</h3>
                <div id="tutu_close" class="fa-solid fa-xmark interactable hoverglow" title="关闭" style="font-size: 1.5em; cursor: pointer;"></div>
            </div>
            
<div class="tutu-icon-toolbar">

    <div
        class="tutu-icon-tab active"
        data-tab="tutu_tab_generate"
        title="生成小剧场">
        <i class="fa-solid fa-display"></i>
        <span>预览</span>
    </div>

    <div
        class="tutu-icon-tab"
        data-tab="tutu_tab_library"
        title="我的剧本">
        <i class="fa-solid fa-book"></i>
        <span>剧本</span>
    </div>

    <div
        class="tutu-icon-tab"
        data-tab="tutu_tab_import"
        title="批量导入">
        <i class="fa-solid fa-download"></i>
        <span>导入</span>
    </div>

    <div
        class="tutu-icon-tab"
        data-tab="tutu_tab_settings"
        title="设置">
        <i class="fa-solid fa-sliders"></i>
        <span>设置</span>
    </div>
<div
    class="tutu-icon-tab"
    data-tab="tutu_tab_favorites"
    title="我的收藏">
    <i class="fa-solid fa-heart"></i>
    <span>收藏</span>
</div>

</div>



            <!-- TAB 1: 生成区 -->
<div id="tutu_tab_generate" class="tutu-tab-content active">

    <!-- 顶部紧凑控制区：输入框 + 全部图标按钮同一行 -->
    <div class="tutu-compact-control-panel">

        <div class="tutu-prompt-row">
            <textarea
                id="tutu_prompt"
                class="text_pole"
                rows="1"
                placeholder="输入情境，或从剧本库载入……"></textarea>

            <div class="tutu-prompt-tools">

                <div
                    id="tutu_generate_btn"
                    class="tutu-icon-action primary"
                    role="button"
                    tabindex="0"
                    aria-label="生成小剧场"
                    title="生成小剧场">
                    <i class="fa-solid fa-wand-magic-sparkles"></i>
                </div>

                <div
                    id="tutu_random_script_btn"
                    class="tutu-icon-action"
                    role="button"
                    tabindex="0"
                    aria-label="随机选择剧本并生成"
                    title="随机剧本">
                    <i class="fa-solid fa-shuffle"></i>
                </div>

                <div
                    id="tutu_context_toggle_btn"
                    class="tutu-icon-action"
                    role="button"
                    tabindex="0"
                    aria-label="展开角色与世界书"
                    title="读取内容">
                    <i class="fa-solid fa-book-open"></i>
                </div>

                <div
                    id="tutu_clear_prompt_btn"
                    class="tutu-icon-action"
                    role="button"
                    tabindex="0"
                    aria-label="清空情境"
                    title="清空">
                    <i class="fa-solid fa-eraser"></i>
                </div>

                <div
                    id="tutu_auto_status"
                    class="tutu-auto-status"
                    role="status"
                    aria-label="手动生成"
                    title="手动生成">
                    <i class="fa-solid fa-circle"></i>
                </div>

            </div>
        </div>

    </div>


    <!-- 角色、世界书、历史记录，默认隐藏 -->
    <div
        id="tutu_character_context_box"
        class="tutu-context-box tutu-collapsible-context"
        style="display:none;">

        <div
            id="tutu_worldbook_toggle"
            class="tutu-context-toggle"
            role="button"
            tabindex="0">

            <div class="tutu-context-title">
                <i class="fa-solid fa-book"></i>
                当前角色关联世界书
            </div>

            <i
                id="tutu_worldbook_toggle_icon"
                class="fa-solid fa-chevron-down">
            </i>
        </div>

        <div
            id="tutu_worldbook_content"
            class="tutu-worldbook-content"
            style="display:none;">

            <div
                id="tutu_character_worldbook_name"
                class="tutu-context-worldbook">
                正在读取世界书……
            </div>

            <div
                id="tutu_character_worldbook_entries"
                class="tutu-context-worldbook-entries">
                正在读取世界书条目……
            </div>
        </div>

        <label class="tutu-history-option">
            <input type="checkbox" id="tutu_include_history">
            <span>读取历史聊天记录</span>
        </label>

        <div id="tutu_history_limit_box" style="display:none;">
            <label class="tutu-settings-label">
                读取最近多少条消息
            </label>

            <input
                id="tutu_history_limit"
                class="text_pole"
                type="number"
                min="1"
                max="100"
                value="20">
        </div>

    </div>

    <!-- 主要内容：预览与源码 -->
    <div id="tutu_result_box" class="tutu-result-box">

<div class="tutu-result-toolbar">
    <div id="tutu_result_status" class="text_muted">
        等待导演开始……
    </div>

    <div class="tutu-result-toolbar-right">
<select
    id="tutu_export_format"
    class="text_pole tutu-export-format-select"
    title="选择导出格式">
    <option value="text">纯文本 TXT</option>
    <option value="image">书摘图片 PNG</option>
</select>

<select
    id="tutu_export_style"
    class="text_pole tutu-export-style-select"
    title="书摘图片样式">
    <option value="classic">经典书摘</option>
    <option value="dark">暗夜书摘</option>
    <option value="paper">纸张书摘</option>
</select>


        <div
            id="tutu_favorite_current_btn"
            class="tutu-result-mode-btn"
            title="收藏当前小剧场">
            <i class="fa-regular fa-heart"></i>
        </div>

<div
    id="tutu_export_current_btn"
    class="tutu-result-mode-btn"
    title="导出当前小剧场">
    <i class="fa-solid fa-file-export"></i>
</div>

<div
    id="tutu_fullscreen_current_btn"
    class="tutu-result-mode-btn"
    title="放大查看当前小剧场">
    <i class="fa-solid fa-expand"></i>
</div>

<div class="tutu-result-mode-buttons">
            <div
                id="tutu_show_preview_btn"
                class="tutu-result-mode-btn active"
                title="预览">
                <i class="fa-solid fa-display"></i>
            </div>

            <div
                id="tutu_show_source_btn"
                class="tutu-result-mode-btn"
                title="源码">
                <i class="fa-solid fa-code"></i>
            </div>
        </div>
    </div>
</div>


        <div id="tutu_result_preview" class="tutu-result-preview">
            <div class="tutu-result-placeholder">
                生成的小剧场会显示在这里
            </div>
        </div>

        <pre id="tutu_result_source" class="tutu-result-source"></pre>

    </div>

</div>

<!-- TAB 2: 我的剧本库 -->
<div id="tutu_tab_library" class="tutu-tab-content">

<div class="tutu-library-toolbar">
    <div class="tutu-library-title">
        <i class="fa-solid fa-book"></i>
        我的剧本
    </div>

    <div class="tutu-library-category-tools">
        <input
            id="tutu_new_category_input"
            class="text_pole"
            type="text"
            aria-label="新分类名称"
            placeholder="新分类名称">

        <div
            id="tutu_add_category_btn"
            class="tutu-icon-action"
            role="button"
            tabindex="0"
            aria-label="新建分类"
            title="新建分类">
            <i class="fa-solid fa-folder-plus"></i>
        </div>

        <div
            id="tutu_new_script_btn"
            class="tutu-icon-action primary"
            role="button"
            tabindex="0"
            aria-label="新建剧本"
            title="新建剧本">
            <i class="fa-solid fa-plus"></i>
        </div>

        <!-- 打开导入导出面板 -->
        <div
            id="tutu_toggle_transfer_btn"
            class="tutu-icon-action"
            role="button"
            tabindex="0"
            aria-label="导入导出"
            title="导入导出">
            <i class="fa-solid fa-file-arrow-up"></i>
        </div>
    </div>
</div>

<!-- 小剧场导入导出面板 -->
<div
    id="tutu_transfer_panel"
    class="tutu-transfer-panel"
    style="display:none;">

    <div class="tutu-transfer-panel-header">
        <div class="tutu-transfer-panel-title">
            <i class="fa-solid fa-box-archive"></i>
            小剧场导入导出
        </div>

        <div
            id="tutu_close_transfer_btn"
            class="tutu-icon-action"
            role="button"
            tabindex="0"
            title="关闭">
            <i class="fa-solid fa-xmark"></i>
        </div>
    </div>

    <div class="tutu-transfer-row">
        <label class="tutu-settings-label">
            导出范围
        </label>

        <select
            id="tutu_export_scope"
            class="text_pole">

            <option value="all">
                全部分类和剧本
            </option>

            <option value="category">
                指定分类
            </option>
        </select>
    </div>

    <div
        id="tutu_export_category_row"
        class="tutu-transfer-row"
        style="display:none;">

        <label class="tutu-settings-label">
            选择分类
        </label>

        <select
            id="tutu_export_category"
            class="text_pole">
        </select>
    </div>

    <div class="tutu-transfer-row">
        <label class="tutu-settings-label">
            导出格式
        </label>

        <select
            id="tutu_export_type"
            class="text_pole">

            <option value="tutu_json">
                兔兔小剧场 JSON
            </option>

            <option value="st_preset">
                SillyTavern 对话补全预设
            </option>

            <option value="st_worldbook">
                SillyTavern 世界书
            </option>
        </select>
    </div>

    <div class="tutu-transfer-actions">
        <button
            type="button"
            id="tutu_export_library_btn"
            class="menu_button">

            <i class="fa-solid fa-file-export"></i>
            导出小剧场
        </button>

        <button
            type="button"
            id="tutu_import_library_btn"
            class="menu_button">

            <i class="fa-solid fa-file-import"></i>
            导入兔兔 JSON
        </button>

        <input
            type="file"
            id="tutu_import_library_file"
            accept=".json,application/json"
            style="display:none;">
    </div>

    <div class="tutu-api-help">
        兔兔 JSON 会完整保存分类、剧本名称、简介和正文。
        <br>
        导入功能只接受兔兔小剧场 JSON，不会把 SillyTavern 预设或世界书误导入剧本库。
    </div>
</div>





    <!-- 新建 / 编辑剧本表单，默认隐藏 -->
    <div id="tutu_script_editor" class="tutu-script-editor" style="display:none;">

        <div class="tutu-editor-header">
            <strong id="tutu_editor_title">新建剧本</strong>

            <div id="tutu_cancel_edit_btn"
                 class="menu_button margin0 tutu-small-btn">
                取消
            </div>
        </div>

        <input
            type="text"
            id="tutu_script_name"
            class="text_pole"
            placeholder="剧本名称，例如：厨房大乱斗"
        >

        <input
            type="text"
            id="tutu_script_desc"
            class="text_pole"
            placeholder="简介，可不填写"
        >
<input
    type="text"
    id="tutu_script_category"
    class="text_pole"
    placeholder="剧本分类，例如：日常、战斗、校园、搞笑"
    value="未分类"
>

        <textarea
            id="tutu_script_prompt"
            class="text_pole"
            rows="7"
            placeholder="请输入剧本内容或情境..."
        ></textarea>

        <div
            id="tutu_save_btn"
            class="menu_button tutu-save-script-btn">
            <i class="fa-solid fa-save"></i>
            保存剧本
        </div>
    </div>

    <!-- 剧本列表 -->
    <div id="tutu_library_list" class="tutu-library-list">
        <!-- JS 渲染的剧本库 -->
    </div>
</div>


            <!-- TAB 3: 多选批量导入系统预设 -->
            <div id="tutu_tab_import" class="tutu-tab-content">
                <div style="display:flex; gap:10px; margin-bottom: 10px;">
<select id="tutu_preset_type" class="text_pole" style="flex: 1; margin: 0;">
    <option value="openai" selected>对话补全预设 (Chat Completion)</option>
    <option value="worldbook">世界书 (World Info)</option>
</select>
                    <select id="tutu_preset_file" class="text_pole" style="flex: 2; margin: 0;">
                        <!-- JS 动态填充下拉列表 -->
                    </select>
                </div>
                
                <!-- 全选 & 导入按钮控制栏 -->
                <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom: 5px; padding-bottom: 10px; border-bottom: 1px dashed var(--SmartThemeBorderColor);">
                    <label style="cursor: pointer; display: flex; align-items: center; gap: 5px;">
                        <input type="checkbox" id="tutu_select_all" style="width:16px; height:16px; cursor:pointer;">
                        <span style="font-weight:bold;">全选</span>
                    </label>
                    <div id="tutu_import_selected_btn" class="menu_button margin0" style="background-color: var(--SmartThemeQuoteColor); color: #fff;">
                        <i class="fa-solid fa-download"></i> 导入所选项
                    </div>
                </div>
                
                <div id="tutu_native_prompts_list" style="overflow-y:auto; max-height:250px; display:flex; flex-direction:column; gap:10px;">
                    <div style="text-align:center; padding: 20px;">请选择预设...</div>
                </div>
            </div>
<!-- TAB 4: 设置 -->
<div id="tutu_tab_settings" class="tutu-tab-content">

    <div class="tutu-settings-section">
        <div class="tutu-settings-title">
            <i class="fa-solid fa-robot"></i>
            小剧场生成 API
        </div>
<label class="tutu-settings-label">
    输出方式
</label>

<select id="tutu_output_mode" class="text_pole">
    <option value="panel">
        在兔兔小剧场面板内预览
    </option>
    <option value="embed">
        嵌入到最新 AI 回复楼层底部
    </option>
</select>
<label class="tutu-settings-label">
    嵌入楼层默认状态
</label>

<select id="tutu_embed_default_state" class="text_pole">
    <option value="expanded">
        默认展开
    </option>
    <option value="collapsed">
        默认折叠
    </option>
</select>

<div class="tutu-api-help">
    仅对“嵌入到最新 AI 回复楼层底部”生效。
    嵌入后仍然可以点击标题手动展开或折叠。
</div>

<div class="tutu-api-help">
    <strong>面板预览</strong>：生成内容只在小剧场面板中显示。<br>
    <strong>嵌入楼层</strong>：生成内容会附加到最新 AI 回复的底部，
    切换聊天也不会消失。
    AI 不会读取到嵌入的小剧场内容（通过正则自动过滤）。
</div>

        <label class="tutu-settings-label">
            生成方式
        </label>

        <select id="tutu_api_provider" class="text_pole">
            <option value="main">使用酒馆主 API</option>
            <option value="secondary">使用自定义副 API</option>
        </select>

        <div id="tutu_secondary_api_settings">

<label class="tutu-settings-label">
    副 API 地址
</label>

<input
    id="tutu_secondary_endpoint"
    class="text_pole"
    type="text"
    placeholder="例如：https://api.openai.com/v1"
>

<div class="tutu-api-help">
    这里只需要填写到 <code>/v1</code>。
    程序会自动请求：
    <code>/v1/chat/completions</code>
</div>


            <label class="tutu-settings-label">
                API Key
            </label>

            <input
                id="tutu_secondary_api_key"
                class="text_pole"
                type="password"
                placeholder="sk-..."
            >

<label class="tutu-settings-label">
    模型
</label>

<div class="tutu-model-select-row">
    <select
        id="tutu_secondary_model"
        class="text_pole">
        <option value="">请先拉取模型</option>
    </select>

    <div
        id="tutu_fetch_models_btn"
        class="menu_button margin0"
        title="从副 API 拉取模型">
        <i class="fa-solid fa-rotate"></i>
        拉取模型
    </div>
</div>


            <div class="tutu-api-help">
                副 API 需要兼容 OpenAI Chat Completions 格式。
                请求格式为：
                <code>/v1/chat/completions</code>
            </div>

            <div class="tutu-api-preset-row">
                <select id="tutu_api_preset_select" class="text_pole">
                    <option value="">选择已保存的副 API 预设</option>
                </select>

                <div
                    id="tutu_load_api_preset_btn"
                    class="menu_button margin0">
                    载入
                </div>
            </div>

            <div class="tutu-api-preset-row">
                <input
                    id="tutu_api_preset_name"
                    class="text_pole"
                    type="text"
                    placeholder="预设名称，例如：OpenAI"
                >

                <div
                    id="tutu_save_api_preset_btn"
                    class="menu_button margin0">
                    保存预设
                </div>

                <div
                    id="tutu_delete_api_preset_btn"
                    class="menu_button margin0">
                    删除预设
                </div>
            </div>

        </div>
<div class="tutu-settings-section tutu-auto-generation-section">

    <div class="tutu-settings-title">
        <i class="fa-solid fa-bolt"></i>
        自动生成小剧场
    </div>

    <label class="tutu-switch-row">
        <input
            type="checkbox"
            id="tutu_auto_generate_enabled">

        <span>
            收到最新 AI 回复后自动生成
        </span>
    </label>

<label class="tutu-settings-label">
    自动生成方式
</label>

<select id="tutu_auto_generate_mode" class="text_pole">
    <option value="current">
        使用当前输入框情境
    </option>
    <option value="random">
        从剧本库随机生成
    </option>
    <option value="sequence">
        从剧本库顺序生成
    </option>
</select>

<label class="tutu-settings-label">
    自动生成剧本范围
</label>

<select id="tutu_auto_generate_scope" class="text_pole">
    <option value="all">
        使用全部剧本
    </option>
    <option value="category">
        使用指定分类
    </option>
</select>

<select
    id="tutu_auto_generate_category"
    class="text_pole">
    <option value="">请选择分类</option>
</select>

    <label class="tutu-settings-label">
        自动生成使用的 API
    </label>

    <div class="tutu-auto-api-tip">
        自动生成会使用上方已经保存的 API 设置。
    </div>

</div>
        <div
            id="tutu_save_settings_btn"
            class="menu_button">
            <i class="fa-solid fa-save"></i>
            保存设置
        </div>
    </div>

</div>
<!-- TAB 5: 我的收藏 -->
<div id="tutu_tab_favorites" class="tutu-tab-content">

    <div class="tutu-favorite-toolbar">
        <div class="tutu-library-title">
            <i class="fa-solid fa-heart"></i>
            我的收藏
        </div>

        <div
            id="tutu_clear_favorites_btn"
            class="menu_button margin0">
            <i class="fa-solid fa-trash"></i>
            清空收藏
        </div>
    </div>

    <div
        id="tutu_favorites_list"
        class="tutu-favorites-list">
    </div>

</div>



        </div>
    `;

    $('body').append(panelHtml);

// 强制将面板挂到 body 直属层级，避免被 SillyTavern 的容器遮挡
const tutuPanel = document.getElementById('tutu_theater_panel');

if (tutuPanel && tutuPanel.parentElement !== document.body) {
    document.body.appendChild(tutuPanel);
}


    // ==========================================
    // 3. 核心逻辑函数
    // ==========================================
function updatePresetFileDropdown() {
    const type = $('#tutu_preset_type').val(); // 'worldbook' 或 'openai'
    const $fileSelect = $('#tutu_preset_file');

    $fileSelect.empty();

    if (type === 'worldbook') {
        // 读取 SillyTavern 的世界书列表
        const worldBooks = Array.isArray(world_names) ? world_names : [];

        if (worldBooks.length === 0) {
            $fileSelect.append(
                $('<option>', {
                    value: '',
                    text: '没有找到世界书'
                })
            );

            $('#tutu_native_prompts_list').html(
                '<div style="text-align:center; padding:20px; opacity:0.7;">没有找到世界书</div>'
            );

            return;
        }

        worldBooks.forEach(worldBookName => {
            $fileSelect.append(
                $('<option>', {
                    value: worldBookName,
                    text: worldBookName
                })
            );
        });

        // 默认选中第一本世界书
        $fileSelect.prop('selectedIndex', 0);

        fetchAndRenderNativePrompts();
        return;
    }

    // 对话补全预设
    const sourceSelector = '#settings_preset_openai';

    $(sourceSelector + ' option').each(function () {
        const val = $(this).val();
        const text = $(this).text().trim();

        // 跳过空选项
        if (text && val !== undefined) {
            $fileSelect.append(
                $('<option>', {
                    value: text,
                    text: text
                })
            );
        }
    });

    // 默认选中当前正在使用的对话补全预设
    const currentActiveName = $(sourceSelector + ' option:selected')
        .text()
        .trim();

    if (currentActiveName) {
        $fileSelect.val(currentActiveName);
    }

    fetchAndRenderNativePrompts();
}



function switchTutuTab(tabId) {
    $('.tutu-icon-tab').removeClass('active');
    $('.tutu-tab-content').removeClass('active');

    $(`.tutu-icon-tab[data-tab="${tabId}"]`)
        .addClass('active');

    $(`#${tabId}`)
        .addClass('active');

    if (tabId === 'tutu_tab_favorites') {
        renderTutuFavorites();
    }
}


$(document).on('click', '.tutu-icon-tab', function () {
    switchTutuTab($(this).data('tab'));
});

function getTutuCharacterStorageKey(character, context) {
    /*
     * characterId 在大多数情况下可以区分角色。
     * 同时加入角色头像和名称，避免某些版本中的 ID 冲突。
     */
    const characterId =
        context?.characterId !== undefined
            ? String(context.characterId)
            : 'none';

    const avatar =
        character?.avatar ||
        character?.data?.avatar ||
        '';

    const name =
        character?.name ||
        character?.data?.name ||
        'AI';

    return `${characterId}::${avatar}::${name}`;
}

function getCurrentTutuCharacterStorage() {
    const context = SillyTavern.getContext();

    const character =
        context.characterId !== undefined &&
        context.characters?.[context.characterId]
            ? context.characters[context.characterId]
            : null;

    const key = getTutuCharacterStorageKey(character, context);

    if (!tutuCharacterContexts[key]) {
        tutuCharacterContexts[key] = {
            selectedWorldEntries: [],
            includeHistory: false,
            historyLimit: 20,
        };
    }

    return {
        context,
        character,
        key,
        settings: tutuCharacterContexts[key],
    };
}

function saveCurrentTutuCharacterStorage(settings) {
    const current = getCurrentTutuCharacterStorage();

    tutuCharacterContexts[current.key] = {
        selectedWorldEntries: Array.isArray(settings.selectedWorldEntries)
            ? settings.selectedWorldEntries
            : [],

        includeHistory: Boolean(settings.includeHistory),

        historyLimit:
            Number(settings.historyLimit) > 0
                ? Number(settings.historyLimit)
                : 20,
    };

    localStorage.setItem(
        CHARACTER_CONTEXT_KEY,
        JSON.stringify(tutuCharacterContexts)
    );
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
/**
 * 尽可能提取 API 返回的详细错误原因
 */
function getTutuErrorMessage(error) {
    if (!error) {
        return '未知错误';
    }

    // 普通 Error
    if (error instanceof Error && error.message) {
        return String(error.message).trim();
    }

    // fetch 或自定义 API 可能挂载了 response
    if (error.response) {
        const response = error.response;

        if (typeof response === 'string') {
            return response;
        }

        if (response.data) {
            try {
                return JSON.stringify(response.data, null, 2);
            } catch {
                return String(response.data);
            }
        }

        if (response.status || response.statusText) {
            return [
                response.status
                    ? `HTTP ${response.status}`
                    : '',
                response.statusText || '',
            ]
                .filter(Boolean)
                .join(' ');
        }
    }

    // 自定义错误对象可能有 responseText
    if (error.responseText) {
        return String(error.responseText);
    }

    // OpenAI 兼容接口常见错误格式
    if (error.error) {
        if (typeof error.error === 'string') {
            return error.error;
        }

        try {
            return JSON.stringify(error.error, null, 2);
        } catch {
            return String(error.error);
        }
    }

    if (typeof error === 'string') {
        return error;
    }

    try {
        return JSON.stringify(error, null, 2);
    } catch {
        return String(error);
    }
}

function isProbablyHtml(text) {
    if (!text || typeof text !== 'string') {
        return false;
    }

    const value = text.trim();

    return (
        /^<!doctype html/i.test(value) ||
        /^<html[\s>]/i.test(value) ||
        /<(div|section|article|main|body|style|table|h1|h2|p|img|button|form)[\s>]/i.test(value)
    );
}
function cleanGeneratedContent(content) {
    let text = String(content || '').trim();

    if (!text) {
        return '';
    }

    /*
     * 去除开头可能存在的说明文字。
     *
     * 只有当内容中确实存在代码围栏时才处理，
     * 避免误删普通文字。
     */
    const fencedMatch = text.match(
        /```(?:html|HTML|xml|XML)?\s*([\s\S]*?)```/
    );

    if (fencedMatch) {
        text = fencedMatch[1].trim();
    } else {
        /*
         * 没有完整代码围栏时，单独清除首尾围栏。
         */
        text = text
            .replace(/^\s*```(?:html|HTML|xml|XML)?\s*\r?\n?/, '')
            .replace(/\r?\n?\s*```\s*$/, '')
            .trim();
    }

    return text;
}
function updateTutuFavoriteButtonState() {
    const content =
        String(tutuCurrentResultContent || '').trim();

    const $button = $('#tutu_favorite_current_btn');

    if (!$button.length) {
        return;
    }

    if (!content) {
        $button.removeClass('active');

        $button.find('i')
            .attr('class', 'fa-regular fa-heart');

        return;
    }

    const favorites = loadTutuFavorites();

const currentCharacterName =
    getCurrentTutuCharacterName();

const isFavorited = favorites.some(item =>
    item.content === content &&
    item.characterName === currentCharacterName
);

    $button.toggleClass('active', isFavorited);

    $button.find('i').attr(
        'class',
        isFavorited
            ? 'fa-solid fa-heart'
            : 'fa-regular fa-heart'
    );
}
function downloadTutuBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 1000);
}

function sanitizeTutuFilename(name) {
    return String(name || '兔兔小剧场')
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) || '兔兔小剧场';
}
function exportTutuTextFile(content, characterName) {
    const text = String(content || '').trim();

    if (!text) {
        toastr.warning('没有可以导出的文字内容');
        return;
    }

    const title = `兔兔小剧场 - ${characterName}`;

    const output = [
        title,
        `角色：${characterName}`,
        `时间：${new Date().toLocaleString()}`,
        '',
        text,
    ].join('\n');

    const blob = new Blob(
        [output],
        {
            type: 'text/plain;charset=utf-8',
        }
    );

    const filename =
        `${sanitizeTutuFilename(title)}.txt`;

    downloadTutuBlob(blob, filename);

    toastr.success('纯文本已导出');
}
function wrapTutuCanvasText(ctx, text, maxWidth) {
    const lines = [];
    const paragraphs = String(text || '').split(/\r?\n/);

    paragraphs.forEach(paragraph => {
        if (!paragraph) {
            lines.push('');
            return;
        }

        let currentLine = '';

        for (const char of paragraph) {
            const testLine = currentLine + char;

            if (
                ctx.measureText(testLine).width > maxWidth &&
                currentLine
            ) {
                lines.push(currentLine);
                currentLine = char;
            } else {
                currentLine = testLine;
            }
        }

        if (currentLine) {
            lines.push(currentLine);
        }
    });

    return lines;
}

function getTutuQuoteStyle(styleName) {
    const styles = {
        classic: {
            background: '#f6efe2',
            text: '#3b3028',
            accent: '#9d7655',
            quote: '#d3b18b',
            font: '"Noto Serif SC", "Source Han Serif SC", serif',
        },

        dark: {
            background: '#171923',
            text: '#f2e9dc',
            accent: '#e0a96d',
            quote: '#755b43',
            font: '"Noto Serif SC", "Source Han Serif SC", serif',
        },

        paper: {
            background: '#fffdf5',
            text: '#403b35',
            accent: '#71806a',
            quote: '#dce4d7',
            font: '"Noto Serif SC", "Source Han Serif SC", serif',
        },
    };

    return styles[styleName] || styles.classic;
}

async function exportTutuQuoteImage(
    content,
    characterName,
    styleName = 'classic'
) {
    const text = String(content || '').trim();

    if (!text) {
        toastr.warning('没有可以导出的文字内容');
        return;
    }

    const style = getTutuQuoteStyle(styleName);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const width = 1200;
    const padding = 90;
    const contentWidth = width - padding * 2;

    const title = '兔兔小剧场';
    const subtitle = `来自：${characterName}`;

    const bodyFontSize = 32;
    const lineHeight = 58;

    ctx.font =
        `${bodyFontSize}px ${style.font}`;

    const lines = wrapTutuCanvasText(
        ctx,
        text,
        contentWidth
    );

    const bodyHeight = lines.length * lineHeight;

    const height = Math.max(
        720,
        padding * 2 +
        150 +
        bodyHeight +
        100
    );

    canvas.width = width;
    canvas.height = height;

    // 背景
    ctx.fillStyle = style.background;
    ctx.fillRect(0, 0, width, height);

    // 上方装饰线
    ctx.fillStyle = style.accent;
    ctx.fillRect(padding, 65, width - padding * 2, 4);

    // 大引号
    ctx.fillStyle = style.quote;
    ctx.font = `bold 150px Georgia, serif`;
    ctx.fillText('“', padding - 20, 205);

    // 标题
    ctx.fillStyle = style.accent;
    ctx.font =
        `bold 42px ${style.font}`;

    ctx.fillText(title, padding, 155);

    // 角色名
    ctx.fillStyle = style.text;
    ctx.font =
        `24px ${style.font}`;

    ctx.fillText(subtitle, padding, 215);

    // 正文
    ctx.fillStyle = style.text;
    ctx.font =
        `${bodyFontSize}px ${style.font}`;

    let y = 310;

    lines.forEach(line => {
        ctx.fillText(line, padding, y);
        y += lineHeight;
    });

    // 底部装饰
    ctx.fillStyle = style.accent;
    ctx.fillRect(
        padding,
        height - 80,
        width - padding * 2,
        3
    );

    ctx.fillStyle = style.text;
    ctx.font =
        `22px ${style.font}`;

    ctx.fillText(
        new Date().toLocaleDateString(),
        padding,
        height - 40
    );

    canvas.toBlob(blob => {
        if (!blob) {
            toastr.error('生成书摘图片失败');
            return;
        }

        const filename =
            `${sanitizeTutuFilename(
                `兔兔小剧场-${characterName}`
            )}.png`;

        downloadTutuBlob(blob, filename);

        toastr.success('书摘图片已导出');
    }, 'image/png');
}
function exportTutuHtmlFile(content, characterName) {
    const htmlContent = String(content || '').trim();

    if (!htmlContent) {
        toastr.warning('没有可以导出的 HTML 内容');
        return;
    }

    const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>兔兔小剧场 - ${escapeHtml(characterName)}</title>
<style>
html, body {
    margin: 0;
    padding: 0;
    background: #f5f5f5;
}

body {
    padding: 24px;
    box-sizing: border-box;
}
</style>
</head>
<body>
${htmlContent}
</body>
</html>`;

    const blob = new Blob(
        [fullHtml],
        {
            type: 'text/html;charset=utf-8',
        }
    );

    const filename =
        `${sanitizeTutuFilename(
            `兔兔小剧场-${characterName}`
        )}.html`;

    downloadTutuBlob(blob, filename);

    toastr.success('HTML 文件已导出');
}
function exportCurrentTutuTheater() {
    const content =
        String(tutuCurrentResultContent || '').trim();

    if (!content) {
        toastr.warning('当前没有可以导出的内容');
        return;
    }

    exportTutuContent(
        content,
        tutuCurrentResultCharacter || 'AI'
    );
}


function showTutuResult(content) {
    content = String(content || '');

    // 保存当前结果，供收藏和导出使用
    tutuCurrentResultContent = content;
    tutuCurrentResultType = isProbablyHtml(content)
        ? 'html'
        : 'text';

    tutuCurrentResultCharacter =
        getCurrentTutuCharacterName();

    $('#tutu_result_source').text(content);
    $('#tutu_result_status').text(
        isProbablyHtml(content)
            ? '检测到 HTML 内容，可以切换到预览模式。'
            : '生成完成。'
    );

    const $preview = $('#tutu_result_preview');
    $preview.empty();

    if (!content.trim()) {
        $preview.html(`
            <div class="tutu-result-placeholder">
                没有生成内容。
            </div>
        `);
        return;
    }

    if (isProbablyHtml(content)) {
        const iframe = document.createElement('iframe');

        /*
         * sandbox 可以防止生成的 HTML 直接操作酒馆页面。
         * 如果你确实需要 HTML 内的 JavaScript，
         * 可以改成：iframe.setAttribute('sandbox', 'allow-scripts');
         *
         * 但不建议允许脚本操作父页面。
         */
// 允许生成页面运行 JavaScript。
// 不添加 allow-same-origin，避免生成内容访问酒馆页面的 Cookie、LocalStorage 等。
iframe.setAttribute(
    'sandbox',
    'allow-scripts allow-forms allow-modals'
);

iframe.srcdoc = content;


        $preview.append(iframe);

        $('#tutu_show_preview_btn').show();
        $('#tutu_show_source_btn').show();

        showTutuResultMode('preview');
    } else {
        const $plain = $('<div class="tutu-plain-preview"></div>');
        $plain.text(content);

        $preview.append($plain);

        $('#tutu_show_preview_btn').show();
        $('#tutu_show_source_btn').show();

        showTutuResultMode('preview');
    }
    updateTutuFavoriteButtonState();
}
// ==========================================
// 嵌入聊天楼层
// ==========================================

const TUTU_THEATER_START = '<!-- TUTU_THEATER_START -->';
const TUTU_THEATER_END = '<!-- TUTU_THEATER_END -->';

/**
 * 从消息文本中移除旧的小剧场内容
 */
function stripTutuTheaterFromMessage(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }

    const regex = new RegExp(
        TUTU_THEATER_START + '[\\s\\S]*?' + TUTU_THEATER_END,
        'g'
    );

    return text.replace(regex, '').trimEnd();
}

async function embedTutuTheaterToChat(
    content,
    allowReplace = false
) {

    content = String(content || '').trim();

    if (!content) {
        toastr.warning('没有可嵌入的内容');
        return;
    }

    const context = SillyTavern.getContext();
    const chat = Array.isArray(context.chat) ? context.chat : [];

    // 找到最后一条 AI 消息
    let lastAiIndex = -1;

    for (let i = chat.length - 1; i >= 0; i--) {
        if (!chat[i].is_user) {
            lastAiIndex = i;
            break;
        }
    }

    if (lastAiIndex === -1) {
        toastr.warning('找不到 AI 回复消息，无法嵌入');
        return;
    }
const message = chat[lastAiIndex];

/*
 * 自动生成时：
 * 如果这一层已经有小剧场，就不再重复生成。
 *
 * 手动生成时 allowReplace = true，
 * 可以重新生成并替换这一层的小剧场。
 */
if (
    !allowReplace &&
    String(message.mes || '')
        .includes(TUTU_THEATER_START)
) {
    toastr.info(
        '这一层已经生成过小剧场，未重复嵌入'
    );

    return;
}

// 先移除旧的小剧场内容
let originalMes =
    stripTutuTheaterFromMessage(message.mes);


    // 构建小剧场块 —— 注意：不要用 HTML 标签，
    // 因为 SillyTavern 的消息格式化可能会破坏它。
    // 改用纯文本标记 + 在 DOM 层面追加渲染后的 HTML。
    const theaterMarker = `\n\n${TUTU_THEATER_START}\n${TUTU_THEATER_END}`;

    // 在 mes 字段中只保存标记（用于正则过滤）
    // 实际显示内容通过 DOM 操作追加
    message.mes = originalMes + theaterMarker;

    // 保存聊天记录
    try {
        await context.saveChat?.();
    } catch (e) {
        console.warn('保存聊天记录时出错：', e);
    }

    // 在 DOM 层面追加小剧场内容
    try {
        const $messageBlock = $(`.mes[mesid="${lastAiIndex}"]`);

if (!$messageBlock.length) {
    /*
     * 找不到 DOM 时先保存内容。
     * 聊天重新渲染后由 restoreAllTutuTheaterEmbeds()
     * 自动恢复。
     */
    saveTutuTheaterContent(
        lastAiIndex,
        content
    );

    await context.reloadCurrentChat?.();

    setTimeout(() => {
        restoreAllTutuTheaterEmbeds();
    }, 300);

    return;
}

// 保存小剧场内容，以便切换聊天后恢复
saveTutuTheaterContent(lastAiIndex, content);

        appendTheaterToDOM(
    lastAiIndex,
    content,
    getCurrentTutuCharacterName()
);
    } catch (error) {
        console.error('嵌入小剧场到聊天失败：', error);
        toastr.error('嵌入失败：' + (error.message || error));
    }
}

function appendTheaterToDOM(
    mesId,
    content,
    characterName = ''
) {
    const $messageBlock = $(`.mes[mesid="${mesId}"]`);

    if (!$messageBlock.length) {
        console.warn('找不到消息 DOM 元素：', mesId);
        return;
    }

    const $mesText = $messageBlock.find('.mes_text');

    if (!$mesText.length) {
        console.warn('找不到 .mes_text 元素');
        return;
    }

    // 先移除该楼层中已有的小剧场 DOM
    $mesText.find('.tutu-theater-embed').remove();

    content = String(content || '').trim();

    /*
     * true  = 默认折叠
     * false = 默认展开
     */
    const isCollapsed =
        Boolean(tutuSettings.embedDefaultCollapsed);

const details = document.createElement('details');
details.className = 'tutu-theater-embed';
details.open = !isCollapsed;

/*
 * 保存内容到 DOM 节点自身。
 * 这样点击收藏、导出、放大时可以直接取出原始内容，
 * 不需要把 HTML 内容塞进 data-* 属性。
 */
details._tutuTheaterContent = content;
details._tutuTheaterCharacter =
    String(
        characterName ||
        getCurrentTutuCharacterName() ||
        'AI'
    ).trim() || 'AI';


const summary = document.createElement('summary');
summary.className = 'tutu-theater-embed-header';

const titleSpan = document.createElement('span');
titleSpan.className = 'tutu-theater-embed-title';
titleSpan.textContent = '🐰 兔兔小剧场';

const toggleSpan = document.createElement('span');
toggleSpan.className = 'tutu-theater-embed-toggle';
toggleSpan.textContent = '点击展开/折叠';

const embedActions = document.createElement('span');
embedActions.className = 'tutu-theater-embed-actions';

function createEmbedActionButton(
    iconClass,
    titleText,
    handler
) {
    const button = document.createElement('button');

    button.type = 'button';
    button.className = 'tutu-theater-embed-action';
    button.title = titleText;

    button.innerHTML =
        `<i class="${iconClass}"></i>`;

    /*
     * 防止点击按钮时触发 details 展开/折叠
     */
    button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();

        handler();
    });

    return button;
}

const embedFavoriteButton =
    createEmbedActionButton(
        'fa-regular fa-heart',
        '收藏小剧场',
        () => {
            favoriteTutuContent(
                details._tutuTheaterContent,
                details._tutuTheaterCharacter
            );
        }
    );

const embedExportButton =
    createEmbedActionButton(
        'fa-solid fa-file-export',
        '导出小剧场',
        () => {
            exportTutuContent(
                details._tutuTheaterContent,
                details._tutuTheaterCharacter
            );
        }
    );

const embedFullscreenButton =
    createEmbedActionButton(
        'fa-solid fa-expand',
        '放大查看小剧场',
        () => {
            openTutuTheaterFullscreen(
                details._tutuTheaterContent,
                details._tutuTheaterCharacter
            );
        }
    );

embedActions.appendChild(embedFavoriteButton);
embedActions.appendChild(embedExportButton);
embedActions.appendChild(embedFullscreenButton);

summary.appendChild(titleSpan);
summary.appendChild(toggleSpan);
summary.appendChild(embedActions);


    const body = document.createElement('div');
    body.className = 'tutu-theater-embed-body';

    /*
     * HTML 内容必须放进 iframe.srcdoc。
     *
     * iframe 会建立独立的文档环境，
     * 其中的 style、body、html、CSS 选择器不会影响
     * SillyTavern 外部页面。
     */
    if (isProbablyHtml(content)) {
        const iframe = document.createElement('iframe');

        iframe.className = 'tutu-theater-embed-iframe';
        iframe.title = '兔兔小剧场 HTML 内容';

        /*
         * 不允许 allow-same-origin，
         * 这样 iframe 内的 HTML 无法访问酒馆页面的
         * Cookie、LocalStorage、DOM 等内容。
         *
         * 如果你的 HTML 只需要显示，不需要 JavaScript，
         * 可以直接使用 sandbox=""，安全性更高。
         */
        iframe.setAttribute(
            'sandbox',
            'allow-scripts allow-forms allow-modals'
        );

        iframe.srcdoc = content;

        body.appendChild(iframe);
    } else {
        /*
         * 纯文本使用 textContent，
         * 不使用 innerHTML，避免文本被当成 HTML 执行。
         */
        body.textContent = content;
    }

    details.appendChild(summary);
    details.appendChild(body);

    // 使用 DOM 节点追加，不使用 HTML 字符串拼接
    $mesText[0].appendChild(details);
}


// ==========================================
// 小剧场收藏、导出、全屏查看通用函数
// ==========================================

function favoriteTutuContent(content, characterName, title = '') {
    const text = String(content || '').trim();

    if (!text) {
        toastr.warning('当前没有可以收藏的小剧场');
        return;
    }

    const finalCharacterName =
        String(characterName || 'AI').trim() || 'AI';

    const titleInput = window.prompt(
        '请输入这个小剧场的收藏名称：',
        title || `来自${finalCharacterName}的小剧场`
    );

    if (titleInput === null) {
        return;
    }

    const finalTitle =
        String(titleInput || '').trim() || '未命名小剧场';

    const favorites = loadTutuFavorites();

    const record = {
        id:
            typeof crypto?.randomUUID === 'function'
                ? crypto.randomUUID()
                : `favorite-${Date.now()}-${Math.random()
                    .toString(16)
                    .slice(2)}`,

        title: finalTitle,

        content: text,

        type: isProbablyHtml(text)
            ? 'html'
            : 'text',

        characterName: finalCharacterName,

        createdAt: Date.now(),
    };

    favorites.unshift(record);

    saveTutuFavorites(favorites);

    renderTutuFavorites();

    toastr.success(
        `已收藏：「${record.title}」`,
        '兔兔小剧场'
    );
}

function exportTutuContent(
    content,
    characterName = 'AI'
) {
    const text = String(content || '').trim();

    if (!text) {
        toastr.warning('当前没有可以导出的内容');
        return;
    }

    const finalCharacterName =
        String(characterName || 'AI').trim() || 'AI';

    /*
     * HTML 内容直接导出为 HTML 文件
     */
    if (isProbablyHtml(text)) {
        exportTutuHtmlFile(
            text,
            finalCharacterName
        );

        return;
    }

    const exportFormat =
        $('#tutu_export_format').val() || 'text';

    if (exportFormat === 'text') {
        exportTutuTextFile(
            text,
            finalCharacterName
        );

        return;
    }

    const styleName =
        $('#tutu_export_style').val() || 'classic';

    exportTutuQuoteImage(
        text,
        finalCharacterName,
        styleName
    );
}


/**
 * 创建全屏小剧场查看层
 *
 * HTML 内容使用 iframe.srcdoc。
 * 这样 HTML 内的 CSS、JS、按钮、表单都可以在自己的文档中运行，
 * 但不会影响 SillyTavern 主页面。
 */
function openTutuTheaterFullscreen(
    content,
    characterName = 'AI'
) {
    const text = String(content || '').trim();

    if (!text) {
        toastr.warning('当前没有可以查看的小剧场');
        return;
    }

    closeTutuTheaterFullscreen();

    const finalCharacterName =
        String(characterName || 'AI').trim() || 'AI';

    const overlay = document.createElement('div');
    overlay.id = 'tutu_theater_fullscreen';

    const header = document.createElement('div');
    header.className = 'tutu-fullscreen-header';

    const title = document.createElement('div');
    title.className = 'tutu-fullscreen-title';
    title.textContent =
        `🐰 兔兔小剧场 · ${finalCharacterName}`;

    const actions = document.createElement('div');
    actions.className = 'tutu-fullscreen-actions';

    const favoriteButton = document.createElement('button');
    favoriteButton.type = 'button';
    favoriteButton.className = 'tutu-fullscreen-action-btn';
    favoriteButton.title = '收藏小剧场';
    favoriteButton.innerHTML =
        '<i class="fa-regular fa-heart"></i>';

    favoriteButton.addEventListener('click', event => {
        event.stopPropagation();

        favoriteTutuContent(
            text,
            finalCharacterName
        );
    });

    const exportButton = document.createElement('button');
    exportButton.type = 'button';
    exportButton.className = 'tutu-fullscreen-action-btn';
    exportButton.title = '导出小剧场';
    exportButton.innerHTML =
        '<i class="fa-solid fa-file-export"></i>';

    exportButton.addEventListener('click', event => {
        event.stopPropagation();

        exportTutuContent(
            text,
            finalCharacterName
        );
    });

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className =
        'tutu-fullscreen-action-btn tutu-fullscreen-close-btn';
    closeButton.title = '关闭全屏';
    closeButton.innerHTML =
        '<i class="fa-solid fa-xmark"></i>';

    closeButton.addEventListener('click', event => {
        event.stopPropagation();

        closeTutuTheaterFullscreen();
    });

    actions.appendChild(favoriteButton);
    actions.appendChild(exportButton);
    actions.appendChild(closeButton);

    header.appendChild(title);
    header.appendChild(actions);

    const body = document.createElement('div');
    body.className = 'tutu-fullscreen-body';

    if (isProbablyHtml(text)) {
        const iframe = document.createElement('iframe');

        iframe.className = 'tutu-fullscreen-iframe';
        iframe.title = '兔兔小剧场全屏内容';

        iframe.setAttribute(
            'sandbox',
            'allow-scripts allow-forms allow-modals'
        );

        iframe.srcdoc = text;

        body.appendChild(iframe);
    } else {
        const plain = document.createElement('div');

        plain.className = 'tutu-fullscreen-plain';
        plain.textContent = text;

        body.appendChild(plain);
    }

    overlay.appendChild(header);
    overlay.appendChild(body);

    document.body.appendChild(overlay);

    document.body.classList.add(
        'tutu-fullscreen-open'
    );

    /*
     * ESC 关闭全屏
     */
    overlay._tutuEscHandler = event => {
        if (event.key === 'Escape') {
            closeTutuTheaterFullscreen();
        }
    };

    document.addEventListener(
        'keydown',
        overlay._tutuEscHandler
    );
}

function closeTutuTheaterFullscreen() {
    const overlay =
        document.getElementById(
            'tutu_theater_fullscreen'
        );

    if (overlay) {
        if (overlay._tutuEscHandler) {
            document.removeEventListener(
                'keydown',
                overlay._tutuEscHandler
            );
        }

        overlay.remove();
    }

    document.body.classList.remove(
        'tutu-fullscreen-open'
    );
}


function showTutuResultMode(mode) {
    if (mode === 'source') {
        $('#tutu_result_preview').hide();
        $('#tutu_result_source').show();

        $('#tutu_show_source_btn').addClass('active');
        $('#tutu_show_preview_btn').removeClass('active');
    } else {
        $('#tutu_result_preview').show();
        $('#tutu_result_source').hide();

        $('#tutu_show_preview_btn').addClass('active');
        $('#tutu_show_source_btn').removeClass('active');
    }
}
let tutuCurrentCharacterContext = {
    character: null,
    characterName: 'AI',

    // 当前角色描述
    description: '',

    // 当前用户人设
    userPersona: '',

    worldBookName: '',
    worldEntries: [],
    storageKey: '',
    selectedWorldEntries: [],
    includeHistory: false,
    historyLimit: 20,
};




function getCurrentTutuCharacter() {
    const context = SillyTavern.getContext();

    const character =
        context.characterId !== undefined &&
        context.characters?.[context.characterId]
            ? context.characters[context.characterId]
            : null;

    return {
        context,
        character
    };
}
function getCurrentUserPersona(context) {
    if (!context) {
        return '';
    }

    /*
     * 不同版本的 SillyTavern 可能把用户人设放在不同位置，
     * 这里按照常见字段依次兼容读取。
     */

    const persona =
        context.userPersona ||
        context.userPersonaDescription ||
        context.personaDescription ||
        context.powerUserSettings?.persona_description ||
        context.power_user_settings?.persona_description ||
        '';

    return String(persona || '').trim();
}

function getCharacterDescription(character) {
    if (!character) {
        return '';
    }

    return String(
        character.description ||
        character.data?.description ||
        ''
    ).trim();
}

function getCharacterWorldBookName(character) {
    if (!character) {
        return '';
    }

    /*
     * 不同版本的 SillyTavern 可能使用不同位置保存角色世界书名称，
     * 所以这里做多个兼容读取。
     */
    const worldBookName =
        character.data?.extensions?.world ||
        character.data?.extensions?.world_info ||
        character.data?.extensions?.worldbook ||
        character.extensions?.world ||
        character.extensions?.world_info ||
        character.extensions?.worldbook ||
        '';

    return String(worldBookName || '').trim();
}

function getWorldEntryName(entry, index) {
    let name =
        entry.comment ||
        entry.name ||
        (
            Array.isArray(entry.key)
                ? entry.key.join(', ')
                : entry.key
        ) ||
        `世界书条目 ${index + 1}`;

    if (entry.enabled === false) {
        name = `🚫 [禁用] ${name}`;
    }

    return String(name);
}

function renderTutuCharacterBasicInfo() {
    const character = tutuCurrentCharacterContext.character;

    if (!character) {
        $('#tutu_current_character_name').text('当前角色：未找到角色');
        $('#tutu_character_description_preview').text('没有找到当前角色描述');
        return;
    }

    $('#tutu_current_character_name').text(
        `当前角色：${tutuCurrentCharacterContext.characterName}`
    );

    $('#tutu_character_description_preview').text(
        tutuCurrentCharacterContext.description || '当前角色没有填写角色描述'
    );
}

function renderTutuWorldBookEntries() {
    const $list = $('#tutu_character_worldbook_entries');
    $list.empty();

    const worldBookName = tutuCurrentCharacterContext.worldBookName;
    const entries = tutuCurrentCharacterContext.worldEntries;
    const selectedEntries =
        tutuCurrentCharacterContext.selectedWorldEntries || [];

    if (!worldBookName) {
        $('#tutu_character_worldbook_name').text(
            '当前角色没有绑定角色世界书'
        );

        $list.html(`
            <div style="opacity:0.7;">
                没有可选择的世界书条目
            </div>
        `);

        return;
    }

    $('#tutu_character_worldbook_name').text(
        `世界书：${worldBookName}`
    );

    if (!entries.length) {
        $list.html(`
            <div style="opacity:0.7;">
                世界书中没有找到可用条目
            </div>
        `);

        return;
    }

    entries.forEach((entry, index) => {
        const entryKey = String(entry.key ?? index);

        const name = escapeHtml(entry.name);
        const content = escapeHtml(entry.content);

        const isChecked = selectedEntries.includes(entryKey);

        const $item = $(`
            <label class="tutu-world-entry-item">
                <input
                    type="checkbox"
                    class="tutu-character-world-entry-checkbox"
                    data-index="${index}"
                    data-entry-key="${escapeHtml(entryKey)}"
                    ${isChecked ? 'checked' : ''}>

                <div>
                    <div class="tutu-world-entry-name">
                        ${name}
                    </div>

                    <div class="tutu-world-entry-preview">
                        ${content}
                    </div>
                </div>
            </label>
        `);

        $list.append($item);
    });
}
function loadTutuCharacterOptionsToUI() {
    $('#tutu_include_history').prop(
        'checked',
        Boolean(tutuCurrentCharacterContext.includeHistory)
    );

    $('#tutu_history_limit').val(
        tutuCurrentCharacterContext.historyLimit || 20
    );

    if (tutuCurrentCharacterContext.includeHistory) {
        $('#tutu_history_limit_box').show();
    } else {
        $('#tutu_history_limit_box').hide();
    }
}


async function refreshTutuCharacterContext() {
    const { character } = getCurrentTutuCharacter();

    const context = SillyTavern.getContext();

    const characterName =
        character?.name ||
        character?.data?.name ||
        'AI';

    const description = getCharacterDescription(character);

    // 自动读取当前用户人设，不显示在界面上
    const userPersona = getCurrentUserPersona(context);

    const worldBookName = getCharacterWorldBookName(character);
const characterStorage = getCurrentTutuCharacterStorage();

tutuCurrentCharacterContext = {
    character,
    characterName,

    // 当前角色描述，后台读取，不显示
    description,

    // 当前用户人设，后台读取，不显示
    userPersona,

    worldBookName,
    worldEntries: [],
    storageKey: characterStorage.key,
    selectedWorldEntries:
        characterStorage.settings.selectedWorldEntries || [],
    includeHistory:
        Boolean(characterStorage.settings.includeHistory),
    historyLimit:
        Number(characterStorage.settings.historyLimit) || 20,
};



    renderTutuCharacterBasicInfo();

    if (!worldBookName) {
        renderTutuWorldBookEntries();
        loadTutuCharacterOptionsToUI();
        return;
    }

    $('#tutu_character_worldbook_name').text(
        `世界书：${worldBookName}`
    );

    $('#tutu_character_worldbook_entries').html(`
        <div style="opacity:0.7;">
            <i class="fa-solid fa-spinner fa-spin"></i>
            正在读取世界书条目...
        </div>
    `);

    try {
        const data = await loadWorldInfo(worldBookName);

        if (!data) {
            throw new Error('世界书数据为空');
        }

        const rawEntries = Array.isArray(data.entries)
            ? data.entries
            : Object.values(data.entries || {});

        tutuCurrentCharacterContext.worldEntries = rawEntries
            .map((entry, index) => {
                if (!entry) {
                    return null;
                }

                const content = String(entry.content || '').trim();

                if (!content) {
                    return null;
                }

return {
    key: String(entry.uid ?? entry.id ?? index),
    name: getWorldEntryName(entry, index),
    content
};

            })
            .filter(Boolean);

        renderTutuWorldBookEntries();

    } catch (error) {
        console.error('读取角色世界书失败：', error);

        $('#tutu_character_worldbook_entries').html(`
            <div style="color:red;">
                读取世界书失败：${escapeHtml(error.message || error)}
            </div>
        `);
    }
}
function getSelectedTutuWorldEntries() {
    const selectedEntries = [];

    $('.tutu-character-world-entry-checkbox:checked').each(function () {
        const index = Number($(this).data('index'));
        const entry = tutuCurrentCharacterContext.worldEntries[index];

        if (entry) {
            selectedEntries.push(entry);
        }
    });

    return selectedEntries;
}


function getTutuHistoryText() {
    if (!tutuCurrentCharacterContext.includeHistory) {
        return '';
    }

    const context = SillyTavern.getContext();

    const chat = Array.isArray(context.chat)
        ? context.chat
        : [];

    let limit =
        Number(tutuCurrentCharacterContext.historyLimit) || 20;

    limit = Math.min(Math.max(limit, 1), 100);

    const messages = chat.slice(-limit);

    if (!messages.length) {
        return '当前没有可读取的历史聊天记录。';
    }

    return messages
        .map((message, index) => {
            const name =
                message.name ||
                (message.is_user ? '用户' : '角色');

            const content =
                message.mes ||
                message.content ||
                '';

            return `[${index + 1}] ${name}：\n${String(content).trim()}`;
        })
        .filter(text => text.trim())
        .join('\n\n');
}

function saveTutuWorldEntrySelection() {
    const selectedKeys = [];

    $('.tutu-character-world-entry-checkbox:checked').each(function () {
        selectedKeys.push(String($(this).data('entry-key')));
    });

    tutuCurrentCharacterContext.selectedWorldEntries = selectedKeys;

    saveCurrentTutuCharacterStorage({
        selectedWorldEntries: selectedKeys,
        includeHistory: $('#tutu_include_history').is(':checked'),
        historyLimit: Number($('#tutu_history_limit').val()) || 20,
    });
}

function buildTutuContextPrompt(userScenario) {
    const characterName =
        tutuCurrentCharacterContext.characterName || 'AI';

    const characterDescription =
        tutuCurrentCharacterContext.description ||
        '当前角色没有提供角色描述。';

    const userPersona =
        tutuCurrentCharacterContext.userPersona ||
        '当前用户没有提供用户人设。';

    const selectedWorldEntries = getSelectedTutuWorldEntries();


    const worldBookText = selectedWorldEntries.length
        ? selectedWorldEntries
            .map((entry, index) => {
                return `【世界书条目 ${index + 1}：${entry.name}】\n${entry.content}`;
            })
            .join('\n\n')
        : '用户没有选择任何世界书条目。';

    const historyText = getTutuHistoryText();

    let prompt = `
请根据以下信息，写一段关于「${characterName}」的外置小剧场。

【角色名称】
${characterName}

【角色描述】
${characterDescription}

【用户人设】
${userPersona}

【用户提供的情境】
${userScenario}

【用户选择读取的世界书条目】
${worldBookText}

要求：
要求：
1. 这是独立于正文对话之外的番外内容。
2. 必须符合角色描述中的性格、身份、背景和说话方式。
3. 如果提供了用户人设，请让用户角色的身份、性格和行为符合用户人设。
4. 如果提供了世界书条目，请将其中相关设定自然地融入内容。
5. 内容要生动、有画面感、有一定故事性。
6. 不要解释你的写作过程。
7. 如果用户要求 HTML，请直接输出完整可渲染的 HTML。
8. 如果输出 HTML，不要使用 Markdown 代码围栏，不要输出 \`\`\`html。
9. 如果没有要求 HTML，则输出普通纯文字。
`.trim();

    if (historyText) {
        prompt += `

【最近历史聊天记录】
${historyText}

请参考历史聊天记录中的人物关系、语气和当前剧情，但不要机械复制历史聊天内容。
`.trim();
    }

    return prompt;
}
function getRandomTutuScenario() {
    const scenarios = getTutuScenarioPool();

    if (!scenarios.length) {
        return null;
    }

    const index = Math.floor(
        Math.random() * scenarios.length
    );

    return scenarios[index];
}

function getSequenceTutuScenario() {
    const scenarios = getTutuScenarioPool();

    if (!scenarios.length) {
        return null;
    }

    const sequenceKey =
        getTutuScenarioSequenceKey();

    if (
        !tutuSettings.autoSequenceIndexes ||
        typeof tutuSettings.autoSequenceIndexes !== 'object'
    ) {
        tutuSettings.autoSequenceIndexes = {};
    }

    let index =
        Number(
            tutuSettings.autoSequenceIndexes[sequenceKey]
        ) || 0;

    if (index >= scenarios.length) {
        index = 0;
    }

    const scenario = scenarios[index];

    tutuSettings.autoSequenceIndexes[sequenceKey] =
        (index + 1) % scenarios.length;

    localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify(tutuSettings)
    );

    return scenario;
}

function getAutoGenerationScenario() {
    const mode =
        tutuSettings.autoGenerateMode || 'current';

    if (mode === 'random') {
        const scenario = getRandomTutuScenario();

        return scenario?.prompt || '';
    }

    if (mode === 'sequence') {
        const scenario = getSequenceTutuScenario();

        return scenario?.prompt || '';
    }

    return String(
        $('#tutu_prompt').val() || ''
    ).trim();
}

async function runTutuGeneration({
    scenario = '',
    isAutomatic = false,
} = {}) {
    if (tutuIsGenerating) {
        return;
    }

    scenario = String(scenario || '').trim();

    if (!scenario) {
        if (isAutomatic) {
            console.warn(
                '自动生成没有可用的剧本情境'
            );

            return;
        }

        toastr.warning('请先输入剧场情境！');
        return;
    }

    tutuIsGenerating = true;

    const provider =
        $('#tutu_api_provider').val() || 'main';

    $('#tutu_result_status').text(
        isAutomatic
            ? '🐰 收到最新剧情，兔兔正在生成番外……'
            : '🐰 兔兔正在疯狂码字中……'
    );

    $('#tutu_result_preview').html(`
        <div class="tutu-result-placeholder">
            🐰 正在生成小剧场……
        </div>
    `);

    $('#tutu_result_source').text('');

    $('#tutu_generate_btn')
        .addClass('disabled')
        .attr('title', '正在生成……');

    try {
await refreshTutuCharacterContext();

tutuCurrentResultCharacter =
    getCurrentTutuCharacterName();

const aiPrompt =
    buildTutuContextPrompt(scenario);


        let result;

        if (provider === 'secondary') {
            result =
                await generateBySecondaryApi(aiPrompt);
        } else {
            result = await generateRaw({
                prompt: aiPrompt,
                quietToLoud: false,
                isImpersonate: false,
            });
        }

// 在 try 块中，替换 showTutuResult(result) 部分为：

        result = cleanGeneratedContent(result);

        // ★ 根据输出方式决定结果去向
        const outputMode = tutuSettings.outputMode || 'panel';

if (outputMode === 'embed') {
    await embedTutuTheaterToChat(
        result,
        !isAutomatic
    );

    showTutuResult(result);
} else {
    // 外置面板预览
    showTutuResult(result);
}

/*
 * 生成完成提示
 */
$('#tutu_result_status').text(
    outputMode === 'embed'
        ? '生成完成，已嵌入最新 AI 回复楼层。'
        : '生成完成。'
);

if (outputMode === 'embed') {
    toastr.success(
        isAutomatic
            ? '已根据最新 AI 回复生成并嵌入小剧场'
            : '小剧场生成完成，并已嵌入聊天楼层',
        '兔兔小剧场'
    );
} else {
    toastr.success(
        isAutomatic
            ? '已根据最新 AI 回复生成小剧场'
            : '小剧场生成完成',
        '兔兔小剧场'
    );
}
} catch (error) {
    console.error(
        '小剧场生成失败：',
        error
    );

    const errorMessage =
        getTutuErrorMessage(error) ||
        '生成失败，请检查 API 配置';

    const displayError =
        `❌ 小剧场生成失败\n\n${errorMessage}`;

    $('#tutu_result_status')
        .text('❌ 生成失败，点击源码可查看详细原因');

    /*
     * 预览区显示错误原因
     */
    const $errorBox = $('<div>')
        .addClass('tutu-result-error')
        .text(displayError);

    $('#tutu_result_preview')
        .empty()
        .append($errorBox);

    /*
     * 源码区域也显示完整错误
     */
    $('#tutu_result_source')
        .text(displayError);

    /*
     * 手动生成和自动生成都提示错误
     */
    toastr.error(
        errorMessage,
        isAutomatic
            ? '兔兔小剧场自动生成失败'
            : '兔兔小剧场生成失败'
    );

} finally {
        tutuIsGenerating = false;

        $('#tutu_generate_btn')
            .removeClass('disabled')
            .attr('title', '生成小剧场');
    }
}
function getTutuLatestMessageKey() {
    const context =
        SillyTavern.getContext();

    const chat = Array.isArray(context.chat)
        ? context.chat
        : [];

    const lastMessage =
        chat[chat.length - 1];

    if (!lastMessage) {
        return '';
    }

    return [
        chat.length,
        lastMessage.mes ||
            lastMessage.content ||
            '',
        lastMessage.name || '',
    ].join('::');
}
/**
 * 获取当前聊天唯一标识
 *
 * 加入角色信息，避免不同角色之间复用同一个自动生成状态。
 */
function getTutuCurrentChatIdentity() {
    const context = SillyTavern.getContext();

    const chatId =
        context.chatId ||
        context.chat_metadata?.chat_id ||
        'default';

    const characterId =
        context.characterId !== undefined
            ? String(context.characterId)
            : 'none';

    const character =
        context.characterId !== undefined &&
        context.characters?.[context.characterId]
            ? context.characters[context.characterId]
            : null;

    const characterName =
        character?.name ||
        character?.data?.name ||
        'AI';

    const avatar =
        character?.avatar ||
        character?.data?.avatar ||
        '';

    return [
        chatId,
        characterId,
        characterName,
        avatar,
    ].join('::');
}


/**
 * 判断最新 AI 消息是否确实是在回复用户。
 *
 * 角色开场白通常前面没有用户消息，所以不会触发。
 * 只有聊天中出现用户消息后，后面的 AI 回复才允许自动生成。
 */
function getTutuLatestAiReplyInfo() {
    const context = SillyTavern.getContext();

    const chat = Array.isArray(context.chat)
        ? context.chat
        : [];

    if (!chat.length) {
        return null;
    }

    const latestIndex = chat.length - 1;
    const latestMessage = chat[latestIndex];

    /*
     * 第 0 层通常是角色开场白。
     * 无论它是不是 AI 消息，都不允许自动生成小剧场。
     */
    if (latestIndex === 0) {
        return null;
    }
    if (!latestMessage) {
        return null;
    }

    // 最新消息必须是 AI 消息
    if (latestMessage.is_user) {
        return null;
    }

    /*
     * 从最新 AI 消息往前找最近一条用户消息。
     *
     * 如果找不到，说明这是角色开场白，
     * 或者不是用户触发的回复。
     */
    let userIndex = -1;

    for (let i = latestIndex - 1; i >= 0; i--) {
        if (chat[i]?.is_user) {
            userIndex = i;
            break;
        }

        /*
         * 如果中间又出现了另一条 AI 消息，
         * 说明最新 AI 消息不是紧接着回复用户。
         *
         * 例如：
         * AI
         * AI
         *
         * 这种情况不自动生成。
         */
        if (!chat[i]?.is_user && chat[i]?.mes) {
            break;
        }
    }

    if (userIndex === -1) {
        return null;
    }

    return {
        latestIndex,
        latestMessage,
        userIndex,
    };
}


/**
 * 生成稳定的自动生成去重 Key。
 *
 * 不只使用 chat.length，
 * 还加入聊天、角色、楼层、消息正文。
 */
function getTutuAutoMessageKey(messageIndex, message) {
    const contextIdentity =
        getTutuCurrentChatIdentity();

    const messageText = String(
        message?.mes ||
        message?.content ||
        ''
    );

    return [
        contextIdentity,
        messageIndex,
        message?.name || '',
        messageText,
    ].join('::');
}

function initTutuAutoGenerationListener() {
    if (
        typeof eventSource === 'undefined' ||
        !event_types?.MESSAGE_RECEIVED
    ) {
        console.warn(
            '兔兔小剧场：没有找到 MESSAGE_RECEIVED 事件'
        );

        return;
    }

    eventSource.on(
        event_types.MESSAGE_RECEIVED,
        async () => {
            try {
                const latestSettings =
                    loadLocalJson(
                        SETTINGS_KEY,
                        tutuSettings
                    );

                tutuSettings = {
                    ...tutuSettings,
                    ...latestSettings,
                };

                if (!tutuSettings.autoGenerateEnabled) {
                    return;
                }

                /*
                 * 关键判断：
                 * 最新 AI 消息必须是对用户消息的回复。
                 *
                 * 角色开场白前面没有用户消息，
                 * 因此会直接 return。
                 */
                const replyInfo =
                    getTutuLatestAiReplyInfo();

                if (!replyInfo) {
                    console.log(
                        '[兔兔小剧场] 当前消息不是用户触发的 AI 回复，不自动生成'
                    );

                    return;
                }

const {
    latestIndex,
    latestMessage,
} = replyInfo;

/*
 * 双重保险：
 * 第 0 层永远不自动生成小剧场。
 */
if (latestIndex <= 0) {
    console.log(
        '[兔兔小剧场] 第 0 层是角色开场白，跳过自动生成'
    );

    return;
}
                /*
                 * 如果这一层已经有小剧场标记，
                 * 说明这一层以前已经生成过。
                 *
                 * 自动模式下不再重复生成。
                 */
                const latestMesText = String(
                    latestMessage.mes ||
                    latestMessage.content ||
                    ''
                );

                if (
                    latestMesText.includes(
                        TUTU_THEATER_START
                    )
                ) {
                    console.log(
                        '[兔兔小剧场] 当前 AI 楼层已经存在小剧场，跳过重复生成'
                    );

                    return;
                }

                const messageKey =
                    getTutuAutoMessageKey(
                        latestIndex,
                        latestMessage
                    );

                /*
                 * 防止同一个 MESSAGE_RECEIVED 事件、
                 * 消息更新事件重复触发。
                 */
                if (
                    messageKey &&
                    messageKey === tutuLastAutoMessageKey
                ) {
                    return;
                }

                tutuLastAutoMessageKey =
                    messageKey;

                const scenario =
                    getAutoGenerationScenario();

                if (!scenario) {
                    console.warn(
                        '兔兔小剧场：当前自动生成范围内没有可用剧本'
                    );

                    return;
                }

                await runTutuGeneration({
                    scenario,
                    isAutomatic: true,
                });

            } catch (error) {
                console.error(
                    '兔兔小剧场自动生成失败：',
                    error
                );
            }
        }
    );
}

// 监听聊天消息渲染完成，恢复嵌入的小剧场显示
function initTutuEmbedRestorer() {
    // 使用 MutationObserver 监听 .mes_text 的变化
    // 当 SillyTavern 重新渲染消息时，恢复小剧场 DOM

    if (typeof eventSource === 'undefined') {
        return;
    }

    // 聊天加载完成时恢复
    const restoreEvents = [
        event_types.CHAT_CHANGED,
        event_types.MESSAGE_UPDATED,
        event_types.CHARACTER_MESSAGE_RENDERED,
    ].filter(Boolean);

restoreEvents.forEach(eventType => {
    eventSource.on(eventType, () => {
        if (
            eventType === event_types.CHAT_CHANGED
        ) {
            tutuLastAutoMessageKey = '';
        }

        setTimeout(() => {
            restoreAllTutuTheaterEmbeds();
        }, 300);
    });
});

}

function restoreAllTutuTheaterEmbeds() {
    const context =
        SillyTavern.getContext();

    const chat =
        Array.isArray(context.chat)
            ? context.chat
            : [];

    chat.forEach((message, index) => {
        if (!message || message.is_user) {
            return;
        }

        const mes =
            String(message.mes || '');

        /*
         * 没有标记就不恢复。
         */
        if (
            !mes.includes(TUTU_THEATER_START)
        ) {
            return;
        }

        const $messageBlock =
            $(`.mes[mesid="${index}"]`);

        if (!$messageBlock.length) {
            return;
        }

        const $mesText =
            $messageBlock.find('.mes_text');

        if (!$mesText.length) {
            return;
        }

        /*
         * 已经有 DOM 就不要重复添加。
         */
        if (
            $mesText.find(
                '.tutu-theater-embed'
            ).length
        ) {
            return;
        }

        const storedTheater =
            getTutuStoredTheaterContent(index);

        if (
            !storedTheater ||
            !storedTheater.content
        ) {
            console.warn(
                '[兔兔小剧场] 找不到对应楼层的小剧场内容：',
                index
            );

            return;
        }

        appendTheaterToDOM(
            index,
            storedTheater.content,
            storedTheater.characterName
        );
    });
}


initTutuEmbedRestorer();

function normalizeSecondaryApiBase(endpoint) {
    endpoint = String(endpoint || '')
        .trim()
        .replace(/\/+$/, '');

    if (!endpoint) {
        throw new Error('没有填写副 API 地址');
    }

    /*
     * 兼容：
     * https://api.example.com
     * https://api.example.com/v1
     * https://api.example.com/v1/chat/completions
     * https://api.example.com/v1/models
     */
    endpoint = endpoint
        .replace(/\/chat\/completions\/?$/i, '')
        .replace(/\/models\/?$/i, '')
        .replace(/\/+$/, '');

    if (!/\/v1$/i.test(endpoint)) {
        endpoint += '/v1';
    }

    return endpoint;
}
async function fetchSecondaryModels() {
    const endpointInput = $('#tutu_secondary_endpoint').val().trim();
    const baseUrl = normalizeSecondaryApiBase(endpointInput);
    const apiKey = $('#tutu_secondary_api_key').val().trim();

    const $btn = $('#tutu_fetch_models_btn');
    const $select = $('#tutu_secondary_model');

    // 记住当前已选模型，拉取完成后尽量还原
    const previousModel =
        String($select.val() || tutuSettings.model || '').trim();

    $btn.addClass('disabled');

    $select
        .empty()
        .append($('<option>', { value: '', text: '正在拉取模型……' }));

    try {
        const headers = { 'Content-Type': 'application/json' };

        if (apiKey) {
            headers.Authorization = `Bearer ${apiKey}`;
        }

        const response = await fetch(`${baseUrl}/models`, {
            method: 'GET',
            headers,
        });

        const responseText = await response.text();

        if (!response.ok) {
if (!response.ok) {
    let detail = responseText;

    try {
        const errorData = JSON.parse(responseText);

        detail =
            errorData?.error?.message ||
            errorData?.error ||
            errorData?.message ||
            errorData?.detail ||
            JSON.stringify(errorData, null, 2);
    } catch {
        detail = responseText;
    }

    throw new Error(
        [
            `拉取模型失败`,
            `HTTP 状态码：${response.status}`,
            detail
                ? `错误原因：${String(detail)}`
                : '',
        ]
            .filter(Boolean)
            .join('\n')
    );
}
        }

        let data;

        try {
            data = JSON.parse(responseText);
        } catch {
            throw new Error('副 API 返回的不是 JSON：\n' + responseText);
        }

        // 兼容 OpenAI 的 { data: [...] }，也兼容直接返回数组
        const rawList = Array.isArray(data)
            ? data
            : Array.isArray(data?.data)
                ? data.data
                : Array.isArray(data?.models)
                    ? data.models
                    : [];

        const models = Array.from(
            new Set(
                rawList
                    .map(item => {
                        if (typeof item === 'string') {
                            return item;
                        }

                        return String(item?.id || item?.name || '').trim();
                    })
                    .filter(Boolean)
            )
        ).sort((a, b) => a.localeCompare(b));

        if (!models.length) {
            throw new Error('副 API 没有返回任何模型');
        }

        $select.empty();

        $select.append(
            $('<option>', { value: '', text: '请选择模型' })
        );

        models.forEach(model => {
            $select.append(
                $('<option>', { value: model, text: model })
            );
        });

        if (previousModel) {
            if (!models.includes(previousModel)) {
                $select.append(
                    $('<option>', {
                        value: previousModel,
                        text: `${previousModel}（已保存）`,
                    })
                );
            }

            $select.val(previousModel);
        }

        toastr.success(`拉取到 ${models.length} 个模型`);

    } catch (error) {
        // 失败时把下拉框恢复成可用状态，不要卡在"正在拉取"
        $select.empty();

        if (previousModel) {
            $select.append(
                $('<option>', {
                    value: previousModel,
                    text: `${previousModel}（已保存）`,
                })
            );

            $select.val(previousModel);
        } else {
            $select.append(
                $('<option>', { value: '', text: '请先拉取模型' })
            );
        }

        throw error;

    } finally {
        $btn.removeClass('disabled');
    }
}

async function generateBySecondaryApi(prompt) {
    const endpointInput =
        $('#tutu_secondary_endpoint').val().trim();

    const baseUrl =
        normalizeSecondaryApiBase(endpointInput);

    const endpoint =
        `${baseUrl}/chat/completions`;

    const apiKey =
        $('#tutu_secondary_api_key').val().trim();

const model = String($('#tutu_secondary_model').val() || '').trim();


    if (!model) {
        throw new Error(
            '请先拉取模型并选择一个模型'
        );
    }

    const headers = {
        'Content-Type': 'application/json',
    };

    if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model,
            messages: [
                {
                    role: 'user',
                    content: prompt,
                }
            ],
            temperature: 0.8,
        }),
    });

    const responseText = await response.text();
if (!response.ok) {
    let detail = responseText;

    try {
        const errorData = JSON.parse(responseText);

        detail =
            errorData?.error?.message ||
            errorData?.error ||
            errorData?.message ||
            errorData?.detail ||
            JSON.stringify(errorData, null, 2);
    } catch {
        // 返回的不是 JSON，直接使用原始文本
        detail = responseText;
    }

    throw new Error(
        [
            `副 API 请求失败`,
            `HTTP 状态码：${response.status}`,
            detail
                ? `错误原因：${String(detail)}`
                : '',
        ]
            .filter(Boolean)
            .join('\n')
    );
}


    let data;

    try {
        data = JSON.parse(responseText);
    } catch {
        return responseText;
    }

    const result =
        data?.choices?.[0]?.message?.content ??
        data?.choices?.[0]?.text ??
        data?.output_text ??
        data?.output ??
        data?.content ??
        data?.text;

    if (result === undefined || result === null) {
        throw new Error(
            '副 API 返回的数据中没有找到文本内容：\n' +
            JSON.stringify(data, null, 2)
        );
    }

    if (Array.isArray(result)) {
        return result
            .map(item => {
                if (typeof item === 'string') {
                    return item;
                }

                return item?.text || item?.content || '';
            })
            .join('');
    }

    return String(result);
}


function saveTutuSettings() {
    tutuSettings = {
        provider:
            $('#tutu_api_provider').val() || 'main',

        endpoint:
            $('#tutu_secondary_endpoint').val().trim(),

        apiKey:
            $('#tutu_secondary_api_key').val().trim(),

        model:
            String($('#tutu_secondary_model').val() || '').trim(),

        autoGenerateEnabled:
            $('#tutu_auto_generate_enabled').is(':checked'),

        autoGenerateMode:
            $('#tutu_auto_generate_mode').val() || 'current',

        autoGenerateScope:
            $('#tutu_auto_generate_scope').val() || 'all',

        autoGenerateCategory:
            $('#tutu_auto_generate_category').val() || '',

        autoSequenceIndex:
            Number(tutuSettings.autoSequenceIndex) || 0,

        autoSequenceIndexes:
            tutuSettings.autoSequenceIndexes || {},
outputMode:
    $('#tutu_output_mode').val() || 'panel',

embedDefaultCollapsed:
    $('#tutu_embed_default_state').val() === 'collapsed',

    };

    localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify(tutuSettings)
    );

    updateAutoGenerateStatus();
}



function renderApiPresetDropdown() {
    const $select = $('#tutu_api_preset_select');

    if (!$select.length) return;

    $select.empty();

    $select.append(
        $('<option>', {
            value: '',
            text: '选择已保存的副 API 预设'
        })
    );

    tutuApiPresets.forEach((preset, index) => {
        $select.append(
            $('<option>', {
                value: String(index),
                text: preset.name
            })
        );
    });
}

function loadTutuSettingsToUI() {
    $('#tutu_api_provider')
        .val(tutuSettings.provider || 'main');

    $('#tutu_secondary_endpoint')
        .val(tutuSettings.endpoint || '');

    $('#tutu_secondary_api_key')
        .val(tutuSettings.apiKey || '');

    $('#tutu_secondary_model')
        .val(tutuSettings.model || '');

    $('#tutu_auto_generate_enabled')
        .prop(
            'checked',
            Boolean(tutuSettings.autoGenerateEnabled)
        );

    $('#tutu_auto_generate_scope')
        .val(tutuSettings.autoGenerateScope || 'all');

    $('#tutu_auto_generate_category')
        .val(tutuSettings.autoGenerateCategory || '');

    $('#tutu_auto_generate_mode')
        .val(tutuSettings.autoGenerateMode || 'current');

    // ★ 新增
    $('#tutu_output_mode')
        .val(tutuSettings.outputMode || 'panel');
    $('#tutu_embed_default_state')
    .val(
        tutuSettings.embedDefaultCollapsed
            ? 'collapsed'
            : 'expanded'
    );


    updateSecondaryApiVisibility();
    renderApiPresetDropdown();
    updateAutoGenerateStatus();
}



function updateSecondaryApiVisibility() {
    const provider = $('#tutu_api_provider').val();

    if (provider === 'secondary') {
        $('#tutu_secondary_api_settings').show();
    } else {
        $('#tutu_secondary_api_settings').hide();
    }
}
function updateAutoGenerateStatus() {
    const enabled = Boolean(tutuSettings.autoGenerateEnabled);

    const $status = $('#tutu_auto_status');

    if (!$status.length) {
        return;
    }

    const label = enabled ? '自动生成已开启' : '手动生成';

    $status
        .toggleClass('enabled', enabled)
        .attr('title', label)
        .attr('aria-label', label)
        .html('<i class="fa-solid fa-circle"></i>');
}


function saveCurrentApiPreset() {
    const name = $('#tutu_api_preset_name').val().trim();
    const endpoint = $('#tutu_secondary_endpoint').val().trim();
    const apiKey = $('#tutu_secondary_api_key').val().trim();
    const model = $('#tutu_secondary_model').val().trim();

    if (!name) {
        toastr.warning('请输入预设名称');
        return;
    }

    if (!endpoint) {
        toastr.warning('请输入副 API 地址');
        return;
    }

if (!model) {
    toastr.warning('请先拉取并选择一个模型');
    return;
}


    const preset = {
        name,
        endpoint,
        apiKey,
        model,
    };

    const oldIndex = tutuApiPresets.findIndex(item => item.name === name);

    if (oldIndex >= 0) {
        tutuApiPresets[oldIndex] = preset;
    } else {
        tutuApiPresets.push(preset);
    }

    localStorage.setItem(
        API_PRESETS_KEY,
        JSON.stringify(tutuApiPresets)
    );

    renderApiPresetDropdown();

    toastr.success(`副 API 预设「${name}」已保存`);
}

function loadSelectedApiPreset() {
    const index = Number($('#tutu_api_preset_select').val());

    if (!Number.isInteger(index) || !tutuApiPresets[index]) {
        toastr.warning('请选择一个副 API 预设');
        return;
    }

    const preset = tutuApiPresets[index];

    $('#tutu_secondary_endpoint').val(preset.endpoint || '');
    $('#tutu_secondary_api_key').val(preset.apiKey || '');
    const presetModel = String(preset.model || '');

const $modelSelect =
    $('#tutu_secondary_model');

if (
    presetModel &&
    !$modelSelect.find(
        `option[value="${CSS.escape(presetModel)}"]`
    ).length
) {
    $modelSelect.append(
        $('<option>', {
            value: presetModel,
            text: `${presetModel}（预设）`
        })
    );
}

$modelSelect.val(presetModel);

    $('#tutu_api_preset_name').val(preset.name || '');

    toastr.success(`已载入副 API 预设：${preset.name}`);
}

function deleteSelectedApiPreset() {
    const index = Number($('#tutu_api_preset_select').val());

    if (!Number.isInteger(index) || !tutuApiPresets[index]) {
        toastr.warning('请选择一个副 API 预设');
        return;
    }

    const preset = tutuApiPresets[index];

    if (!confirm(`确定要删除副 API 预设「${preset.name}」吗？`)) {
        return;
    }

    tutuApiPresets.splice(index, 1);

    localStorage.setItem(
        API_PRESETS_KEY,
        JSON.stringify(tutuApiPresets)
    );

    renderApiPresetDropdown();

    toastr.success('副 API 预设已删除');
}

let editingScriptIndex = -1;

function openScriptEditor(index = -1) {
    editingScriptIndex = index;

    $('#tutu_script_editor').show();

if (index === -1) {
    $('#tutu_editor_title').text('新建剧本');
    $('#tutu_script_name').val('');
    $('#tutu_script_desc').val('');
    $('#tutu_script_category').val('未分类');
    $('#tutu_script_prompt').val('');
} else {
    const item = tutuScenarios[index];

    $('#tutu_editor_title').text('编辑剧本');
    $('#tutu_script_name').val(item.name || '');
    $('#tutu_script_desc').val(item.desc || '');
    $('#tutu_script_category').val(
        item.category || '未分类'
    );
    $('#tutu_script_prompt').val(item.prompt || '');
}


    $('#tutu_script_name').trigger('focus');
}
function getTutuScenarioCategories() {
    const categories = new Set();

    tutuScenarios.forEach(item => {
        const category =
            String(item?.category || '未分类').trim() ||
            '未分类';

        categories.add(category);
    });

    return Array.from(categories).sort((a, b) =>
        a.localeCompare(b, 'zh-CN')
    );
}

function renderTutuCategorySelects() {
    const categories = getTutuScenarioCategories();

    renderTutuExportCategorySelect();




    const currentAutoCategory =
        tutuSettings.autoGenerateCategory || '';



    const $autoSelect =
        $('#tutu_auto_generate_category');



    if ($autoSelect.length) {
        $autoSelect.empty();

        $autoSelect.append(
            $('<option>', {
                value: '',
                text: '全部分类',
            })
        );

        categories.forEach(category => {
            $autoSelect.append(
                $('<option>', {
                    value: category,
                    text: category,
                })
            );
        });

        if (categories.includes(currentAutoCategory)) {
            $autoSelect.val(currentAutoCategory);
        } else {
            $autoSelect.val('');
        }
    }

    updateAutoCategoryVisibility();
}

function updateAutoCategoryVisibility() {
    const scope =
        $('#tutu_auto_generate_scope').val() ||
        tutuSettings.autoGenerateScope ||
        'all';

    if (scope === 'category') {
        $('#tutu_auto_generate_category').show();
    } else {
        $('#tutu_auto_generate_category').hide();
    }
}

function getTutuScenarioPool() {
    if (!Array.isArray(tutuScenarios)) {
        return [];
    }

    const scope =
        tutuSettings.autoGenerateScope || 'all';

    const category =
        tutuSettings.autoGenerateCategory || '';

    if (scope !== 'category' || !category) {
        return tutuScenarios;
    }

    return tutuScenarios.filter(item => {
        const itemCategory =
            String(item?.category || '未分类').trim() ||
            '未分类';

        return itemCategory === category;
    });
}

function getTutuScenarioSequenceKey() {
    const scope =
        tutuSettings.autoGenerateScope || 'all';

    const category =
        tutuSettings.autoGenerateCategory || '';

    if (scope === 'category' && category) {
        return `category:${category}`;
    }

    return 'all';
}

function getAllTutuCategories() {
    const categories = new Set();

    tutuCategories.forEach(category => {
        const value = String(category || '').trim();

        if (value) {
            categories.add(value);
        }
    });

    tutuScenarios.forEach(item => {
        const category =
            String(item?.category || '未分类').trim() ||
            '未分类';

        categories.add(category);
    });

    return Array.from(categories).sort((a, b) =>
        a.localeCompare(b, 'zh-CN')
    );
}

function saveTutuCategories() {
    tutuCategories = Array.from(
        new Set(
            tutuCategories
                .map(category => String(category || '').trim())
                .filter(Boolean)
        )
    );

    localStorage.setItem(
        CATEGORIES_KEY,
        JSON.stringify(tutuCategories)
    );
}
// ==========================================
// 小剧场导入导出
// ==========================================

function getTutuExportScenarioData() {
    const scope =
        String($('#tutu_export_scope').val() || 'all');

    const selectedCategory =
        String($('#tutu_export_category').val() || '').trim();

    const allScenarios =
        Array.isArray(tutuScenarios)
            ? tutuScenarios
            : [];

    let scenarios;

    if (scope === 'category' && selectedCategory) {
        scenarios = allScenarios.filter(item => {
            const category =
                String(item?.category || '未分类').trim() ||
                '未分类';

            return category === selectedCategory;
        });
    } else {
        scenarios = allScenarios;
    }

    const categories = Array.from(
        new Set(
            scenarios.map(item => {
                return String(
                    item?.category || '未分类'
                ).trim() || '未分类';
            })
        )
    );

    return {
        scope,
        selectedCategory,
        categories,
        scenarios: scenarios.map(item => ({
            name: String(item?.name || '未命名剧本'),
            desc: String(item?.desc || ''),
            category:
                String(item?.category || '未分类').trim() ||
                '未分类',
            prompt: String(item?.prompt || ''),
        })),
    };
}


function createTutuTheaterPackage() {
    const data =
        getTutuExportScenarioData();

    return {
        type: TUTU_PACKAGE_TYPE,
        version: TUTU_PACKAGE_VERSION,

        exportedAt: new Date().toISOString(),

        categories: data.categories,

        scenarios: data.scenarios,
    };
}


function exportTutuJsonPackage() {
    const packageData =
        createTutuTheaterPackage();

    if (!packageData.scenarios.length) {
        toastr.warning('当前没有可以导出的剧本');
        return;
    }

    const json =
        JSON.stringify(packageData, null, 2);

    const blob = new Blob(
        [json],
        {
            type: 'application/json;charset=utf-8',
        }
    );

    const scope =
        $('#tutu_export_scope').val() || 'all';

    const category =
        $('#tutu_export_category').val() || '';

    const suffix =
        scope === 'category' && category
            ? `-${category}`
            : '-全部';

    const filename =
        sanitizeTutuFilename(
            `兔兔小剧场${suffix}`
        ) + '.json';

    downloadTutuBlob(blob, filename);

    toastr.success('兔兔小剧场 JSON 导出成功');
}

function exportTutuSingleScenario(index) {
    index = Number(index);

    if (
        !Number.isInteger(index) ||
        index < 0 ||
        !tutuScenarios[index]
    ) {
        toastr.error('找不到要导出的剧本');
        return;
    }

    const item = tutuScenarios[index];

    const name =
        String(item.name || '未命名剧本').trim();

    const desc =
        String(item.desc || '').trim();

    const category =
        String(item.category || '未分类').trim() ||
        '未分类';

    const prompt =
        String(item.prompt || '').trim();

    if (!prompt) {
        toastr.warning('这个剧本没有正文内容，无法导出');
        return;
    }

    /*
     * 使用和批量导出完全相同的兔兔小剧场 JSON 格式。
     *
     * 这样导出的单个剧本可以直接使用：
     * “导入兔兔 JSON”
     * 再导入到剧本库。
     */
    const packageData = {
        type: TUTU_PACKAGE_TYPE,
        version: TUTU_PACKAGE_VERSION,

        exportedAt: new Date().toISOString(),

        categories: [
            category,
        ],

        scenarios: [
            {
                name,
                desc,
                category,
                prompt,
            },
        ],
    };

    const json =
        JSON.stringify(packageData, null, 2);

    const blob = new Blob(
        [json],
        {
            type: 'application/json;charset=utf-8',
        }
    );

    const filename =
        sanitizeTutuFilename(
            `兔兔小剧场-${category}-${name}`
        ) + '.json';

    downloadTutuBlob(blob, filename);

    toastr.success(
        `剧本「${name}」导出成功`,
        '兔兔小剧场'
    );
}

function exportTutuSillyTavernPreset() {
    const packageData =
        createTutuTheaterPackage();

    if (!packageData.scenarios.length) {
        toastr.warning('当前没有可以导出的剧本');
        return;
    }

    /*
     * 每一个小剧场剧本对应一个独立条目。
     *
     * identifier 用于 prompt_order 关联。
     * prompt_order 很重要：
     * 它告诉 SillyTavern 这些 prompts 是当前预设中的有效条目。
     */
    const prompts =
        packageData.scenarios.map((item, index) => {
            const identifier =
                `tutu_theater_${Date.now()}_${index}`;

            const promptName =
                `[${item.category}] ${item.name}`;

            const promptContent = [
                `小剧场名称：${item.name}`,
                `所属分类：${item.category}`,

                item.desc
                    ? `简介：${item.desc}`
                    : '',

                '',
                item.prompt,
            ]
                .filter(Boolean)
                .join('\n');

            return {
                identifier,
                name: promptName,

                /*
                 * SillyTavern Chat Completion 常用字段
                 */
                role: 'system',
                content: promptContent,

                /*
                 * 让它成为一个真正的提示词条目，
                 * 而不是只作为普通文本存在。
                 */
                system_prompt: true,
                marker: false,
                enabled: true,

                /*
                 * 兼容部分 SillyTavern 版本的字段
                 */
                injection_position: 0,
                injection_depth: 4,
                injection_order: index,

                forbid_overrides: false,
            };
        });

    /*
     * prompt_order 是关键。
     *
     * 不同 SillyTavern 版本对 character_id 的处理略有区别，
     * 这里使用一个通用的全局预设条目。
     */
    const promptOrder = [{
        character_id: 100001,

        order: prompts.map(prompt => ({
            identifier: prompt.identifier,
            enabled: true,
        })),
    }];

    const preset = {
        name: '兔兔小剧场预设',

        /*
         * 当前版本通常读取 prompts
         */
        prompts,

        /*
         * prompt_order 决定条目如何排列和是否启用
         */
        prompt_order: promptOrder,

        /*
         * 以下字段是常见兼容字段
         */
        temperature: 0.8,
        openai_max_tokens: 1024,
        openai_max_context: 4096,
    };

    const json =
        JSON.stringify(preset, null, 2);

    const blob = new Blob(
        [json],
        {
            type: 'application/json;charset=utf-8',
        }
    );

    const filename =
        sanitizeTutuFilename(
            '兔兔小剧场-SillyTavern对话补全预设'
        ) + '.json';

    downloadTutuBlob(blob, filename);

    toastr.success(
        `已导出 ${prompts.length} 个预设条目`
    );
}


function exportTutuSillyTavernWorldbook() {
    const packageData =
        createTutuTheaterPackage();

    if (!packageData.scenarios.length) {
        toastr.warning('当前没有可以导出的剧本');
        return;
    }

    /*
     * SillyTavern 世界书格式。
     *
     * 一个小剧场剧本对应一个世界书条目。
     */
    const worldbook = {
        name: '兔兔小剧场世界书',

        entries: packageData.scenarios.map((item, index) => ({
            uid: index,

            key: [
                '兔兔小剧场',
                item.category,
                item.name,
            ],

            comment:
                `[${item.category}] ${item.name}`,

            content: [
                `小剧场名称：${item.name}`,
                `所属分类：${item.category}`,

                item.desc
                    ? `简介：${item.desc}`
                    : '',

                '',
                item.prompt,
            ]
                .filter(Boolean)
                .join('\n'),

            enabled: true,
            constant: false,
            selective: true,
            secondary_keys: [],

            position: 0,
            order: index,

            /*
             * 保存兔兔小剧场自己的分类信息。
             * 不认识 extensions 的程序也不会影响正常使用。
             */
            extensions: {
                tutuCategory: item.category,
                tutuScenarioName: item.name,
            },
        })),
    };

    const json =
        JSON.stringify(worldbook, null, 2);

    const blob = new Blob(
        [json],
        {
            type: 'application/json;charset=utf-8',
        }
    );

    const filename =
        sanitizeTutuFilename(
            '兔兔小剧场-SillyTavern世界书'
        ) + '.json';

    downloadTutuBlob(blob, filename);

    toastr.success(
        'SillyTavern 世界书导出成功'
    );
}
function renderTutuExportCategorySelect() {
    const $select =
        $('#tutu_export_category');

    if (!$select.length) {
        return;
    }

    const categories =
        getAllTutuCategories();

    const previous =
        String($select.val() || '');

    $select.empty();

    if (!categories.length) {
        $select.append(
            $('<option>', {
                value: '',
                text: '没有可用分类',
            })
        );

        return;
    }

    categories.forEach(category => {
        $select.append(
            $('<option>', {
                value: category,
                text: category,
            })
        );
    });

    if (categories.includes(previous)) {
        $select.val(previous);
    } else {
        $select.prop('selectedIndex', 0);
    }
}
function getTutuImportedPromptText(prompt) {
    if (!prompt) {
        return '';
    }

    if (typeof prompt === 'string') {
        return prompt.trim();
    }

    return String(
        prompt.content ||
        prompt.prompt ||
        prompt.value ||
        prompt.text ||
        ''
    ).trim();
}


function getTutuImportedPromptName(prompt, index) {
    if (!prompt) {
        return `导入剧本 ${index + 1}`;
    }

    return String(
        prompt.name ||
        prompt.title ||
        `导入剧本 ${index + 1}`
    ).trim();
}


function getTutuCategoryFromImportedName(name) {
    const text = String(name || '').trim();

    /*
     * 识别：
     * [日常] 剧本名称
     * 【日常】剧本名称
     */
    const squareMatch =
        text.match(/^\[([^\]]+)\]\s*(.*)$/);

    if (squareMatch) {
        return {
            category:
                squareMatch[1].trim() || '未分类',

            name:
                squareMatch[2].trim() || '未命名剧本',
        };
    }

    const chineseMatch =
        text.match(/^【([^】]+)】\s*(.*)$/);

    if (chineseMatch) {
        return {
            category:
                chineseMatch[1].trim() || '未分类',

            name:
                chineseMatch[2].trim() || '未命名剧本',
        };
    }

    return {
        category: '未分类',
        name: text || '未命名剧本',
    };
}


function convertImportedDataToTutuScenarios(data) {
    if (
        !data ||
        data.type !== TUTU_PACKAGE_TYPE ||
        !Array.isArray(data.scenarios)
    ) {
        throw new Error(
            '这不是兔兔小剧场导出的 JSON 文件'
        );
    }

    const imported = [];

    data.scenarios.forEach(item => {
        if (!item || typeof item !== 'object') {
            return;
        }

        const prompt =
            String(item.prompt || '').trim();

        if (!prompt) {
            return;
        }

        imported.push({
            name:
                String(
                    item.name || '导入剧本'
                ).trim(),

            desc:
                String(item.desc || '').trim(),

            category:
                String(
                    item.category || '未分类'
                ).trim() || '未分类',

            prompt,
        });
    });

    return imported;
}



function mergeTutuImportedScenarios(importedScenarios) {
    if (!Array.isArray(importedScenarios)) {
        return 0;
    }

    let importedCount = 0;

    importedScenarios.forEach(item => {
        if (!item || !String(item.prompt || '').trim()) {
            return;
        }

        const category =
            String(
                item.category || '未分类'
            ).trim() || '未分类';

        const newScenario = {
            name:
                String(
                    item.name || '导入剧本'
                ).trim(),

            desc:
                String(item.desc || '').trim(),

            category,

            prompt:
                String(item.prompt || '').trim(),
        };

        tutuScenarios.push(newScenario);

        if (!tutuCategories.includes(category)) {
            tutuCategories.push(category);
        }

        importedCount++;
    });

    if (importedCount > 0) {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(tutuScenarios)
        );

        saveTutuCategories();

        renderLibrary();
        renderTutuCategorySelects();
    }

    return importedCount;
}


async function importTutuLibraryFile(file) {
    if (!file) {
        return;
    }

    let text;

    try {
        text = await file.text();
    } catch (error) {
        throw new Error(
            '读取文件失败：' +
            (error.message || error)
        );
    }

    let data;

    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(
            '导入文件不是有效的 JSON'
        );
    }

    const importedScenarios =
        convertImportedDataToTutuScenarios(data);

    if (!importedScenarios.length) {
        throw new Error(
            '文件中没有找到可导入的剧本内容'
        );
    }

    const importedCount =
        mergeTutuImportedScenarios(
            importedScenarios
        );

    toastr.success(
        `成功导入 ${importedCount} 个小剧场剧本`
    );
}

function renderLibrary() {
    const $list = $('#tutu_library_list');

    if (!$list.length) {
        return;
    }

    $list.empty();

    const categories = getAllTutuCategories();
// 清掉已经不存在的分类
Array.from(tutuExpandedCategories).forEach(category => {
    if (!categories.includes(category)) {
        tutuExpandedCategories.delete(category);
    }
});

// 首次使用默认全部展开
if (!tutuExpandedInitialized && categories.length) {
    categories.forEach(category => tutuExpandedCategories.add(category));
    tutuExpandedInitialized = true;
}

saveTutuExpandedCategories();



    if (!categories.length) {
        $list.html(`
            <div class="tutu-empty-library">
                <i class="fa-solid fa-book-open"></i>
                <div>还没有分类</div>
                <small>请先创建一个分类</small>
            </div>
        `);

        return;
    }

    categories.forEach(category => {
        const categoryItems = tutuScenarios
            .map((item, index) => ({
                item,
                index,
            }))
            .filter(({ item }) => {
                const itemCategory =
                    String(item?.category || '未分类').trim() ||
                    '未分类';

                return itemCategory === category;
            });

        const isExpanded = tutuExpandedCategories.has(category);

        const $section = $(`
            <div
                class="tutu-category-section${isExpanded ? ' expanded' : ''}"
                data-category="${escapeHtml(category)}">

                <div
                    class="tutu-category-header tutu-category-drop-target"
                    data-category="${escapeHtml(category)}"
                    title="点击展开或折叠，也可以把剧本拖到这里">

                    <div class="tutu-category-title">
                        <i class="fa-solid fa-folder"></i>
                        <span>${escapeHtml(category)}</span>
                        <span class="tutu-category-count">
                            ${categoryItems.length} 个剧本
                        </span>
                    </div>

                    <i class="fa-solid fa-chevron-down tutu-category-arrow"></i>
                </div>

                <div
                    class="tutu-category-dropzone tutu-category-drop-target"
                    data-category="${escapeHtml(category)}">
                </div>
            </div>
        `);


        const $dropzone = $section.find('.tutu-category-dropzone');

        if (categoryItems.length === 0) {
            $dropzone.html(`
                <div class="tutu-category-empty">
                    把剧本拖到这里
                </div>
            `);
        } else {
            categoryItems.forEach(({ item, index }) => {
                const name =
                    escapeHtml(item.name || '未命名剧本');

                const desc =
                    escapeHtml(item.desc || '暂无简介');

                const prompt =
                    escapeHtml(item.prompt || '');

                const $item = $(`
                    <div
                        class="tutu-preset-card tutu-script-card"
                        data-index="${index}">

                        <div class="tutu-script-main">
                            <div class="tutu-script-name">
                                ${name}
                            </div>

                            <div class="tutu-script-desc">
                                ${desc}
                            </div>

                            <div
                                class="tutu-script-content"
                                style="display:none;">
                                ${prompt}
                            </div>
                        </div>

                        <div class="tutu-script-actions">

                            <div
                                class="menu_button margin0 tutu-icon-btn tutu-load-script-btn"
                                data-index="${index}"
                                title="载入剧本">
                                <i class="fa-solid fa-play"></i>
                            </div>

                            <div
                                class="menu_button margin0 tutu-icon-btn tutu-view-script-btn"
                                data-index="${index}"
                                title="查看剧本内容">
                                <i class="fa-solid fa-eye"></i>
                            </div>
<div
    class="menu_button margin0 tutu-icon-btn tutu-export-script-btn"
    data-index="${index}"
    title="导出这个剧本">
    <i class="fa-solid fa-file-export"></i>
</div>
                            <div
                                class="menu_button margin0 tutu-icon-btn tutu-edit-script-btn"
                                data-index="${index}"
                                title="编辑剧本">
                                <i class="fa-solid fa-pen"></i>
                            </div>

                            <div
                                class="menu_button margin0 tutu-icon-btn tutu-delete-script-btn"
                                data-index="${index}"
                                title="删除剧本">
                                <i class="fa-solid fa-trash-can"></i>
                            </div>

                        </div>
                    </div>
                `);

                $dropzone.append($item);
            });
        }

        $list.append($section);
    });

    saveTutuCategories();
}

async function fetchAndRenderNativePrompts() {

        const $list = $('#tutu_native_prompts_list');
        const type = $('#tutu_preset_type').val(); // 'sysprompt' 或 'openai'
        const fileName = $('#tutu_preset_file').val();
        
        if (!fileName) return;
        
        $list.html('<div style="text-align:center; padding: 20px;"><i class="fa-solid fa-spinner fa-spin"></i> 读取中...</div>');
        $('#tutu_select_all').prop('checked', false);

let allPrompts = [];
let data = null;

try {
    // ================================
    // 世界书
    // ================================
    if (type === 'worldbook') {
        data = await loadWorldInfo(fileName);

        if (!data) {
            throw new Error('世界书内容为空');
        }

        console.log('读取到的世界书数据：', data);

        // SillyTavern 世界书的 entries 通常是对象：
        // {
        //     uid1: {...},
        //     uid2: {...}
        // }
        const entries = Array.isArray(data.entries)
            ? data.entries
            : Object.values(data.entries || {});

        entries.forEach((entry, index) => {
            if (!entry) return;

            const promptText = String(entry.content || '').trim();

            // 没有正文的条目不导入
            if (!promptText) return;

            let entryName =
                entry.comment ||
                entry.name ||
                (Array.isArray(entry.key)
                    ? entry.key.join(', ')
                    : entry.key) ||
                `世界书条目 ${index + 1}`;

            // 给禁用条目加一个标记，但仍然允许用户手动选择导入
            if (entry.enabled === false) {
                entryName = `🚫 [禁用] ${entryName}`;
            }

            allPrompts.push({
                name: entryName,
                prompt: promptText
            });
        });
    }

    // ================================
    // 对话补全预设
    // ================================
    else if (type === 'openai') {
        const manager = getPresetManager('openai');

        if (!manager) {
            throw new Error('找不到对话补全预设管理器');
        }

        data = await manager.getCompletionPresetByName(fileName);

        if (!data) {
            throw new Error('对话补全预设内容为空');
        }

        console.log('读取到的对话补全预设数据：', data);

        const pmArray = data.prompts || data.prompt_manager || [];

        pmArray.forEach(p => {
            if (!p) return;

            const promptText =
                p.content ||
                p.prompt ||
                p.value ||
                p.text ||
                '';

            if (p.name && String(promptText).trim()) {
                allPrompts.push({
                    name: p.name,
                    prompt: String(promptText)
                });
            }
        });
    }
}
catch (error) {
    console.error('读取预设或世界书失败:', error);

    $list.html(
        '<div style="text-align:center; color:red; padding:20px;">' +
        '读取失败，请检查控制台。' +
        '</div>'
    );

    return;
}



        if (allPrompts.length === 0) {
            $list.html('<div style="text-align:center; padding: 20px; opacity:0.6;">选中的预设中没有任何内容。</div>');
            return;
        }

        window.tutuTempNativePrompts = allPrompts;
        $list.empty();

        // 渲染列表：带【查看】按钮和默认隐藏的正文内容区
        allPrompts.forEach((p, index) => {
            const name = p.name || "未命名";
            const promptText = p.prompt;

            const $card = $(`
                <div class="tutu-preset-card" style="display: flex; flex-direction: column; gap: 5px;">
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <input type="checkbox" class="tutu-import-checkbox" value="${index}" style="width: 18px; height: 18px; cursor: pointer;">
                        <div class="tutu-preset-name" style="flex:1; margin:0; cursor: pointer;">${name}</div>
                        <!-- 查看按钮 -->
                        <div class="menu_button margin0 tutu-view-btn" data-index="${index}" style="font-size:0.8em; padding: 5px 10px; min-width: 60px; justify-content: center;">
                            <i class="fa-solid fa-eye"></i> 查看
                        </div>
                    </div>
                    <!-- 隐藏的正文内容 -->
                    <div
    class="tutu-preset-text tutu-hidden-content-${index}"
    style="
        display:none;
        margin-top:5px;
        background:var(--SmartThemeBlurTintColor);
        color:var(--SmartThemeBodyColor);
        padding:8px;
        border-radius:5px;
        white-space:pre-wrap;
        word-break:break-all;
        max-height:150px;
        overflow-y:auto;
    "
>${promptText}</div>

                </div>
            `);
            $list.append($card);
        });

        // 绑定全选框反向更新逻辑
        $('.tutu-import-checkbox').on('change', function() {
            const total = $('.tutu-import-checkbox').length;
            const checked = $('.tutu-import-checkbox:checked').length;
            $('#tutu_select_all').prop('checked', total === checked);
        });

        // 点击条目名字，触发多选框选中/取消选中
        $('.tutu-preset-name').on('click', function() {
            const $checkbox = $(this).prev('.tutu-import-checkbox');
            $checkbox.prop('checked', !$checkbox.prop('checked')).trigger('change');
        });

        // 绑定“查看”按钮的展开/折叠逻辑
        $('.tutu-view-btn').on('click', function() {
            const index = $(this).data('index');
            const $content = $('.tutu-hidden-content-' + index);
            $content.slideToggle(150); 
        });
    }







    // ==========================================
    // 4. 事件绑定
    // ==========================================
    // 打开小剧场导入导出面板
$(document).on(
    'click',
    '#tutu_toggle_transfer_btn',
    function () {
        const $panel =
            $('#tutu_transfer_panel');

        if ($panel.is(':visible')) {
            $panel.stop(true, true).slideUp(160);
        } else {
            renderTutuExportCategorySelect();

            $panel.stop(true, true).slideDown(160);
        }
    }
);


// 关闭小剧场导入导出面板
$(document).on(
    'click',
    '#tutu_close_transfer_btn',
    function () {
        $('#tutu_transfer_panel')
            .stop(true, true)
            .slideUp(160);
    }
);
$(document).on(
    'change',
    '#tutu_export_scope',
    function () {
        const scope =
            String($(this).val() || 'all');

        if (scope === 'category') {
            renderTutuExportCategorySelect();

            $('#tutu_export_category_row')
                .stop(true, true)
                .slideDown(160);
        } else {
            $('#tutu_export_category_row')
                .stop(true, true)
                .slideUp(160);
        }
    }
);
// 导出小剧场
$(document).on(
    'click',
    '#tutu_export_library_btn',
    function () {
        const exportType =
            String(
                $('#tutu_export_type').val() ||
                'tutu_json'
            );

        if (exportType === 'st_preset') {
            exportTutuSillyTavernPreset();
            return;
        }

        if (exportType === 'st_worldbook') {
            exportTutuSillyTavernWorldbook();
            return;
        }

        exportTutuJsonPackage();
    }
);


// 点击导入按钮，打开文件选择器
$(document).on(
    'click',
    '#tutu_import_library_btn',
    function () {
        $('#tutu_import_library_file')
            .val('')
            .trigger('click');
    }
);


// 选择兔兔 JSON 文件
$(document).on(
    'change',
    '#tutu_import_library_file',
    async function () {
        const file =
            this.files?.[0];

        if (!file) {
            return;
        }

        try {
            await importTutuLibraryFile(file);
        } catch (error) {
            console.error(
                '导入兔兔小剧场失败：',
                error
            );

            toastr.error(
                error.message || '导入失败'
            );
        } finally {
            $(this).val('');
        }
    }
);

 
    $(document).on(
    'click',
    '.tutu-favorite-html-preview-btn',
    function (event) {
        event.stopPropagation();

        const $button = $(this);

        const $card =
            $button.closest('.tutu-favorite-card');

        const $container =
            $card.find(
                '.tutu-favorite-html-container'
            );

        const isVisible =
            $container.is(':visible');

        if (isVisible) {
            $container.stop(true, true).slideUp(180);

            $button.html(`
                <i class="fa-solid fa-display"></i>
                预览 HTML 小剧场
            `);
        } else {
            $container.stop(true, true).slideDown(180);

            $button.html(`
                <i class="fa-solid fa-eye-slash"></i>
                收起 HTML 预览
            `);
        }
    }
);

    $(document).on(
    'click',
    '#tutu_favorite_current_btn',
    function () {
        favoriteCurrentTutuTheater();
    }
);

$(document).on(
    'click',
    '#tutu_export_current_btn',
    function () {
        exportCurrentTutuTheater();
    }
);
$(document).on(
    'click',
    '#tutu_fullscreen_current_btn',
    function () {
        const content =
            String(tutuCurrentResultContent || '').trim();

        if (!content) {
            toastr.warning('当前没有可以查看的小剧场');
            return;
        }

        openTutuTheaterFullscreen(
            content,
            tutuCurrentResultCharacter || 'AI'
        );
    }
);

$(document).on(
    'click',
    '#tutu_clear_favorites_btn',
    function () {
        clearTutuFavorites();
    }
);

$(document).on(
    'click',
    '.tutu-favorite-delete-btn',
    function (event) {
        event.stopPropagation();

        const id = String(
            $(this)
                .closest('.tutu-favorite-card')
                .data('id')
        );

        removeTutuFavorite(id);

        toastr.success('收藏已删除');
    }
);

$(document).on(
    'click',
    '.tutu-favorite-group-header',
    function () {
        const $group =
            $(this).closest(
                '.tutu-favorite-group'
            );

        const $groupList =
            $group.find(
                '.tutu-favorite-group-list'
            );

        const $arrow =
            $group.find(
                '.tutu-favorite-group-arrow'
            );

        const characterName =
            String(
                $group
                    .find(
                        '.tutu-favorite-character-name'
                    )
                    .text() || ''
            ).trim();

        const expandedGroups =
            loadTutuFavoriteExpandedGroups();

        const isVisible =
            $groupList.is(':visible');

        if (isVisible) {
            $groupList.stop(true, true).slideUp(160);

            $arrow
                .removeClass('fa-chevron-up')
                .addClass('fa-chevron-down');

            expandedGroups.delete(characterName);
        } else {
            $groupList.stop(true, true).slideDown(160);

            $arrow
                .removeClass('fa-chevron-down')
                .addClass('fa-chevron-up');

            expandedGroups.add(characterName);
        }

        saveTutuFavoriteExpandedGroups(
            expandedGroups
        );
    }
);
$(document).on(
    'click',
    '.tutu-favorite-edit-btn',
    function (event) {
        /*
         * 防止点击编辑按钮时触发角色分组折叠
         */
        event.stopPropagation();

        const id =
            String(
                $(this)
                    .closest('.tutu-favorite-card')
                    .data('id')
            );

        renameTutuFavorite(id);
    }
);

$(document).on(
    'click',
    '.tutu-favorite-export-btn',
    function (event) {
        event.stopPropagation();

        const id = String(
            $(this)
                .closest('.tutu-favorite-card')
                .data('id')
        );

        const favorite =
            loadTutuFavorites()
                .find(item => item.id === id);

        if (!favorite) {
            toastr.error('找不到这条收藏');
            return;
        }

        const characterName =
            favorite.characterName || 'AI';

        if (favorite.type === 'html') {
            exportTutuHtmlFile(
                favorite.content,
                characterName
            );
        } else {
            const exportFormat =
                $('#tutu_export_format').val() ||
                'text';

            if (exportFormat === 'text') {
                exportTutuTextFile(
                    favorite.content,
                    characterName
                );
            } else {
                const styleName =
                    $('#tutu_export_style').val() ||
                    'classic';

                exportTutuQuoteImage(
                    favorite.content,
                    characterName,
                    styleName
                );
            }
        }
    }
);
$(document).on(
    'click',
    '.tutu-favorite-fullscreen-btn',
    function (event) {
        event.stopPropagation();

        const id = String(
            $(this)
                .closest('.tutu-favorite-card')
                .data('id')
        );

        const favorite =
            loadTutuFavorites()
                .find(item => String(item.id) === id);

        if (!favorite) {
            toastr.error('找不到这条收藏');
            return;
        }

        const content =
            String(favorite.content || '').trim();

        if (!content) {
            toastr.warning('这条收藏没有内容');
            return;
        }

        const characterName =
            String(
                favorite.characterName || 'AI'
            ).trim() || 'AI';

        openTutuTheaterFullscreen(
            content,
            characterName
        );
    }
);

    // 输出方式切换
$(document).on(
    'change',
    '#tutu_output_mode, #tutu_embed_default_state',
    function () {
        tutuSettings.outputMode =
            $('#tutu_output_mode').val() || 'panel';

        tutuSettings.embedDefaultCollapsed =
            $('#tutu_embed_default_state').val() === 'collapsed';

        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify(tutuSettings)
        );
    }
);


$(document).on(
    'click',
    '#tutu_add_category_btn',
    function () {
        const $input = $('#tutu_new_category_input');

        const category =
            String($input.val() || '').trim();

        if (!category) {
            toastr.warning('请输入分类名称');
            return;
        }

        if (tutuCategories.includes(category)) {
            toastr.warning('这个分类已经存在');
            return;
        }

        tutuCategories.push(category);
        saveTutuCategories();

        $input.val('');

        renderLibrary();

        toastr.success(`分类「${category}」已创建`);
    }
);
$(document).on(
    'click',
    '.tutu-category-header',
    function () {
        if (tutuSuppressNextHeaderClick) {
            tutuSuppressNextHeaderClick = false;
            return;
        }

        const $section =
            $(this).closest('.tutu-category-section');

        const category = String(
            $section.attr('data-category') || ''
        ).trim();

        if ($section.hasClass('expanded')) {
            tutuExpandedCategories.delete(category);
            $section.removeClass('expanded');
        } else {
            tutuExpandedCategories.add(category);
            $section.addClass('expanded');
        }

        saveTutuExpandedCategories();
    }
);


let tutuDraggingScenarioIndex = -1;
function moveTutuScenarioToCategory(index, newCategory) {
    index = Number(index);
    newCategory = String(newCategory || '').trim();

    if (
        !Number.isInteger(index) ||
        index < 0 ||
        !tutuScenarios[index] ||
        !newCategory
    ) {
        return false;
    }

    const scenario = tutuScenarios[index];
        const oldCategory =
        String(scenario.category || '未分类').trim() ||
        '未分类';

    if (oldCategory === newCategory) {
        return false;
    }


    scenario.category = newCategory;

    if (!tutuCategories.includes(newCategory)) {
        tutuCategories.push(newCategory);
    }

    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(tutuScenarios)
    );

    saveTutuCategories();

    // 先展开目标分类，再渲染，这样能立刻看到移动结果
    tutuExpandedCategories.add(newCategory);
    tutuExpandedCategories.add(oldCategory);
    saveTutuExpandedCategories();

    renderLibrary();
    renderTutuCategorySelects();


    toastr.success(
        `已将「${scenario.name}」移动到「${newCategory}」`
    );

    return true;
}





function clearTutuDragOverState() {
    $('.tutu-category-drop-target')
        .removeClass('drag-over');
}



// ==========================================
// 移动端触摸拖动剧本
// ==========================================

let tutuTouchDragState = null;



function getTutuDropzoneFromTouch(touch) {
    const element = document.elementFromPoint(
        touch.clientX,
        touch.clientY
    );

    if (!element) {
        return null;
    }

    // 展开的分类落在 dropzone 上，折叠的分类落在标题上
    const target = element.closest(
        '.tutu-category-drop-target'
    );

    return target ? $(target) : null;
}


let tutuSuppressNextHeaderClick = false;

function clearTutuTouchDragState() {
    const state = tutuTouchDragState;

    if (!state) {
        return;
    }

    if (state.$card) {
        state.$card.removeClass('tutu-touch-dragging');
    }

    if (state.$ghost) {
        state.$ghost.remove();
    }

    $('.tutu-category-drop-target')
        .removeClass('tutu-touch-drag-over');

    tutuTouchDragState = null;
}

function getTutuDropTargetFromPoint(x, y) {
    const element = document.elementFromPoint(x, y);

    if (!element) {
        return null;
    }

    const target = element.closest('.tutu-category-drop-target');

    return target ? $(target) : null;
}

$(document).on(
    'pointerdown',
    '.tutu-script-card',
    function (event) {
        const e = event.originalEvent;

        // 鼠标只响应左键
        if (!e || (e.pointerType === 'mouse' && e.button !== 0)) {
            return;
        }

        // 点在操作按钮或输入控件上不启动拖动
        if (
            $(event.target).closest(
                '.tutu-script-actions, button, input, textarea, select'
            ).length
        ) {
            return;
        }

        const index = Number($(this).attr('data-index'));

        if (!Number.isInteger(index) || !tutuScenarios[index]) {
            return;
        }

        tutuTouchDragState = {
            index,
            pointerId: e.pointerId,
            $card: $(this),
            startX: e.clientX,
            startY: e.clientY,
            dragging: false,
            $ghost: null,
        };
    }
);

$(document).on(
    'pointermove',
    function (event) {
        const state = tutuTouchDragState;

        if (!state) {
            return;
        }

        const e = event.originalEvent;

        if (!e || e.pointerId !== state.pointerId) {
            return;
        }

        const distance = Math.hypot(
            e.clientX - state.startX,
            e.clientY - state.startY
        );

        // 超过 8px 才认为是拖动，避免影响普通点击
        if (!state.dragging && distance < 8) {
            return;
        }

        if (!state.dragging) {
            state.dragging = true;

            state.$card.addClass('tutu-touch-dragging');

            state.$ghost = $('<div class="tutu-touch-drag-ghost"></div>');

            state.$ghost.text(
                tutuScenarios[state.index]?.name || '移动中的剧本'
            );

            $('body').append(state.$ghost);
        }

        if (event.cancelable) {
            event.preventDefault();
        }

        state.$ghost.css({
            left: `${e.clientX + 12}px`,
            top: `${e.clientY + 12}px`,
        });

        const $target = getTutuDropTargetFromPoint(e.clientX, e.clientY);

        $('.tutu-category-drop-target')
            .removeClass('tutu-touch-drag-over');

        if ($target && $target.length) {
            $target.addClass('tutu-touch-drag-over');
        }
    }
);

$(document).on(
    'pointerup pointercancel',
    function (event) {
        const state = tutuTouchDragState;

        if (!state) {
            return;
        }

        const e = event.originalEvent;

        if (!e || e.pointerId !== state.pointerId) {
            return;
        }

        if (state.dragging && event.type === 'pointerup') {
            const $target = getTutuDropTargetFromPoint(e.clientX, e.clientY);

            if ($target && $target.length) {
                const newCategory = String(
                    $target.attr('data-category') || ''
                ).trim();

                moveTutuScenarioToCategory(state.index, newCategory);
            }

            // 落在分类标题上时，抑制紧随其后的 click
            tutuSuppressNextHeaderClick = true;
        }

        clearTutuTouchDragState();
    }
);


// 自动生成范围切换
$(document).on(
    'change',
    '#tutu_auto_generate_scope',
    function () {
        tutuSettings.autoGenerateScope =
            $(this).val() || 'all';

        if (
            tutuSettings.autoGenerateScope !== 'category'
        ) {
            tutuSettings.autoGenerateCategory = '';
        }

        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify(tutuSettings)
        );

        updateAutoCategoryVisibility();
    }
);

// 自动生成分类切换
$(document).on(
    'change',
    '#tutu_auto_generate_category',
    function () {
        tutuSettings.autoGenerateCategory =
            $(this).val() || '';

        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify(tutuSettings)
        );
    }
);

// 点击随机剧本：按当前自动生成范围随机选择并立即生成
$(document).on(
    'click',
    '#tutu_random_script_btn',
    function () {
        const scenario =
            getRandomTutuScenario();

        if (!scenario) {
            toastr.warning(
                '当前范围内没有可用剧本'
            );

            return;
        }

        $('#tutu_prompt').val(
            scenario.prompt || ''
        );

        runTutuGeneration({
            scenario: scenario.prompt || '',
            isAutomatic: false,
        });
    }
);

$(document).on(
    'click',
    '#tutu_context_toggle_btn',
    function () {
        const $box =
            $('#tutu_character_context_box');

        if ($box.is(':visible')) {
            $box.stop(true, true).slideUp(180);
        } else {
            $box.stop(true, true).slideDown(180);
        }
    }
);

$(document).on(
    'click',
    '#tutu_clear_prompt_btn',
    function () {
        $('#tutu_prompt')
            .val('')
            .trigger('focus');
    }
);

    $(document).on(
    'click',
    '#tutu_worldbook_toggle',
    function () {
        const $toggle = $(this);
        const $content = $('#tutu_worldbook_content');

        const isExpanded = $toggle.hasClass('expanded');

        if (isExpanded) {
            $content.stop(true, true).slideUp(180);
            $toggle.removeClass('expanded');
        } else {
            $content.stop(true, true).slideDown(180);
            $toggle.addClass('expanded');
        }
    }
);
    $(document).on(
    'change',
    '.tutu-character-world-entry-checkbox',
    function () {
        saveTutuWorldEntrySelection();
    }
);
$(document).on(
    'change',
    '#tutu_include_history',
    function () {
        const includeHistory = $(this).is(':checked');

        if (includeHistory) {
            $('#tutu_history_limit_box').show();
        } else {
            $('#tutu_history_limit_box').hide();
        }

        saveCurrentTutuCharacterStorage({
            selectedWorldEntries:
                tutuCurrentCharacterContext.selectedWorldEntries || [],

            includeHistory,

            historyLimit:
                Number($('#tutu_history_limit').val()) || 20,
        });

        tutuCurrentCharacterContext.includeHistory = includeHistory;
    }
);
$(document).on(
    'change',
    '#tutu_history_limit',
    function () {
        saveCurrentTutuCharacterStorage({
            selectedWorldEntries:
                tutuCurrentCharacterContext.selectedWorldEntries || [],

            includeHistory:
                $('#tutu_include_history').is(':checked'),

            historyLimit:
                Number($(this).val()) || 20,
        });

        tutuCurrentCharacterContext.historyLimit =
            Number($(this).val()) || 20;
    }
);



loadTutuSettingsToUI();
renderTutuCategorySelects();
renderLibrary();
renderTutuFavorites();


initTutuAutoGenerationListener();


setTimeout(async () => {
    await injectTutuRegex();
}, 1000);



// 切换主 API / 副 API
$(document).on('change', '#tutu_api_provider', function() {
    updateSecondaryApiVisibility();
});
$(document).on(
    'click',
    '#tutu_fetch_models_btn',
    async function () {
        try {
            await fetchSecondaryModels();
        } catch (error) {
            console.error(
                '拉取副 API 模型失败：',
                error
            );

            toastr.error(
                error.message || '拉取模型失败'
            );
        }
    }
);


// 保存 API 设置
$(document).on('click', '#tutu_save_settings_btn', function() {
    saveTutuSettings();
    toastr.success('小剧场 API 设置已保存');
});
$(document).on(
    'change',
    '#tutu_auto_generate_enabled, #tutu_auto_generate_mode, #tutu_auto_generate_scope, #tutu_auto_generate_category',
    function () {
        tutuSettings.autoGenerateEnabled =
            $('#tutu_auto_generate_enabled')
                .is(':checked');

        tutuSettings.autoGenerateMode =
            $('#tutu_auto_generate_mode').val() ||
            'current';

        tutuSettings.autoGenerateScope =
            $('#tutu_auto_generate_scope').val() ||
            'all';

        tutuSettings.autoGenerateCategory =
            $('#tutu_auto_generate_category').val() ||
            '';

        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify(tutuSettings)
        );

        updateAutoCategoryVisibility();
        updateAutoGenerateStatus();
    }
);


// 保存副 API 预设
$(document).on('click', '#tutu_save_api_preset_btn', function() {
    saveCurrentApiPreset();
});

// 载入副 API 预设
$(document).on('click', '#tutu_load_api_preset_btn', function() {
    loadSelectedApiPreset();
});

// 删除副 API 预设
$(document).on('click', '#tutu_delete_api_preset_btn', function() {
    deleteSelectedApiPreset();
});

// 结果显示为预览
$(document).on('click', '#tutu_show_preview_btn', function() {
    showTutuResultMode('preview');
});

// 结果显示为源码
$(document).on('click', '#tutu_show_source_btn', function() {
    showTutuResultMode('source');
});

    function injectTutuButton() {
        if ($('#option_tutu_theater').length > 0) return;
        const $extensionsMenu = $('#extensionsMenu');
        if ($extensionsMenu.length > 0) {
            $extensionsMenu.append(menuButtonHtml);
        } else if ($('#manageAttachments').length > 0) {
            $('#manageAttachments').after(menuButtonHtml);
        }
    }

    injectTutuButton();
$(document).on('click', '#option_tutu_theater', function() {

    const extensionsMenu = document.getElementById('extensionsMenu');
    if (extensionsMenu) {
        extensionsMenu.style.display = 'none';
    }
renderTutuCategorySelects();
renderLibrary();
updatePresetFileDropdown();

$('#tutu_worldbook_content')
    .hide();

$('#tutu_worldbook_toggle')
    .removeClass('expanded');

refreshTutuCharacterContext();


    const $panel = $('#tutu_theater_panel');
    const isMobile = window.matchMedia('(max-width: 600px)').matches;

    // 先清除旧状态
    $panel.stop(true, true).removeClass('tutu-mobile-mode');

    if (isMobile) {
        $panel.addClass('tutu-mobile-mode');
    }

    // 用 cssText 强制重置定位，防止残留内联样式
    $panel[0].style.cssText =
        'display:flex; opacity:0;' +
        'top:50%; left:50%; transform:translate(-50%,-50%);';

    $panel.animate({ opacity: 1 }, 200);
});




    // 监听类型下拉框改变：切换系统/OAI预设
    $(document).on('change', '#tutu_preset_type', function() {
        updatePresetFileDropdown();
    });

    // 监听文件下拉框改变：读取对应文件
    $(document).on('change', '#tutu_preset_file', function() {
        fetchAndRenderNativePrompts();
    });


$(document).on('click', '#tutu_close', function() {
    $('#tutu_theater_panel')
        .stop(true, true)
        .animate({ opacity: 0 }, 200, function() {
            $(this)[0].style.cssText = 'display:none;';
            $(this).removeClass('tutu-mobile-mode');
        });
});





    // 全选/取消全选
    $('#tutu_select_all').on('change', function() {
        const isChecked = $(this).is(':checked');
        $('.tutu-import-checkbox').prop('checked', isChecked);
    });

    // ---【核心功能】：批量导入选中的条目 ---
    $('#tutu_import_selected_btn').on('click', function() {
        const checkedBoxes = $('.tutu-import-checkbox:checked');
        if (checkedBoxes.length === 0) {
            toastr.warning("请至少勾选一个要导入的条目！");
            return;
        }

        let importedCount = 0;
        checkedBoxes.each(function() {
            const index = $(this).val();
            const p = window.tutuTempNativePrompts[index];
            
            // 确保不导入空数据
            if (p) {
const importedCategory = '未分类';

tutuScenarios.push({
    name: p.name || "导入的预设",
    desc: `从系统预设导入`,
    category: importedCategory,
    prompt: p.prompt || p.content || p.value || ""
});

if (!tutuCategories.includes(importedCategory)) {
    tutuCategories.push(importedCategory);
}

                importedCount++;
            }
        });

        // 存入 LocalStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tutuScenarios));
        saveTutuCategories();
        toastr.success(`成功导入了 ${importedCount} 个剧本！`);
        renderLibrary(); // 刷新我的剧本列表
        switchTutuTab('tutu_tab_library');
    });

// 点击“新建剧本”
$(document).on('click', '#tutu_new_script_btn', function() {
    openScriptEditor(-1);
});

// 点击“取消编辑”
$(document).on('click', '#tutu_cancel_edit_btn', function() {
    editingScriptIndex = -1;
    $('#tutu_script_editor').slideUp(150);
});

// 保存新建或编辑的剧本
$(document).on('click', '#tutu_save_btn', function() {
const name =
    $('#tutu_script_name').val().trim();

const desc =
    $('#tutu_script_desc').val().trim();

const category =
    $('#tutu_script_category').val().trim() ||
    '未分类';

const prompt =
    $('#tutu_script_prompt').val().trim();


    if (!name) {
        toastr.warning('请输入剧本名称！');
        return;
    }

    if (!prompt) {
        toastr.warning('请输入剧本内容！');
        return;
    }

const newScript = {
    name,
    desc,
    category,
    prompt
};


if (editingScriptIndex === -1) {
    tutuScenarios.push(newScript);
    toastr.success(`剧本 [${name}] 已创建！`);
} else {
    tutuScenarios[editingScriptIndex] = newScript;
    toastr.success(`剧本 [${name}] 已更新！`);
}

if (!tutuCategories.includes(category)) {
    tutuCategories.push(category);
}

saveTutuCategories();


    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(tutuScenarios)
    );

    renderLibrary();
    renderTutuCategorySelects();

    editingScriptIndex = -1;
    $('#tutu_script_editor').slideUp(150);
});
// 查看 / 隐藏剧本内容
$(document).on('click', '.tutu-view-script-btn', function () {
    const $card = $(this).closest('.tutu-script-card');
    const $content = $card.find('.tutu-script-content');
    const $icon = $(this).find('i');

    if ($content.is(':visible')) {
        $content.slideUp(150);
        $icon.attr('class', 'fa-solid fa-eye');
        $(this).attr('title', '查看剧本内容');
    } else {
        $content.slideDown(150);
        $icon.attr('class', 'fa-solid fa-eye-slash');
        $(this).attr('title', '隐藏剧本内容');
    }
});
// 单独导出剧本
$(document).on(
    'click',
    '.tutu-export-script-btn',
    function (event) {
        event.preventDefault();
        event.stopPropagation();

        const index =
            Number($(this).attr('data-index'));

        exportTutuSingleScenario(index);
    }
);

// 载入剧本到生成页面
$(document).on('click', '.tutu-load-script-btn', function() {
    // 获取当前按钮上的剧本编号
    const index = Number($(this).data('index'));

    // 根据编号找到对应的剧本
    const item = tutuScenarios[index];

    // 如果没有找到剧本，就停止
    if (!item) {
        toastr.error('找不到这个剧本');
        return;
    }

    // 把剧本正文放进“生成”标签页的输入框
    $('#tutu_prompt').val(item.prompt || '');

    // 切换到“生成”标签页
    switchTutuTab('tutu_tab_generate');

    // 提示用户
    toastr.info(`已载入：${item.name}`, '兔兔小剧场');
});

// 编辑剧本
$(document).on('click', '.tutu-edit-script-btn', function() {
    const index = Number($(this).data('index'));
    openScriptEditor(index);
});

// 删除剧本
$(document).on('click', '.tutu-delete-script-btn', function() {
    const index = Number($(this).data('index'));
    const item = tutuScenarios[index];

    if (!item) return;

    const confirmed = confirm(`确定要删除剧本「${item.name}」吗？`);

    if (!confirmed) return;

    tutuScenarios.splice(index, 1);

    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(tutuScenarios)
    );

    renderLibrary();

    toastr.success('剧本已删除');
});


// 手动生成小剧场
$(document).on(
    'click',
    '#tutu_generate_btn',
    function () {
        const scenario = String(
            $('#tutu_prompt').val() || ''
        ).trim();

        runTutuGeneration({
            scenario,
            isAutomatic: false,
        });
    }
);

});

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
const STYLE_LIBRARY_KEY = 'tutu_theater_style_library';
const STYLE_PACKAGE_TYPE = 'tutu-theater-style-package';
const STYLE_PACKAGE_VERSION = 1;

let tutuStyleLibrary = loadLocalJson(STYLE_LIBRARY_KEY, {
    manager: [],
    embed: [],
    quote: [],
});

function normalizeTutuStyleLibrary(data) {
    const result = {
        manager: [],
        embed: [],
        quote: [],
    };

    for (const target of Object.keys(result)) {
        result[target] = Array.isArray(data?.[target])
            ? data[target].filter(item =>
                item &&
                typeof item.id === 'string' &&
                typeof item.name === 'string' &&
                typeof item.css === 'string'
            )
            : [];
    }

    return result;
}

tutuStyleLibrary =
    normalizeTutuStyleLibrary(tutuStyleLibrary);

function saveTutuStyleLibrary() {
    localStorage.setItem(
        STYLE_LIBRARY_KEY,
        JSON.stringify(tutuStyleLibrary)
    );
}

function createTutuStyleId() {
    return typeof crypto?.randomUUID === 'function'
        ? crypto.randomUUID()
        : `tutu-style-${Date.now()}-${Math.random()
            .toString(16)
            .slice(2)}`;
}

function saveTutuStylePreset(target, name, css, oldId = '') {
    if (!['manager', 'embed', 'quote'].includes(target)) {
        throw new Error('未知样式类型');
    }

    name = String(name || '').trim();
    css = String(css || '').trim();

    if (!name) {
        throw new Error('请输入样式名称');
    }

    if (!css) {
        throw new Error('CSS 不能为空');
    }

    const list = tutuStyleLibrary[target];
    const index = list.findIndex(item => item.id === oldId);

    const record = {
        id: index >= 0 ? list[index].id : createTutuStyleId(),
        name,
        css,
        updatedAt: Date.now(),
    };

    if (index >= 0) {
        list[index] = record;
    } else {
        list.unshift(record);
    }

    saveTutuStyleLibrary();
    return record;
}

function deleteTutuStylePreset(target, id) {
    tutuStyleLibrary[target] =
        tutuStyleLibrary[target].filter(item => item.id !== id);

    saveTutuStyleLibrary();
}
const API_PRESETS_KEY = 'tutu_theater_api_presets';
const CHARACTER_CONTEXT_KEY = 'tutu_theater_character_context';
const CATEGORIES_KEY = 'tutu_theater_categories';
const AUX_PROMPTS_KEY =
    'tutu_theater_auxiliary_prompts';

const AUX_PROMPT_TYPES = [
    'jailbreak',
    'style',
];

let tutuAuxPrompts = normalizeTutuAuxPrompts(
    loadLocalJson(AUX_PROMPTS_KEY, {
        jailbreak: [],
        style: [],
    })
);

function normalizeTutuAuxPrompts(data) {
    const result = {
        jailbreak: [],
        style: [],
    };

    AUX_PROMPT_TYPES.forEach(type => {
        result[type] = Array.isArray(data?.[type])
            ? data[type]
                .filter(item =>
                    item &&
                    typeof item.id === 'string' &&
                    typeof item.name === 'string' &&
                    typeof item.content === 'string'
                )
                .map(item => ({
                    id: item.id,
                    name: String(item.name || '').trim(),
                    content: String(item.content || '').trim(),
                    createdAt:
                        Number(item.createdAt) || Date.now(),
                    updatedAt:
                        Number(item.updatedAt) || Date.now(),
                }))
                .filter(item =>
                    item.name && item.content
                )
            : [];
    });

    return result;
}

function saveTutuAuxPrompts() {
    localStorage.setItem(
        AUX_PROMPTS_KEY,
        JSON.stringify(tutuAuxPrompts)
    );
}

function createTutuAuxPromptId() {
    return typeof crypto?.randomUUID === 'function'
        ? crypto.randomUUID()
        : `tutu-aux-${Date.now()}-${Math.random()
            .toString(16)
            .slice(2)}`;
}

function getTutuAuxPromptTypeLabel(type) {
    return type === 'style'
        ? '文风'
        : '破限';
}

function saveTutuAuxPromptRecord(
    type,
    name,
    content,
    oldId = ''
) {
    if (!AUX_PROMPT_TYPES.includes(type)) {
        throw new Error('未知提示词类型');
    }

    name = String(name || '').trim();
    content = String(content || '').trim();

    if (!name) {
        throw new Error('请输入提示词名称');
    }

    if (!content) {
        throw new Error('提示词内容不能为空');
    }

    const list = tutuAuxPrompts[type];

    const index = list.findIndex(
        item => item.id === oldId
    );

    const oldRecord =
        index >= 0 ? list[index] : null;

    const record = {
        id:
            oldRecord?.id ||
            createTutuAuxPromptId(),

        name,
        content,

        createdAt:
            oldRecord?.createdAt ||
            Date.now(),

        updatedAt: Date.now(),
    };

    if (index >= 0) {
        list[index] = record;
    } else {
        list.unshift(record);
    }

    saveTutuAuxPrompts();

    return record;
}

function deleteTutuAuxPromptRecord(type, id) {
    if (!AUX_PROMPT_TYPES.includes(type)) {
        return false;
    }

    const oldLength =
        tutuAuxPrompts[type].length;

    tutuAuxPrompts[type] =
        tutuAuxPrompts[type].filter(
            item => item.id !== id
        );

    saveTutuAuxPrompts();

    return tutuAuxPrompts[type].length !== oldLength;
}

function findTutuAuxPrompt(type, id) {
    if (!AUX_PROMPT_TYPES.includes(type)) {
        return null;
    }

    return tutuAuxPrompts[type].find(
        item => item.id === id
    ) || null;
}

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

    characterAvatar:
        getCurrentTutuCharacterAvatar(),

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

        characterAvatar:
            getCurrentTutuCharacterAvatar(),
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

    characterAvatar:
        String(
            value.characterAvatar ||
            findTutuCharacterAvatarByName(
                value.characterName
            ) ||
            ''
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
/**
 * 获取当前 SillyTavern 角色的头像文件名
 */
function getCurrentTutuCharacterAvatar() {
    try {
        const context = SillyTavern.getContext();

        const character =
            context.characterId !== undefined &&
            context.characters?.[context.characterId]
                ? context.characters[context.characterId]
                : null;

        return String(
            character?.avatar ||
            character?.data?.avatar ||
            ''
        ).trim();
    } catch (error) {
        console.warn(
            '[兔兔小剧场] 获取当前角色头像失败：',
            error
        );

        return '';
    }
}

/**
 * 根据角色名称从 SillyTavern 角色列表中寻找头像。
 *
 * 主要用于兼容旧收藏：
 * 旧收藏里没有 characterAvatar 字段，
 * 可以尝试按照角色名称补找。
 */
function findTutuCharacterAvatarByName(characterName) {
    const targetName =
        String(characterName || '').trim();

    if (!targetName) {
        return '';
    }

    try {
        const context = SillyTavern.getContext();

        const characters =
            Array.isArray(context.characters)
                ? context.characters
                : [];

        const character = characters.find(item => {
            const name = String(
                item?.name ||
                item?.data?.name ||
                ''
            ).trim();

            return name === targetName;
        });

        return String(
            character?.avatar ||
            character?.data?.avatar ||
            ''
        ).trim();
    } catch (error) {
        console.warn(
            '[兔兔小剧场] 按角色名称查找头像失败：',
            error
        );

        return '';
    }
}

/**
 * 获取收藏记录对应的头像文件名
 */
function getTutuFavoriteCharacterAvatar(
    favorite,
    characterName = ''
) {
    const savedAvatar = String(
        favorite?.characterAvatar || ''
    ).trim();

    if (savedAvatar) {
        return savedAvatar;
    }

    return findTutuCharacterAvatarByName(
        characterName ||
        favorite?.characterName ||
        ''
    );
}

/**
 * 将 SillyTavern 角色头像文件名转换成图片地址。
 *
 * SillyTavern 通常通过：
 * /thumbnail?type=avatar&file=文件名
 * 提供角色头像缩略图。
 */
function getTutuCharacterAvatarUrl(avatar) {
    const value = String(avatar || '').trim();

    if (!value) {
        return '';
    }

    /*
     * 兼容已经是完整地址的情况。
     */
    if (
        /^(?:https?:|data:|blob:)/i.test(value) ||
        value.startsWith('/')
    ) {
        return value;
    }

    return (
        '/thumbnail?type=avatar&file=' +
        encodeURIComponent(value)
    );
}

/**
 * 给收藏分组中的头像节点设置图片。
 *
 * 如果缩略图接口加载失败，会尝试 /characters/文件名；
 * 再失败则显示默认用户图标。
 */
function setTutuFavoriteAvatar(
    $container,
    avatar
) {
    const value = String(avatar || '').trim();

    const $image =
        $container.find(
            '.tutu-favorite-character-avatar'
        );

    const $fallback =
        $container.find(
            '.tutu-favorite-character-avatar-fallback'
        );

    if (!value || !$image.length) {
        $image.hide();
        $fallback.show();
        return;
    }

    const thumbnailUrl =
        getTutuCharacterAvatarUrl(value);

    const characterFileUrl =
        /^(?:https?:|data:|blob:|\/)/i.test(value)
            ? value
            : `/characters/${encodeURIComponent(value)}`;

    let triedCharacterFile = false;

    $fallback.hide();

    $image
        .off('error.tutuAvatar')
        .on('error.tutuAvatar', function () {
            if (
                !triedCharacterFile &&
                characterFileUrl !== thumbnailUrl
            ) {
                triedCharacterFile = true;
                this.src = characterFileUrl;
                return;
            }

            $(this).hide();
            $fallback.show();
        })
        .attr('src', thumbnailUrl)
        .show();
}

function createTutuFavoriteRecord(content, title = '') {
    const text = String(content || '').trim();

    const characterName =
        getCurrentTutuCharacterName();
    const characterAvatar =
        getCurrentTutuCharacterAvatar();


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
        characterAvatar,

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

/*
 * 没有任何展开状态记录时，默认展开全部分组。
 * 用户操作过分组后，再按照保存的状态恢复。
 */
const hasSavedExpandedState =
    localStorage.getItem(
        FAVORITES_EXPANDED_KEY
    ) !== null;

groupedFavorites.forEach(
    (items, characterName) => {
        const isExpanded =
            !hasSavedExpandedState ||
            expandedGroups.has(characterName);


            const $group = $(`
                <div class="tutu-favorite-group">
                    <div class="tutu-favorite-group-header">
<div class="tutu-favorite-group-title">
    <span class="tutu-favorite-character-avatar-box">
        <img
            class="tutu-favorite-character-avatar"
            alt=""
            loading="lazy">

        <i
            class="
                fa-solid
                fa-user
                tutu-favorite-character-avatar-fallback
            ">
        </i>
    </span>

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

/*
 * 优先从这个分组的收藏记录中读取头像。
 * 如果是旧收藏没有保存头像，则按照角色名从
 * SillyTavern 的角色列表中补找。
 */
const avatarItem =
    items.find(item =>
        String(
            item?.characterAvatar || ''
        ).trim()
    );

const characterAvatar =
    getTutuFavoriteCharacterAvatar(
        avatarItem || items[0],
        characterName
    );

setTutuFavoriteAvatar(
    $group,
    characterAvatar
);

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
    <div class="tutu-favorite-card-title-row">
        <span class="tutu-favorite-card-avatar-box">
            <img
                class="tutu-favorite-card-avatar"
                alt=""
                loading="lazy">

            <i
                class="
                    fa-solid
                    fa-user
                    tutu-favorite-card-avatar-fallback
                ">
            </i>
        </span>

        <div class="tutu-favorite-card-title-content">
            <div class="tutu-favorite-title"></div>

            <div class="tutu-favorite-time">
                ${time}
            </div>
        </div>
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
const itemAvatar =
    getTutuFavoriteCharacterAvatar(
        item,
        characterName
    );

const $cardAvatar =
    $card.find(
        '.tutu-favorite-card-avatar'
    );

const $cardAvatarFallback =
    $card.find(
        '.tutu-favorite-card-avatar-fallback'
    );

if (itemAvatar && $cardAvatar.length) {
    const thumbnailUrl =
        getTutuCharacterAvatarUrl(
            itemAvatar
        );

    const originalUrl =
        /^(?:https?:|data:|blob:|\/)/i.test(
            itemAvatar
        )
            ? itemAvatar
            : `/characters/${encodeURIComponent(
                itemAvatar
            )}`;

    let triedOriginal = false;

    $cardAvatarFallback.hide();

    $cardAvatar
        .on('error', function () {
            if (
                !triedOriginal &&
                originalUrl !== thumbnailUrl
            ) {
                triedOriginal = true;
                this.src = originalUrl;
                return;
            }

            $(this).hide();
            $cardAvatarFallback.show();
        })
        .attr('src', thumbnailUrl)
        .show();
} else {
    $cardAvatar.hide();
    $cardAvatarFallback.show();
}
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
    activeJailbreakPromptId: '',
    activeStylePromptId: '',
    auxPromptsEnabled: false,
    autoGenerateEnabled: false,

    embedDefaultCollapsed: false,
    autoGenerateMode: 'current',
    autoGenerateScope: 'all',
    autoGenerateCategory: '',
    autoSequenceIndex: 0,
    autoSequenceIndexes: {},

outputMode: 'panel',

// 界面外观
uiTheme: 'classic',
uiCustomCss: '',

stylePresetIds: {
    manager: '',
    embed: '',
    quote: '',
},

// 自定义捕捉标签
captureTagName: '',


    ...tutuSettings,
};
tutuSettings.stylePresetIds = {
    manager: '',
    embed: '',
    quote: '',
    ...(tutuSettings.stylePresetIds || {}),
};

if (typeof tutuSettings.embedDefaultCollapsed !== 'boolean') {
    tutuSettings.embedDefaultCollapsed = false;
}
if (typeof tutuSettings.auxPromptsEnabled !== 'boolean') {
    tutuSettings.auxPromptsEnabled = Boolean(
        tutuSettings.activeJailbreakPromptId ||
        tutuSettings.activeStylePromptId
    );
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
    <div id="tutu_show_preview_btn" class="tutu-result-mode-btn active" title="预览">
        <i class="fa-solid fa-display"></i>
    </div>
    <div id="tutu_show_source_btn" class="tutu-result-mode-btn" title="源码">
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

<div id="tutu_new_script_btn" class="tutu-icon-action primary" role="button" tabindex="0" aria-label="新建剧本" title="新建剧本">
    <i class="fa-solid fa-plus"></i>
</div>

<div
    id="tutu_batch_manage_btn"
    class="tutu-icon-action"
    role="button"
    tabindex="0"
    aria-label="批量管理剧本"
    title="批量管理">

    <i class="fa-solid fa-list-check"></i>
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
<div
    id="tutu_batch_manage_panel"
    class="tutu-batch-manage-panel"
    style="display:none;">

    <div class="tutu-batch-manage-left">

        <label class="tutu-batch-select-all-label">
            <input
                type="checkbox"
                id="tutu_batch_select_all">

            <span>
                全选
            </span>
        </label>

        <span id="tutu_batch_selected_count">
            已选择 0 个剧本
        </span>

    </div>

    <div class="tutu-batch-manage-right">

        <select
            id="tutu_batch_target_category"
            class="text_pole">
        </select>

        <button
            type="button"
            id="tutu_batch_move_btn"
            class="menu_button">

            <i class="fa-solid fa-folder-tree"></i>
            移动到分类
        </button>

        <button
            type="button"
            id="tutu_batch_cancel_btn"
            class="menu_button">

            退出
        </button>

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
<div
    id="tutu_tab_import"
    class="tutu-tab-content">

    <!-- 导入来源和目标 -->
    <div class="tutu-native-import-toolbar">

        <select
            id="tutu_preset_type"
            class="text_pole">

            <option value="openai" selected>
                对话补全预设
            </option>

            <option value="worldbook">
                世界书
            </option>
        </select>

        <select
            id="tutu_import_target"
            class="text_pole">

            <option value="scenario">
                导入为剧本
            </option>

            <option value="jailbreak">
                导入为破限
            </option>

            <option value="style">
                导入为文风
            </option>
        </select>
<select
    id="tutu_import_category"
    class="text_pole"
    title="选择导入剧本的分类">

    <option value="">
        请选择剧本分类
    </option>
</select>
        <select
            id="tutu_preset_file"
            class="text_pole">

            <option value="">
                请选择预设或世界书
            </option>
        </select>

    </div>

    <!-- 全选和导入按钮 -->
    <div class="tutu-native-import-actions">

        <label class="tutu-native-select-all">
            <input
                type="checkbox"
                id="tutu_select_all">

            <span>
                全选
            </span>
        </label>

<div
    id="tutu_import_selected_btn"
    class="menu_button margin0 tutu-native-import-icon-btn"
    role="button"
    tabindex="0"
    aria-label="导入所选项"
    title="导入所选项">

    <i class="fa-solid fa-download"></i>
</div>
    </div>

    <!-- 预设或世界书条目列表 -->
    <div
        id="tutu_native_prompts_list"
        class="tutu-native-prompts-list">

        <div class="tutu-native-import-placeholder">
            请选择对话补全预设或世界书
        </div>

    </div>

</div>


<!-- TAB 4: 设置 -->
<div id="tutu_tab_settings" class="tutu-tab-content">

    <div class="tutu-settings-section">
    <div class="tutu-appearance-manager">
    <div class="tutu-settings-title">
        <i class="fa-solid fa-palette"></i>
        界面外观
    </div>

    <label class="tutu-settings-label" for="tutu_ui_theme">
        管理器样式
    </label>

    <select id="tutu_ui_theme" class="text_pole">
        <option value="classic">经典主题</option>
        <option value="cream">奶油手账</option>
        <option value="neumorphic">新拟态</option>
        <option value="editorial">编辑部</option>
<option value="polaroid">拍立得相机</option>
        <option value="archive">纸张档案</option>
        <option value="custom">自定义 CSS</option>
    </select>

    <div
        id="tutu_theme_preview_list"
        class="tutu-theme-preview-list">

        <button
            type="button"
            class="tutu-theme-preview active"
            data-theme="classic">
            <span class="tutu-theme-preview-swatch classic"></span>
            <span>经典</span>
        </button>

        <button
            type="button"
            class="tutu-theme-preview"
            data-theme="cream">
            <span class="tutu-theme-preview-swatch cream"></span>
            <span>奶油</span>
        </button>

        <button
            type="button"
            class="tutu-theme-preview"
            data-theme="neumorphic">
            <span class="tutu-theme-preview-swatch neumorphic"></span>
            <span>拟态</span>
        </button>

        <button
            type="button"
            class="tutu-theme-preview"
            data-theme="editorial">
            <span class="tutu-theme-preview-swatch editorial"></span>
            <span>编辑部</span>
        </button>
<button
    type="button"
    class="tutu-theme-preview"
    data-theme="polaroid">
    <span class="tutu-theme-preview-swatch polaroid"></span>
    <span>拍立得</span>
</button>
        <button
            type="button"
            class="tutu-theme-preview"
            data-theme="archive">
            <span class="tutu-theme-preview-swatch archive"></span>
            <span>档案</span>
        </button>
    </div>

    <div
        id="tutu_ui_custom_css_box"
        class="tutu-ui-custom-css-box"
        style="display:none;">

        <label
            class="tutu-settings-label"
            for="tutu_ui_custom_css">
            自定义 CSS
        </label>
<input
    id="tutu_manager_style_name"
    class="text_pole"
    placeholder="管理器样式名称">

<select
    id="tutu_manager_style_preset"
    class="text_pole">
    <option value="">选择已保存样式</option>
</select>

        <textarea
            id="tutu_ui_custom_css"
            class="text_pole tutu-ui-custom-css"
            rows="12"
            spellcheck="false"
            placeholder="#tutu_theater_panel {
    background: #202124;
}

#tutu_theater_panel .tutu-icon-toolbar {
    border-bottom: 2px solid #ff6688;
}

#tutu_theater_panel .tutu-icon-action {
    border-radius: 4px;
}"></textarea>

        <div class="tutu-appearance-actions">
            <button
                type="button"
                id="tutu_apply_custom_css_btn"
                class="menu_button">
                <i class="fa-solid fa-check"></i>
                应用 CSS
            </button>

            <button
                type="button"
                id="tutu_reset_custom_css_btn"
                class="menu_button">
                <i class="fa-solid fa-rotate-left"></i>
                清空
            </button>
                <button
        type="button"
        id="tutu_save_manager_style_btn"
        class="menu_button">
        <i class="fa-solid fa-floppy-disk"></i>
        保存样式
    </button>

    <button
        type="button"
        id="tutu_delete_manager_style_btn"
        class="menu_button">
        <i class="fa-solid fa-trash"></i>
        删除样式
    </button>

    <!-- 在这里添加样式导入导出 -->
    <div class="tutu-appearance-actions">
        <button
            type="button"
            id="tutu_export_styles_btn"
            class="menu_button">
            <i class="fa-solid fa-file-export"></i>
            导出全部样式
        </button>

        <button
            type="button"
            id="tutu_import_styles_btn"
            class="menu_button">
            <i class="fa-solid fa-file-import"></i>
            导入样式
        </button>

        <input
            id="tutu_import_styles_file"
            type="file"
            accept=".json,application/json"
            style="display:none;">
    </div>
</div>
        </div>

        <div class="tutu-api-help">
            自定义样式会保存在浏览器中。建议所有选择器以
            <code>#tutu_theater_panel</code> 开头，避免影响酒馆其他界面。
        </div>
    </div>
</div>
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
    自定义捕捉标签
</label>

<input
    id="tutu_capture_tag_name"
    class="text_pole"
    type="text"
    placeholder="例如：details"
>

<div class="tutu-api-help">
    填写一个 HTML 标签名（例如 <code>details</code>），
    插件会自动捕捉 AI 回复中所有该标签包裹的内容，
    为它们添加小剧场操作按钮（收藏、导出、全屏查看）。
    <br>
    留空表示不捕捉。多个标签用英文逗号分隔，例如：
    <code>details, blockquote</code>
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
<div class="tutu-settings-section tutu-aux-prompt-section">

    <div class="tutu-settings-title">
        <i class="fa-solid fa-feather-pointed"></i>
        破限与文风
    </div>

    <label class="tutu-switch-row tutu-aux-master-switch">
        <input
            type="checkbox"
            id="tutu_aux_prompts_enabled">

        <span>
            启用破限与文风提示词
        </span>
    </label>

    <div
        id="tutu_aux_prompt_settings_body"
        class="tutu-aux-prompt-settings-body"
        style="display:none;">

        <div class="tutu-api-help">
            破限和文风都不是必选项，可以分别选择一个，
            也可以选择“不使用”。
        </div>

        <div class="tutu-aux-active-selects">

            <div class="tutu-aux-active-item">
                <label class="tutu-settings-label">
                    当前启用的破限
                </label>

                <select
                    id="tutu_active_jailbreak_prompt"
                    class="text_pole">
                    <option value="">不使用破限</option>
                </select>
            </div>

            <div class="tutu-aux-active-item">
                <label class="tutu-settings-label">
                    当前启用的文风
                </label>

                <select
                    id="tutu_active_style_prompt"
                    class="text_pole">
                    <option value="">不使用文风</option>
                </select>
            </div>

        </div>

        <details
            id="tutu_aux_prompt_editor_details"
            class="tutu-aux-editor-details">

            <summary class="tutu-aux-editor-summary">
                <span>
                    <i class="fa-solid fa-pen-to-square"></i>
                    管理已保存的破限与文风
                </span>

                <i class="fa-solid fa-chevron-down tutu-aux-editor-arrow"></i>
            </summary>

            <div class="tutu-aux-editor">

                <label class="tutu-settings-label">
                    编辑类型
                </label>

                <select
                    id="tutu_aux_prompt_type"
                    class="text_pole">

                    <option value="jailbreak">
                        破限提示词
                    </option>

                    <option value="style">
                        文风提示词
                    </option>
                </select>

                <label class="tutu-settings-label">
                    已保存条目
                </label>

                <select
                    id="tutu_aux_prompt_preset"
                    class="text_pole">

                    <option value="">
                        新建提示词
                    </option>
                </select>

                <div
                    id="tutu_aux_edit_status"
                    class="tutu-aux-edit-status">
                    当前正在新建提示词
                </div>

                <label class="tutu-settings-label">
                    名称
                </label>

                <input
                    id="tutu_aux_prompt_name"
                    class="text_pole"
                    type="text"
                    placeholder="例如：通用破限、细腻文风">

                <label class="tutu-settings-label">
                    提示词正文
                </label>

                <textarea
                    id="tutu_aux_prompt_content"
                    class="text_pole tutu-aux-prompt-content"
                    rows="8"
                    placeholder="请输入破限或文风提示词……"></textarea>

                <div class="tutu-appearance-actions">

                    <button
                        type="button"
                        id="tutu_new_aux_prompt_btn"
                        class="menu_button">

                        <i class="fa-solid fa-plus"></i>
                        新建
                    </button>

                    <button
                        type="button"
                        id="tutu_save_aux_prompt_btn"
                        class="menu_button">

                        <i class="fa-solid fa-floppy-disk"></i>

                        <span id="tutu_save_aux_prompt_btn_text">
                            保存新提示词
                        </span>
                    </button>

                    <button
                        type="button"
                        id="tutu_delete_aux_prompt_btn"
                        class="menu_button">

                        <i class="fa-solid fa-trash"></i>
                        删除
                    </button>

                </div>

            </div>
        </details>

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

function exportTutuStyles() {
    const data = {
        type: STYLE_PACKAGE_TYPE,
        version: STYLE_PACKAGE_VERSION,
        exportedAt: new Date().toISOString(),
        styles: tutuStyleLibrary,
    };

    downloadTutuBlob(
        new Blob(
            [JSON.stringify(data, null, 2)],
            { type: 'application/json;charset=utf-8' }
        ),
        '兔兔小剧场-样式预设.json'
    );
}
async function importTutuStyles(file) {
    if (file.size > 1024 * 1024) {
        throw new Error('样式文件不能超过 1MB');
    }

    const data = JSON.parse(await file.text());

    if (
        data?.type !== STYLE_PACKAGE_TYPE ||
        !data.styles
    ) {
        throw new Error('这不是兔兔小剧场样式文件');
    }

    const imported =
        normalizeTutuStyleLibrary(data.styles);

    for (const target of ['manager', 'embed', 'quote']) {
        imported[target].forEach(item => {
            const oldIndex = tutuStyleLibrary[target]
                .findIndex(old => old.id === item.id);

            if (oldIndex >= 0) {
                tutuStyleLibrary[target][oldIndex] = item;
            } else {
                tutuStyleLibrary[target].push(item);
            }
        });
    }

    saveTutuStyleLibrary();
    renderTutuStylePresetSelects();
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
        minimalist: {
            name: '🌸 极简杂志', type: 'canvas',
            font: '"Noto Serif SC", "Source Han Serif SC", serif', renderMode: 'minimalist'
        },
        social: {
            name: '📱 社交动态', type: 'canvas',
            font: '"Helvetica Neue", Helvetica, "PingFang SC", "Microsoft YaHei", sans-serif', renderMode: 'social'
        },
        ancient: {
            name: '📜 古风稿纸', type: 'canvas',
            font: '"Kaiti SC", "STKaiti", "Noto Serif SC", serif', renderMode: 'ancient'
        },
        letter: {
            name: '💌 温馨信笺', type: 'canvas',
            font: '"Kaiti SC", "STKaiti", "Noto Serif SC", serif', renderMode: 'letter'
        },
        aurora: {
            name: '🌌 极光玻璃', type: 'canvas',
            font: '"Helvetica Neue", Helvetica, "PingFang SC", "Noto Sans SC", sans-serif', renderMode: 'aurora'
        },
        custom_css: {
            name: '🎨 自定义 CSS', type: 'html', renderMode: 'custom_css'
        },
    };
    return styles[styleName] || styles.minimalist;
}

function getAllTutuQuoteStyles() {
    const styleNames = ['minimalist', 'social', 'ancient', 'letter', 'aurora', 'custom_css'];
    return styleNames.map(name => ({
        value: name,
        ...getTutuQuoteStyle(name),
    }));
}







async function exportTutuQuoteImage(
    content,
    characterName,
    styleName = 'classic',
    options = {}
) {
    const text = String(content || '').trim();

    if (!text) {
        toastr.warning('没有可以导出的文字内容');
        return;
    }

    const style = getTutuQuoteStyle(styleName);

    // 如果是自定义 CSS 书摘，使用 HTML 导出
    if (style.type === 'html' || styleName === 'custom_css') {
        await exportTutuCustomCssQuote(text, characterName, options);
        return;
    }

    const fontSize = Number(options.fontSize) || 32;
    const lineHeightRatio = Number(options.lineHeight) || 1.8;
    const lineHeight = Math.round(fontSize * lineHeightRatio);
    const textIndent = Number(options.textIndent) || 0;
    const textAlign = options.textAlign || 'left';
    const paddingH = Number(options.paddingH) || 90;
    const paddingV = Number(options.paddingV) || 90;
    const imageWidth = Number(options.imageWidth) || 1200;
    const showDate = options.showDate !== false;
    const showQuoteMark = options.showQuoteMark !== false;
    const showDecoLine = options.showDecoLine !== false;
    const titleText = String(options.titleText || '兔兔小剧场').trim();
    const subtitleText = String(
        options.subtitleText || `来自：${characterName}`
    ).trim();

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const width = imageWidth;
    const contentWidth = width - paddingH * 2;

    ctx.font = `${fontSize}px ${style.font}`;

    const lines = wrapTutuCanvasText(ctx, text, contentWidth, textIndent);
    const bodyHeight = lines.length * lineHeight;

    const headerHeight = 160;
    const footerHeight = showDate ? 100 : 50;

    const height = Math.max(
        600,
        paddingV + headerHeight + bodyHeight + footerHeight + paddingV
    );

    canvas.width = width;
    canvas.height = height;

    // 使用统一渲染接口
    renderQuoteStyle(ctx, {
        style,
        width,
        height,
        contentWidth: width - paddingH * 2,
        paddingH,
        paddingV,
        text,
        lines,
        lineHeight,
        fontSize: options.fontSize,
        textAlign: options.textAlign,
        titleText: options.titleText,
        subtitleText: options.subtitleText,
        showDate: options.showDate,
        showQuoteMark: options.showQuoteMark,
        showDecoLine: options.showDecoLine,
        characterName: tutuQuoteEditorCharacter,
    });


    return new Promise((resolve) => {
        canvas.toBlob(blob => {
            if (!blob) {
                toastr.error('生成书摘图片失败');
                resolve();
                return;
            }

            const filename =
                `${sanitizeTutuFilename(
                    `兔兔小剧场-${characterName}`
                )}.png`;

            downloadTutuBlob(blob, filename);

            toastr.success('书摘图片已导出');
            resolve();
        }, 'image/png');
    });
}

// 文本换行辅助函数
function wrapTutuCanvasText(ctx, text, maxWidth, textIndent = 0) {
    const lines = [];
    const paragraphs = text.split(/\r?\n/);
    const indent = textIndent > 0 ? '\u3000'.repeat(textIndent) : '';

    paragraphs.forEach(paragraph => {
        if (!paragraph.trim()) {
            lines.push('');
            return;
        }

        let currentLine = '';
        const fullText = indent ? indent + paragraph : paragraph;

        for (const char of fullText) {
            const testLine = currentLine + char;
            if (ctx.measureText(testLine).width > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = char;
            } else {
                currentLine = testLine;
            }
        }

        if (currentLine) lines.push(currentLine);
    });

    return lines;
}

// 统一渲染入口
function renderQuoteStyle(ctx, params) {
    const { style } = params;
    switch (style.renderMode) {
        case 'social': renderSocialStyle(ctx, params); break;
        case 'cinematic': renderCinematicStyle(ctx, params); break;
        case 'ancient': renderAncientStyle(ctx, params); break;
        case 'cyberpunk': renderCyberpunkStyle(ctx, params); break;
        default: renderMinimalistStyle(ctx, params);
    }
}

// 1. 🌸 极简杂志风（大面积留白，巨大的装饰引号，高级感）
function renderMinimalistStyle(ctx, params) {
    const { width, height, paddingH, paddingV, lines, lineHeight, fontSize, titleText, subtitleText, showDate } = params;
    
    // 米白色背景
    ctx.fillStyle = '#F9F9F7';
    ctx.fillRect(0, 0, width, height);

    // 背景巨大的装饰引号
    ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
    ctx.font = 'bold 400px Georgia, serif';
    ctx.fillText('“', paddingH - 40, paddingV + 250);

    let currentY = paddingV + 60;

    // 杂志感标题（全大写/加粗）
    ctx.fillStyle = '#1A1A1A';
    ctx.font = `bold 36px ${params.style.font}`;
    ctx.fillText(titleText, paddingH, currentY);
    
    ctx.fillStyle = '#888888';
    ctx.font = `20px ${params.style.font}`;
    ctx.fillText(subtitleText, paddingH, currentY + 40);

    // 分割线
    ctx.fillStyle = '#E0E0E0';
    ctx.fillRect(paddingH, currentY + 80, 60, 3);

    currentY += 160;

    // 正文排版
    ctx.fillStyle = '#2C2C2C';
    ctx.font = `${fontSize}px ${params.style.font}`;
    ctx.textAlign = params.textAlign;
    
    lines.forEach(line => {
        const x = params.textAlign === 'center' ? width / 2 : paddingH;
        ctx.fillText(line, x, currentY);
        currentY += lineHeight;
    });

    if (showDate) {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#AAAAAA';
        ctx.font = `italic 20px ${params.style.font}`;
        ctx.fillText(new Date().toLocaleDateString(), width - paddingH, height - paddingV);
    }
}

// 2. 📱 社交动态风（拟真卡片UI、头像、点赞栏）
function renderSocialStyle(ctx, params) {
    const { width, height, paddingH, lines, lineHeight, fontSize, titleText, subtitleText } = params;

    // 浅灰背景
    ctx.fillStyle = '#F0F2F5';
    ctx.fillRect(0, 0, width, height);

    const cardMargin = paddingH * 0.5;
    const cardW = width - cardMargin * 2;
    const cardH = height - cardMargin * 2;

    // 绘制卡片白底和阴影
    ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(cardMargin, cardMargin, cardW, cardH, 20);
    ctx.fill();
    ctx.shadowColor = 'transparent';

    let currentY = cardMargin + 60;

    // 画头像圈 (取名字第一个字)
    const avatarX = cardMargin + 50;
    const avatarR = 35;
    ctx.fillStyle = '#6557C7'; // 兔兔紫
    ctx.beginPath();
    ctx.arc(avatarX, currentY, avatarR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(titleText.charAt(0) || '兔', avatarX, currentY + 10);

    // ID 和 时间
    ctx.textAlign = 'left';
    ctx.fillStyle = '#1C1E21';
    ctx.font = `bold 28px ${params.style.font}`;
    ctx.fillText(titleText, avatarX + 50, currentY - 5);
    ctx.fillStyle = '#606770';
    ctx.font = `20px ${params.style.font}`;
    ctx.fillText(`${subtitleText} · 刚刚发布`, avatarX + 50, currentY + 25);

    currentY += 100;

    // 正文
    ctx.fillStyle = '#050505';
    ctx.font = `${fontSize}px ${params.style.font}`;
    const textX = cardMargin + 50;
    lines.forEach(line => {
        ctx.fillText(line, textX, currentY);
        currentY += lineHeight;
    });

    // 底部点赞评论栏
    const footerY = cardMargin + cardH - 40;
    ctx.fillStyle = '#EBEDF0';
    ctx.fillRect(cardMargin + 50, footerY - 40, cardW - 100, 2); // 分割线
    ctx.fillStyle = '#606770';
    ctx.font = '24px sans-serif';
    ctx.fillText('♥ 喜欢   💬 评论   ➦ 分享', textX, footerY + 10);
}


// 4. 📜 古风稿纸（乌丝栏格，红线，楷体）
function renderAncientStyle(ctx, params) {
    const { width, height, paddingH, paddingV, lines, lineHeight, fontSize, titleText } = params;

    // 宣纸底色
    ctx.fillStyle = '#F4EAD5';
    ctx.fillRect(0, 0, width, height);

    const marginX = paddingH;
    const marginY = paddingV;
    const contentW = width - marginX * 2;

    // 绘制红色“乌丝栏”（古代红线稿纸）
    ctx.strokeStyle = '#B33C36';
    ctx.lineWidth = 2;
    // 粗外框
    ctx.strokeRect(marginX - 10, marginY - 10, contentW + 20, height - marginY * 2 + 20);
    ctx.lineWidth = 1;

    let currentY = marginY;

    // 标题红底白字小印章
    ctx.fillStyle = '#B33C36';
    ctx.fillRect(marginX, currentY, 120, 40);
    ctx.fillStyle = '#F4EAD5';
    ctx.font = `bold 22px ${params.style.font}`;
    ctx.textAlign = 'center';
    ctx.fillText(titleText.slice(0,4), marginX + 60, currentY + 28);
    
    currentY += 80;

    // 循环绘制正文和行线
    ctx.textAlign = 'left';
    ctx.font = `${fontSize}px ${params.style.font}`;
    ctx.fillStyle = '#222222';

    lines.forEach(line => {
        // 画红线
        ctx.beginPath();
        ctx.moveTo(marginX, currentY + 10);
        ctx.lineTo(marginX + contentW, currentY + 10);
        ctx.stroke();

        ctx.fillText(line, marginX, currentY - 10);
        currentY += lineHeight;
    });
}

// 统一渲染入口
function renderQuoteStyle(ctx, params) {
    const { style } = params;
    switch (style.renderMode) {
        case 'social': renderSocialStyle(ctx, params); break;
        case 'ancient': renderAncientStyle(ctx, params); break;
        case 'letter': renderLetterStyle(ctx, params); break;
        case 'aurora': renderAuroraStyle(ctx, params); break;
        default: renderMinimalistStyle(ctx, params);
    }
}

// 💌 温馨信笺风（带胶带、纸张阴影和书写横线）
function renderLetterStyle(ctx, params) {
    const { width, height, paddingH, paddingV, lines, lineHeight, fontSize, titleText, subtitleText, showDate } = params;

    // 木质/暖灰桌面背景
    ctx.fillStyle = '#EBE7DF';
    ctx.fillRect(0, 0, width, height);

    const paperX = paddingH * 0.5;
    const paperY = paddingV * 0.5;
    const paperW = width - paperX * 2;
    const paperH = height - paperY * 2;

    // 纸张阴影
    ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
    ctx.shadowBlur = 25;
    ctx.shadowOffsetY = 10;
    
    // 白纸主体
    ctx.fillStyle = '#FDFCF8';
    ctx.fillRect(paperX, paperY, paperW, paperH);
    ctx.shadowColor = 'transparent';

    // 顶部半透明胶带贴纸
    ctx.save();
    ctx.translate(width / 2, paperY);
    ctx.rotate(-0.03); // 微微倾斜
    ctx.fillStyle = 'rgba(215, 195, 180, 0.8)';
    ctx.fillRect(-70, -20, 140, 38);
    ctx.restore();

    let currentY = paperY + 90;

    // 标题区域
    ctx.fillStyle = '#5A4C40';
    ctx.font = `bold ${fontSize + 8}px ${params.style.font}`;
    ctx.textAlign = 'center';
    ctx.fillText(titleText, width / 2, currentY);
    
    currentY += 40;
    ctx.font = `italic ${fontSize - 4}px ${params.style.font}`;
    ctx.fillStyle = '#9C8C7E';
    ctx.fillText(subtitleText, width / 2, currentY);

    currentY += 80;

    // 绘制横线和正文
    ctx.textAlign = params.textAlign === 'center' ? 'center' : 'left';
    ctx.font = `${fontSize}px ${params.style.font}`;
    ctx.fillStyle = '#333333';
    
    const lineStartX = paperX + 50;
    const lineEndX = width - paperX - 50;
    const textStartX = params.textAlign === 'center' ? width / 2 : lineStartX + 10;

    lines.forEach(line => {
        // 画浅色虚线/横线
        ctx.beginPath();
        ctx.moveTo(lineStartX, currentY + 12);
        ctx.lineTo(lineEndX, currentY + 12);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillText(line, textStartX, currentY);
        currentY += lineHeight;
    });

    if (showDate) {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#B3A69A';
        ctx.font = `${fontSize - 6}px ${params.style.font}`;
        ctx.fillText(new Date().toLocaleDateString(), lineEndX, height - paperY - 30);
    }
}

// 🌌 极光玻璃风（时下最火的毛玻璃UI，深色高级感）
function renderAuroraStyle(ctx, params) {
    const { width, height, paddingH, paddingV, lines, lineHeight, fontSize, titleText, subtitleText, showDate } = params;

    // 极光渐变背景
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#100C20'); // 深邃紫
    grad.addColorStop(0.5, '#0F2C4C'); // 极光蓝
    grad.addColorStop(1, '#063B3B'); // 暗青色
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // 增加几个柔和发光球体，模拟极光光晕
    const drawGlow = (x, y, r, color) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, color);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
    };
    drawGlow(width * 0.8, height * 0.2, width * 0.5, 'rgba(120, 80, 255, 0.25)');
    drawGlow(width * 0.2, height * 0.8, width * 0.5, 'rgba(0, 255, 200, 0.15)');

    const glassX = paddingH * 0.5;
    const glassY = paddingV * 0.5;
    const glassW = width - glassX * 2;
    const glassH = height - glassY * 2;

    // 毛玻璃背后的卡片阴影
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 20;

    // 绘制半透明玻璃主体
    ctx.beginPath();
    ctx.roundRect(glassX, glassY, glassW, glassH, 24);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)'; // 半透明白层
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // 绘制玻璃的高光边框
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.stroke();

    let currentY = glassY + 90;
    
    // 文字发光效果
    ctx.shadowColor = 'rgba(255, 255, 255, 0.3)';
    ctx.shadowBlur = 12;

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.font = `bold ${fontSize + 8}px ${params.style.font}`;
    ctx.fillText(titleText, width / 2, currentY);
    
    currentY += 40;
    ctx.font = `${fontSize - 4}px ${params.style.font}`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.fillText(subtitleText, width / 2, currentY);
    
    currentY += 80;

    // 正文
    ctx.textAlign = params.textAlign === 'center' ? 'center' : 'left';
    ctx.font = `${fontSize}px ${params.style.font}`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.shadowBlur = 0; // 正文去掉模糊，保证清晰可读
    
    const textStartX = params.textAlign === 'center' ? width / 2 : glassX + 60;
    
    lines.forEach(line => {
        ctx.fillText(line, textStartX, currentY);
        currentY += lineHeight;
    });

    if (showDate) {
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = `${fontSize - 6}px ${params.style.font}`;
        ctx.fillText(new Date().toLocaleDateString(), width - glassX - 40, height - glassY - 30);
    }
}


// ==========================================
// 自定义 CSS 书摘
// ==========================================

async function exportTutuCustomCssQuote(content, characterName, options) {
    const customCss = String(options.customCss || '').trim();

    if (!customCss) {
        toastr.warning('请先输入自定义 CSS 样式');
        return;
    }

    const text = String(content || '').trim();
    const titleText = String(options.titleText || '兔兔小剧场').trim();
    const subtitleText = String(
        options.subtitleText || `来自：${characterName}`
    ).trim();
    const showDate = options.showDate !== false;

    const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(titleText)}</title>
<style>
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: "Noto Serif SC", "Source Han Serif SC", serif;
    line-height: 1.8;
}

.quote-container {
    width: ${Number(options.imageWidth) || 1200}px;
    padding: ${Number(options.paddingV) || 90}px ${Number(options.paddingH) || 90}px;
}

.quote-title {
    font-size: 42px;
    font-weight: bold;
    margin-bottom: 10px;
}

.quote-subtitle {
    font-size: 24px;
    margin-bottom: 40px;
}

.quote-content {
    font-size: ${Number(options.fontSize) || 32}px;
    line-height: ${Number(options.lineHeight) || 1.8};
    text-align: ${options.textAlign || 'left'};
    text-indent: ${Number(options.textIndent) || 0}em;
    white-space: pre-wrap;
    word-break: break-word;
}

.quote-date {
    margin-top: 40px;
    font-size: 22px;
    opacity: 0.7;
}

/* 用户自定义样式 */
${customCss}
</style>
</head>
<body>
<div class="quote-container">
    <div class="quote-title">${escapeHtml(titleText)}</div>
    <div class="quote-subtitle">${escapeHtml(subtitleText)}</div>
    <div class="quote-content">${escapeHtml(text)}</div>
    ${showDate ? `<div class="quote-date">${new Date().toLocaleDateString()}</div>` : ''}
</div>
</body>
</html>
    `.trim();

    // 使用 html2canvas 或截图方式导出
    // 这里先导出为 HTML 文件
    const blob = new Blob([htmlContent], {
        type: 'text/html;charset=utf-8',
    });

    const filename = `${sanitizeTutuFilename(
        `兔兔小剧场-CSS-${characterName}`
    )}.html`;

    downloadTutuBlob(blob, filename);

    toastr.success('自定义 CSS 书摘已导出为 HTML');
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
    getCurrentTutuCharacterName(),
    getCurrentTutuCharacterAvatar()
);
    } catch (error) {
        console.error('嵌入小剧场到聊天失败：', error);
        toastr.error('嵌入失败：' + (error.message || error));
    }
}

function appendTheaterToDOM(
    mesId,
    content,
    characterName = '',
    characterAvatar = ''
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
details._tutuTheaterAvatar =
    String(
        characterAvatar ||
        findTutuCharacterAvatarByName(
            details._tutuTheaterCharacter
        ) ||
        getCurrentTutuCharacterAvatar() ||
        ''
    ).trim();
const summary = document.createElement('summary');
summary.className = 'tutu-theater-embed-header';

const titleSpan = document.createElement('span');
titleSpan.className = 'tutu-theater-embed-title';
titleSpan.textContent = '🐰 兔兔小剧场';

const toggleSpan = document.createElement('span');
toggleSpan.className = 'tutu-theater-embed-toggle';
toggleSpan.textContent = '';
toggleSpan.setAttribute('aria-hidden', 'true');

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
    details._tutuTheaterCharacter,
    '',
    details._tutuTheaterAvatar
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
function installTutuTargetCss(target, css) {
    const styleId = `tutu_custom_style_${target}`;

    let style = document.getElementById(styleId);

    if (!style) {
        style = document.createElement('style');
        style.id = styleId;
        document.head.appendChild(style);
    }

    const rootMap = {
        manager: '#tutu_theater_panel',
        embed: '.tutu-theater-embed.tutu-embed-theme-custom',
        quote: '.quote-container',
    };

    style.textContent = String(css || '')
        .replaceAll('{{root}}', rootMap[target]);
}



// ==========================================
// 小剧场收藏、导出、全屏查看通用函数
// ==========================================

function favoriteTutuContent(
    content,
    characterName,
    title = '',
    characterAvatar = ''
) {
    const text = String(content || '').trim();

    if (!text) {
        toastr.warning('当前没有可以收藏的小剧场');
        return;
    }

    const finalCharacterName =
        String(characterName || 'AI').trim() || 'AI';

    /*
     * 优先使用调用方传入的头像。
     * 如果没有传入，则按照角色名称从 SillyTavern 中查找。
     *
     * 如果收藏的是当前角色，也会自动拿到当前角色头像。
     */
    const finalCharacterAvatar =
        String(characterAvatar || '').trim() ||
        findTutuCharacterAvatarByName(
            finalCharacterName
        ) ||
        (
            finalCharacterName ===
            getCurrentTutuCharacterName()
                ? getCurrentTutuCharacterAvatar()
                : ''
        );

    const titleInput = window.prompt(
        '请输入这个小剧场的收藏名称：',
        title || `来自${finalCharacterName}的小剧场`
    );

    if (titleInput === null) {
        return;
    }

    const finalTitle =
        String(titleInput || '').trim() ||
        '未命名小剧场';

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

        /*
         * 新增：保存角色卡头像文件名
         */
        characterAvatar: finalCharacterAvatar,

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

// 打开书摘编辑器
openTutuQuoteEditor(text, finalCharacterName);

}
// ==========================================
// 书摘图片编辑器
// ==========================================

let tutuQuoteEditorContent = '';
let tutuQuoteEditorCharacter = 'AI';

function openTutuQuoteEditor(content, characterName) {
    tutuQuoteEditorContent = String(content || '').trim();
    tutuQuoteEditorCharacter = String(characterName || 'AI').trim() || 'AI';

    // 如果编辑器已存在，先移除
    closeTutuQuoteEditor();

    const allStyles = getAllTutuQuoteStyles();

    const styleOptionsHtml = allStyles.map(s =>
        `<option value="${s.value}">${escapeHtml(s.name)}</option>`
    ).join('');

    const overlay = document.createElement('div');
    overlay.id = 'tutu_quote_editor_overlay';
    overlay.innerHTML = `
        <div class="tutu-quote-editor">
            <div class="tutu-quote-editor-header">
                <div class="tutu-quote-editor-title">
                    <i class="fa-solid fa-image"></i>
                    书摘图片设置
                </div>
                <button type="button" id="tutu_quote_editor_close"
                    class="tutu-fullscreen-action-btn tutu-fullscreen-close-btn"
                    title="关闭">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>

            <div class="tutu-quote-editor-body">
                <div class="tutu-quote-editor-controls">

                    <div class="tutu-quote-control-group">
                        <label class="tutu-quote-control-label">
                            书摘样式
                        </label>
                        <select id="tutu_qe_style" class="text_pole">
                            ${styleOptionsHtml}
                        </select>
                    </div>

                    <div class="tutu-quote-control-row">
                        <div class="tutu-quote-control-group">
                            <label class="tutu-quote-control-label">
                                正文字号 (px)
                            </label>
                            <input id="tutu_qe_font_size" class="text_pole"
                                type="number" min="16" max="72" value="32">
                        </div>

                        <div class="tutu-quote-control-group">
                            <label class="tutu-quote-control-label">
                                行高倍数
                            </label>
                            <input id="tutu_qe_line_height" class="text_pole"
                                type="number" min="1" max="4" step="0.1" value="1.8">
                        </div>
                    </div>

                    <div class="tutu-quote-control-row">
                        <div class="tutu-quote-control-group">
                            <label class="tutu-quote-control-label">
                                段落缩进 (字数)
                            </label>
                            <input id="tutu_qe_text_indent" class="text_pole"
                                type="number" min="0" max="8" value="2">
                        </div>

                        <div class="tutu-quote-control-group">
                            <label class="tutu-quote-control-label">
                                文字对齐
                            </label>
                            <select id="tutu_qe_text_align" class="text_pole">
                                <option value="left" selected>左对齐</option>
                                <option value="center">居中</option>
                            </select>
                        </div>
                    </div>

                    <div class="tutu-quote-control-row">
                        <div class="tutu-quote-control-group">
                            <label class="tutu-quote-control-label">
                                水平边距 (px)
                            </label>
                            <input id="tutu_qe_padding_h" class="text_pole"
                                type="number" min="20" max="200" value="90">
                        </div>

                        <div class="tutu-quote-control-group">
                            <label class="tutu-quote-control-label">
                                垂直边距 (px)
                            </label>
                            <input id="tutu_qe_padding_v" class="text_pole"
                                type="number" min="20" max="200" value="90">
                        </div>
                    </div>

                    <div class="tutu-quote-control-group">
                        <label class="tutu-quote-control-label">
                            图片宽度 (px)
                        </label>
                        <input id="tutu_qe_image_width" class="text_pole"
                            type="number" min="600" max="3000" step="100" value="1200">
                    </div>

                    <div class="tutu-quote-control-row">
                        <div class="tutu-quote-control-group">
                            <label class="tutu-quote-control-label">
                                标题文字
                            </label>
                            <input id="tutu_qe_title" class="text_pole"
                                type="text" value="兔兔小剧场">
                        </div>

                        <div class="tutu-quote-control-group">
                            <label class="tutu-quote-control-label">
                                副标题
                            </label>
                            <input id="tutu_qe_subtitle" class="text_pole"
                                type="text" value="来自：${escapeHtml(tutuQuoteEditorCharacter)}">
                        </div>
                    </div>

                    <div class="tutu-quote-control-row tutu-quote-checkboxes">
                        <label class="tutu-quote-checkbox-label">
                            <input type="checkbox" id="tutu_qe_show_date" checked>
                            显示日期
                        </label>

                        <label class="tutu-quote-checkbox-label">
                            <input type="checkbox" id="tutu_qe_show_quote_mark" checked>
                            显示引号装饰
                        </label>

                        <label class="tutu-quote-checkbox-label">
                            <input type="checkbox" id="tutu_qe_show_deco_line" checked>
                            显示装饰线
                        </label>
                    </div>

                    <div class="tutu-quote-control-group tutu-custom-css-group" style="display:none;">
                        <label class="tutu-quote-control-label">
                            自定义 CSS 样式
                        </label>
<input
    id="tutu_quote_style_name"
    class="text_pole"
    placeholder="书摘样式名称">

<select id="tutu_quote_style_preset" class="text_pole">
    <option value="">选择已保存样式</option>
</select>

<div class="tutu-appearance-actions">
    <button id="tutu_save_quote_style" class="menu_button">
        保存样式
    </button>

    <button id="tutu_delete_quote_style" class="menu_button">
        删除样式
    </button>
</div>
                        <textarea id="tutu_qe_custom_css" class="text_pole tutu-custom-css-textarea"
                            rows="8"
                            placeholder=".quote-container { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }&#10;.quote-title { color: white; }&#10;.quote-content { color: #f0f0f0; }"></textarea>
                        <div class="tutu-api-help">
                            你可以覆盖 .quote-container、.quote-title、.quote-subtitle、.quote-content、.quote-date 的样式
                        </div>
                    </div>

                </div>


                <div class="tutu-quote-editor-preview-area">
                    <div class="tutu-quote-preview-title" style="display:flex; justify-content:space-between; align-items:center;">
                        <span>实时预览</span>
                        
                        <!-- ★ 新增的缩放滑动条 -->
                        <div style="display:flex; gap:8px; align-items:center; background:rgba(0,0,0,0.15); padding:4px 12px; border-radius:20px;">
                            <i class="fa-solid fa-magnifying-glass-minus" style="font-size:0.8em; opacity:0.7;"></i>
                            <input type="range" id="tutu_qe_zoom_slider" min="20" max="200" value="100" style="width: 100px; margin:0; cursor:pointer;">
                            <i class="fa-solid fa-magnifying-glass-plus" style="font-size:0.8em; opacity:0.7;"></i>
                            <span id="tutu_qe_zoom_label" style="font-size:0.85em; width:45px; text-align:right;">100%</span>
                        </div>
                    </div>
                    
                    <div class="tutu-quote-preview-scroll">
                        <canvas id="tutu_qe_preview_canvas"></canvas>
                    </div>
                </div>
            </div>

            <div class="tutu-quote-editor-footer">
                <button type="button" id="tutu_qe_refresh_btn"
                    class="menu_button">
                    <i class="fa-solid fa-rotate"></i>
                    刷新预览
                </button>

                <button type="button" id="tutu_qe_export_btn"
                    class="menu_button" style="background:var(--SmartThemeQuoteColor);color:#fff;">
                    <i class="fa-solid fa-download"></i>
                    导出图片
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // 绑定事件
    $('#tutu_quote_editor_close').on('click', closeTutuQuoteEditor);
    // 样式切换时显示/隐藏自定义 CSS
    $(overlay).on('change', '#tutu_qe_style', function() {
        const selectedStyle = $(this).val();
        if (selectedStyle === 'custom_css') {
            $('.tutu-custom-css-group').slideDown(200);
            $('#tutu_qe_preview_canvas').hide();
            $('.tutu-quote-preview-scroll').html(`
                <div style="padding:20px;text-align:center;opacity:0.7;">
                    自定义 CSS 书摘将导出为 HTML 文件<br>
                    请直接点击"导出图片"按钮
                </div>
            `);
        } else {
            $('.tutu-custom-css-group').slideUp(200);
            $('#tutu_qe_preview_canvas').show();
            renderTutuQuotePreview();
        }
    });

    // 实时预览：控件变化时自动刷新
    $(overlay).on(
        'input change',
        '#tutu_qe_style, #tutu_qe_font_size, #tutu_qe_line_height, ' +
        '#tutu_qe_text_indent, #tutu_qe_text_align, #tutu_qe_padding_h, ' +
        '#tutu_qe_padding_v, #tutu_qe_image_width, #tutu_qe_title, ' +
        '#tutu_qe_subtitle, #tutu_qe_show_date, #tutu_qe_show_quote_mark, ' +
        '#tutu_qe_show_deco_line',
        debounceQuotePreview
    );

    $('#tutu_qe_refresh_btn').on('click', renderTutuQuotePreview);
    // ★ 绑定滑动条缩放逻辑
    $(overlay).on('input', '#tutu_qe_zoom_slider', function() {
        const val = $(this).val();
        $('#tutu_qe_zoom_label').text(val + '%');
        $('#tutu_qe_preview_canvas').css({
            'width': val + '%',
            'height': 'auto' // 保持比例
        });
    });

    $('#tutu_qe_export_btn').on('click', async () => {
        const options = getTutuQuoteEditorOptions();
        await exportTutuQuoteImage(
            tutuQuoteEditorContent,
            tutuQuoteEditorCharacter,
            options.styleName,
            options
        );
    });

    // ESC 关闭
    overlay._tutuEscHandler = (e) => {
        if (e.key === 'Escape') closeTutuQuoteEditor();
    };
    document.addEventListener('keydown', overlay._tutuEscHandler);
    // 点击预览图片即可放大/缩小
    $(overlay).on('click', '#tutu_qe_preview_canvas', function() {
        $(this).toggleClass('tutu-zoomed');
    });


    // 首次渲染预览
    setTimeout(renderTutuQuotePreview, 100);
}

function closeTutuQuoteEditor() {
    const overlay = document.getElementById('tutu_quote_editor_overlay');
    if (overlay) {
        if (overlay._tutuEscHandler) {
            document.removeEventListener('keydown', overlay._tutuEscHandler);
        }
        overlay.remove();
    }
}

function getTutuQuoteEditorOptions() {
    return {
        styleName: $('#tutu_qe_style').val() || 'classic',
        fontSize: Number($('#tutu_qe_font_size').val()) || 32,
        lineHeight: Number($('#tutu_qe_line_height').val()) || 1.8,
        textIndent: Number($('#tutu_qe_text_indent').val()) || 0,
        textAlign: $('#tutu_qe_text_align').val() || 'left',
        paddingH: Number($('#tutu_qe_padding_h').val()) || 90,
        paddingV: Number($('#tutu_qe_padding_v').val()) || 90,
        imageWidth: Number($('#tutu_qe_image_width').val()) || 1200,
        titleText: $('#tutu_qe_title').val() || '兔兔小剧场',
        subtitleText: $('#tutu_qe_subtitle').val() || `来自：${tutuQuoteEditorCharacter}`,
        showDate: $('#tutu_qe_show_date').is(':checked'),
        showQuoteMark: $('#tutu_qe_show_quote_mark').is(':checked'),
        showDecoLine: $('#tutu_qe_show_deco_line').is(':checked'),
        customCss: $('#tutu_qe_custom_css').val() || '',

    };
}

let tutuQuotePreviewTimer = null;

function debounceQuotePreview() {
    if (tutuQuotePreviewTimer) {
        clearTimeout(tutuQuotePreviewTimer);
    }
    tutuQuotePreviewTimer = setTimeout(renderTutuQuotePreview, 200);
}

function renderTutuQuotePreview() {
    const canvas = document.getElementById('tutu_qe_preview_canvas');
    if (!canvas) return;
    const options = getTutuQuoteEditorOptions();
    
    // 自定义 CSS 不显示预览
    if (options.styleName === 'custom_css') {
        return;
    }

    const ctx = canvas.getContext('2d');
    const style = getTutuQuoteStyle(options.styleName);
    const text = tutuQuoteEditorContent;

    const fontSize = options.fontSize;
    const lineHeightRatio = options.lineHeight;
    const lineHeight = Math.round(fontSize * lineHeightRatio);
    const paddingH = options.paddingH;
    const paddingV = options.paddingV;
    const width = options.imageWidth;
    const contentWidth = width - paddingH * 2;

    ctx.font = `${fontSize}px ${style.font}`;

    // 换行计算 (直接调用封装好的换行函数)
    const lines = wrapTutuCanvasText(ctx, text, contentWidth, options.textIndent);

    const headerHeight = 160;
    const footerHeight = options.showDate ? 100 : 50;
    const bodyHeight = lines.length * lineHeight;
    const height = Math.max(
        500,
        paddingV + headerHeight + bodyHeight + footerHeight + paddingV
    );

    canvas.width = width;
    canvas.height = height;

    // ★ 按照滑动条的值来设置预览宽度
    const zoomVal = $('#tutu_qe_zoom_slider').val() || 100;
    canvas.style.width = `${zoomVal}%`;
    canvas.style.height = 'auto'; // 保持宽高比


    // 【关键修复】：这里不再写死画背景和文字，而是调用统一的渲染引擎！
    renderQuoteStyle(ctx, {
        style,
        width,
        height,
        contentWidth,
        paddingH,
        paddingV,
        text, // 把原始文本传进去，古风卷轴需要用到
        lines,
        lineHeight,
        fontSize: options.fontSize,
        textAlign: options.textAlign,
        titleText: options.titleText,
        subtitleText: options.subtitleText,
        showDate: options.showDate,
        showQuoteMark: options.showQuoteMark,
        showDecoLine: options.showDecoLine,
        characterName: tutuQuoteEditorCharacter,
    });
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
function getActiveTutuJailbreakPrompt() {
    const id =
        String(
            tutuSettings.activeJailbreakPromptId ||
            ''
        );

    return findTutuAuxPrompt(
        'jailbreak',
        id
    );
}

function getActiveTutuStylePrompt() {
    const id =
        String(
            tutuSettings.activeStylePromptId ||
            ''
        );

    return findTutuAuxPrompt(
        'style',
        id
    );
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
const auxPromptsEnabled =
    Boolean(tutuSettings.auxPromptsEnabled);

const jailbreakPrompt =
    auxPromptsEnabled
        ? getActiveTutuJailbreakPrompt()
        : null;

const stylePrompt =
    auxPromptsEnabled
        ? getActiveTutuStylePrompt()
        : null;

const jailbreakText =
    jailbreakPrompt?.content || '';

const styleText =
    stylePrompt?.content || '';

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

${jailbreakText
    ? `【破限提示词】\n${jailbreakText}\n`
    : ''}

${styleText
    ? `【文风提示词】\n${styleText}\n`
    : ''}

【用户选择读取的世界书条目】
${worldBookText}

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
    storedTheater.characterName,
    storedTheater.characterAvatar
);
    });
}


initTutuEmbedRestorer();
// ==========================================
// 自定义标签捕捉
// ==========================================

/**
 * 解析用户配置的捕捉标签名列表
 */
function getTutuCaptureTagNames() {
    const raw =
        String(tutuSettings.captureTagName || '').trim();

    if (!raw) {
        return [];
    }

    return raw
        .split(/[,，\s]+/)
        .map(tag => tag.trim().toLowerCase())
        .filter(Boolean)
        .filter(tag => /^[a-z][a-z0-9-]*$/i.test(tag));
}

/**
 * 为一个已经存在于 DOM 中的元素添加小剧场操作按钮
 */
function attachTutuCaptureActions(element) {
    /*
     * 防止重复处理
     */
    if (element.dataset.tutuCaptured === 'true') {
        return;
    }

    element.dataset.tutuCaptured = 'true';

    /*
     * 提取这个元素的内容
     *
     * 如果是 <details>，取其中 <summary> 之后的部分。
     * 否则取整个 innerHTML。
     */
    const tagName =
        element.tagName.toLowerCase();

    let capturedContent = '';

    if (tagName === 'details') {
        /*
         * 克隆节点，移除 summary，取剩余 HTML
         */
        const clone = element.cloneNode(true);
        const summary = clone.querySelector('summary');

        if (summary) {
            summary.remove();
        }

        capturedContent = clone.innerHTML.trim();
    } else {
        capturedContent = element.innerHTML.trim();
    }

    if (!capturedContent) {
        return;
    }

    /*
     * 获取角色名称
     */
    const $mesBlock =
        $(element).closest('.mes');

    let characterName = 'AI';

    if ($mesBlock.length) {
        characterName =
            $mesBlock.find('.ch_name .name_text').text().trim() ||
            'AI';
    }

    /*
     * 保存内容到 DOM 节点
     */
    element._tutuCapturedContent = capturedContent;
    element._tutuCapturedCharacter = characterName;

    /*
     * 创建操作按钮栏
     */
    const actionsBar = document.createElement('div');
    actionsBar.className = 'tutu-capture-actions-bar';

    const label = document.createElement('span');
    label.className = 'tutu-capture-label';
    label.textContent = '🐰 小剧场';

    const buttonsContainer = document.createElement('span');
    buttonsContainer.className = 'tutu-capture-buttons';

    function createCaptureButton(iconClass, titleText, handler) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tutu-capture-action-btn';
        btn.title = titleText;
        btn.innerHTML = `<i class="${iconClass}"></i>`;

        btn.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            handler();
        });

        return btn;
    }

    const favoriteBtn = createCaptureButton(
        'fa-regular fa-heart',
        '收藏小剧场',
        () => {
            favoriteTutuContent(
                element._tutuCapturedContent,
                element._tutuCapturedCharacter
            );
        }
    );

    const exportBtn = createCaptureButton(
        'fa-solid fa-file-export',
        '导出小剧场',
        () => {
            exportTutuContent(
                element._tutuCapturedContent,
                element._tutuCapturedCharacter
            );
        }
    );

    const fullscreenBtn = createCaptureButton(
        'fa-solid fa-expand',
        '全屏查看',
        () => {
            openTutuTheaterFullscreen(
                element._tutuCapturedContent,
                element._tutuCapturedCharacter
            );
        }
    );

    buttonsContainer.appendChild(favoriteBtn);
    buttonsContainer.appendChild(exportBtn);
    buttonsContainer.appendChild(fullscreenBtn);

    actionsBar.appendChild(label);
    actionsBar.appendChild(buttonsContainer);

    /*
     * 将按钮栏插入到元素内部的顶部
     *
     * 如果是 <details>，插在 <summary> 后面
     */
    if (tagName === 'details') {
        const summary = element.querySelector('summary');

        if (summary) {
            summary.after(actionsBar);
        } else {
            element.prepend(actionsBar);
        }
    } else {
        element.prepend(actionsBar);
    }

    /*
     * 给元素加上视觉标记
     */
    element.classList.add('tutu-captured-element');
}

/**
 * 扫描所有聊天消息，捕捉指定标签
 */
function scanAndCaptureTutuTags() {
    const tagNames = getTutuCaptureTagNames();

    if (!tagNames.length) {
        return;
    }

    const selector = tagNames
        .map(tag => `.mes_text ${tag}:not([data-tutu-captured="true"])`)
        .join(', ');

    const elements = document.querySelectorAll(selector);

    elements.forEach(element => {
        attachTutuCaptureActions(element);
    });
}

/**
 * 初始化自动捕捉监听
 */
function initTutuCaptureListener() {
    /*
     * 首次扫描
     */
    setTimeout(() => {
        scanAndCaptureTutuTags();
    }, 500);

    /*
     * 监听消息渲染事件
     */
    if (typeof eventSource !== 'undefined') {
        const captureEvents = [
            event_types.CHARACTER_MESSAGE_RENDERED,
            event_types.MESSAGE_UPDATED,
            event_types.CHAT_CHANGED,
        ].filter(Boolean);

        captureEvents.forEach(eventType => {
            eventSource.on(eventType, () => {
                setTimeout(() => {
                    scanAndCaptureTutuTags();
                }, 400);
            });
        });
    }

    /*
     * 使用 MutationObserver 作为兜底方案
     *
     * 当 SillyTavern 动态渲染消息时，
     * 事件可能不够及时，
     * Observer 可以确保不遗漏。
     */
    const chatContainer =
        document.getElementById('chat');

    if (chatContainer) {
        const observer = new MutationObserver(() => {
            scanAndCaptureTutuTags();
        });

        observer.observe(chatContainer, {
            childList: true,
            subtree: true,
        });
    }
}

/*
 * 启动捕捉监听
 */
initTutuCaptureListener();

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
auxPromptsEnabled:
    $('#tutu_aux_prompts_enabled').is(':checked'),

activeJailbreakPromptId:
    $('#tutu_active_jailbreak_prompt').val() || '',

activeStylePromptId:
    $('#tutu_active_style_prompt').val() || '',
outputMode:
    $('#tutu_output_mode').val() || 'panel',

embedDefaultCollapsed:
    $('#tutu_embed_default_state').val() === 'collapsed',
captureTagName:
    $('#tutu_capture_tag_name').val().trim(),
uiTheme:
    normalizeTutuUiTheme(
        $('#tutu_ui_theme').val()
    ),

uiCustomCss:
    String(
        $('#tutu_ui_custom_css').val() || ''
    ),

stylePresetIds: {
    ...tutuSettings.stylePresetIds,
},

    };

    localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify(tutuSettings)
    );

    updateAutoGenerateStatus();
}
function renderTutuAuxPromptPresetSelect() {
    const type =
        String(
            $('#tutu_aux_prompt_type').val() ||
            'jailbreak'
        );

    const $select =
        $('#tutu_aux_prompt_preset');

    if (!$select.length) {
        return;
    }

    const previous =
        String($select.val() || '');

    $select.empty().append(
        $('<option>', {
            value: '',
            text: '新建提示词',
        })
    );

    const list =
        tutuAuxPrompts[type] || [];

    list.forEach(item => {
        $select.append(
            $('<option>', {
                value: item.id,
                text: item.name,
            })
        );
    });

    if (
        previous &&
        list.some(item => item.id === previous)
    ) {
        $select.val(previous);
    } else {
        $select.val('');
    }
}

function renderTutuActiveAuxPromptSelects() {
    const $jailbreak =
        $('#tutu_active_jailbreak_prompt');

    const $style =
        $('#tutu_active_style_prompt');

    if ($jailbreak.length) {
        $jailbreak.empty().append(
            $('<option>', {
                value: '',
                text: '不使用破限',
            })
        );

        tutuAuxPrompts.jailbreak.forEach(item => {
            $jailbreak.append(
                $('<option>', {
                    value: item.id,
                    text: item.name,
                })
            );
        });

        const activeId =
            String(
                tutuSettings.activeJailbreakPromptId ||
                ''
            );

        if (
            tutuAuxPrompts.jailbreak.some(
                item => item.id === activeId
            )
        ) {
            $jailbreak.val(activeId);
        } else {
            $jailbreak.val('');
            tutuSettings.activeJailbreakPromptId = '';
        }
    }

    if ($style.length) {
        $style.empty().append(
            $('<option>', {
                value: '',
                text: '不使用文风',
            })
        );

        tutuAuxPrompts.style.forEach(item => {
            $style.append(
                $('<option>', {
                    value: item.id,
                    text: item.name,
                })
            );
        });

        const activeId =
            String(
                tutuSettings.activeStylePromptId ||
                ''
            );

        if (
            tutuAuxPrompts.style.some(
                item => item.id === activeId
            )
        ) {
            $style.val(activeId);
        } else {
            $style.val('');
            tutuSettings.activeStylePromptId = '';
        }
    }
}
function updateTutuAuxPromptVisibility() {
    const enabled =
        $('#tutu_aux_prompts_enabled').is(':checked');

    const $body =
        $('#tutu_aux_prompt_settings_body');

    if (!$body.length) {
        return;
    }

    if (enabled) {
        $body.stop(true, true).slideDown(160);
    } else {
        $body.stop(true, true).slideUp(160);
    }
}

function updateTutuAuxPromptEditorStatus() {
    const type =
        String(
            $('#tutu_aux_prompt_type').val() ||
            'jailbreak'
        );

    const id =
        String(
            $('#tutu_aux_prompt_preset').val() ||
            ''
        );

    const label =
        getTutuAuxPromptTypeLabel(type);

    const record =
        id
            ? findTutuAuxPrompt(type, id)
            : null;

    if (record) {
        $('#tutu_aux_edit_status').text(
            `正在修改${label}提示词：「${record.name}」`
        );

        $('#tutu_save_aux_prompt_btn_text').text(
            '保存修改'
        );
    } else {
        $('#tutu_aux_edit_status').text(
            `当前正在新建${label}提示词`
        );

        $('#tutu_save_aux_prompt_btn_text').text(
            '保存新提示词'
        );
    }
}

function renderTutuAuxPromptManager() {
    renderTutuAuxPromptPresetSelect();
    renderTutuActiveAuxPromptSelects();
    updateTutuAuxPromptEditorStatus();
}


function clearTutuAuxPromptEditor() {
    $('#tutu_aux_prompt_preset').val('');
    $('#tutu_aux_prompt_name').val('');
    $('#tutu_aux_prompt_content').val('');

    updateTutuAuxPromptEditorStatus();
}

function loadTutuAuxPromptIntoEditor(type, id) {
    const record =
        findTutuAuxPrompt(type, id);

    if (!record) {
        $('#tutu_aux_prompt_name').val('');
        $('#tutu_aux_prompt_content').val('');

        updateTutuAuxPromptEditorStatus();
        return;
    }

    $('#tutu_aux_prompt_name')
        .val(record.name);

    $('#tutu_aux_prompt_content')
        .val(record.content);

    updateTutuAuxPromptEditorStatus();
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
const TUTU_UI_THEMES = new Set([
    'classic',
    'cream',
    'neumorphic',
    'editorial',
    'polaroid',
    'archive',
    'custom',
]);



const TUTU_CUSTOM_STYLE_ID =
    'tutu_theater_user_custom_style';

function normalizeTutuUiTheme(theme) {
    let value = String(theme || '').trim();

    /*
     * 已删除的旧主题统一迁移到拍立得
     */
    if (
        value === 'terminal' ||
        value === 'instagram' ||
        value === 'breeze' ||
        value === 'sakura'
    ) {
        value = 'polaroid';
    }

    return TUTU_UI_THEMES.has(value)
        ? value
        : 'classic';
}

function installTutuCustomCss(css) {
    let styleElement =
        document.getElementById(
            TUTU_CUSTOM_STYLE_ID
        );

    if (!styleElement) {
        styleElement =
            document.createElement('style');

        styleElement.id =
            TUTU_CUSTOM_STYLE_ID;

        document.head.appendChild(
            styleElement
        );
    }

    /*
     * 使用 textContent，不把 CSS 当作 HTML 插入。
     * 自定义 CSS 仍然是可信的本地高级功能。
     */
    styleElement.textContent =
        String(css || '');
}

function updateTutuThemeControls(theme) {
    const normalizedTheme =
        normalizeTutuUiTheme(theme);

    $('#tutu_ui_theme').val(
        normalizedTheme
    );

    $('.tutu-theme-preview')
        .removeClass('active')
        .filter(
            `[data-theme="${normalizedTheme}"]`
        )
        .addClass('active');

    if (normalizedTheme === 'custom') {
        $('#tutu_ui_custom_css_box')
            .stop(true, true)
            .slideDown(160);
    } else {
        $('#tutu_ui_custom_css_box')
            .stop(true, true)
            .slideUp(160);
    }
}

function applyTutuUiTheme(
    theme = tutuSettings.uiTheme,
    customCss = tutuSettings.uiCustomCss
) {
    const normalizedTheme =
        normalizeTutuUiTheme(theme);

    const panel =
        document.getElementById(
            'tutu_theater_panel'
        );

    if (panel) {
        panel.dataset.tutuTheme =
            normalizedTheme;
    }

    /*
     * 自定义 CSS 只在选择 custom 时启用。
     * 切回内置主题后不会继续污染内置样式。
     */
    installTutuCustomCss(
        normalizedTheme === 'custom'
            ? customCss
            : ''
    );

    updateTutuThemeControls(
        normalizedTheme
    );
}

function saveAndApplyTutuUiTheme(theme) {
    tutuSettings.uiTheme =
        normalizeTutuUiTheme(theme);

    tutuSettings.uiCustomCss =
        String(
            $('#tutu_ui_custom_css').val() || ''
        );

    localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify(tutuSettings)
    );

    applyTutuUiTheme(
        tutuSettings.uiTheme,
        tutuSettings.uiCustomCss
    );
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
$('#tutu_capture_tag_name')
    .val(tutuSettings.captureTagName || '');
$('#tutu_ui_theme').val(
    normalizeTutuUiTheme(
        tutuSettings.uiTheme
    )
);

$('#tutu_ui_custom_css').val(
    tutuSettings.uiCustomCss || ''
);
$('#tutu_aux_prompts_enabled')
    .prop(
        'checked',
        Boolean(tutuSettings.auxPromptsEnabled)
    );

applyTutuUiTheme(
    tutuSettings.uiTheme,
    tutuSettings.uiCustomCss
);
renderTutuStylePresetSelects();
updateTutuAuxPromptVisibility();

renderTutuAuxPromptManager();
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
let tutuBatchManageEnabled = false;

const tutuBatchSelectedIndexes =
    new Set();

function updateTutuBatchSelectedCount() {
    $('#tutu_batch_selected_count').text(
        `已选择 ${tutuBatchSelectedIndexes.size} 个剧本`
    );

    const total =
        $('.tutu-batch-script-checkbox').length;

    const selected =
        $('.tutu-batch-script-checkbox:checked')
            .length;

    $('#tutu_batch_select_all').prop(
        'checked',
        total > 0 && selected === total
    );

    $('#tutu_batch_select_all').prop(
        'indeterminate',
        selected > 0 && selected < total
    );
}

function renderTutuBatchCategorySelect() {
    const $select =
        $('#tutu_batch_target_category');

    if (!$select.length) {
        return;
    }

    const previous =
        String($select.val() || '');

    const categories =
        getAllTutuCategories();

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

function setTutuBatchManageEnabled(enabled) {
    tutuBatchManageEnabled =
        Boolean(enabled);

    if (!tutuBatchManageEnabled) {
        tutuBatchSelectedIndexes.clear();
    }

    $('#tutu_batch_manage_btn')
        .toggleClass(
            'active',
            tutuBatchManageEnabled
        );

    $('#tutu_batch_manage_panel')
        .toggle(tutuBatchManageEnabled);

    $('#tutu_library_list')
        .toggleClass(
            'tutu-batch-mode',
            tutuBatchManageEnabled
        );

    renderTutuBatchCategorySelect();
    renderLibrary();
    updateTutuBatchSelectedCount();
}

function moveSelectedTutuScenariosToCategory(
    targetCategory
) {
    targetCategory =
        String(targetCategory || '').trim();

    if (!targetCategory) {
        toastr.warning('请选择目标分类');
        return;
    }

    const indexes =
        Array.from(tutuBatchSelectedIndexes)
            .map(Number)
            .filter(index =>
                Number.isInteger(index) &&
                index >= 0 &&
                tutuScenarios[index]
            );

    if (!indexes.length) {
        toastr.warning('请至少选择一个剧本');
        return;
    }

    indexes.forEach(index => {
        tutuScenarios[index].category =
            targetCategory;
    });

    if (
        !tutuCategories.includes(
            targetCategory
        )
    ) {
        tutuCategories.push(
            targetCategory
        );
    }

    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(tutuScenarios)
    );

    saveTutuCategories();

    tutuExpandedCategories.add(
        targetCategory
    );

    saveTutuExpandedCategories();

    const movedCount =
        indexes.length;

    tutuBatchSelectedIndexes.clear();

    renderLibrary();
    renderTutuCategorySelects();
    renderTutuBatchCategorySelect();
    updateTutuBatchSelectedCount();

    toastr.success(
        `已将 ${movedCount} 个剧本移动到「${targetCategory}」`
    );
}

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
function renderTutuImportCategorySelect() {
    const $select =
        $('#tutu_import_category');

    if (!$select.length) {
        return;
    }

    const previous =
        String($select.val() || '');

    const categories =
        getAllTutuCategories();

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
    } else if (categories.includes('未分类')) {
        $select.val('未分类');
    } else {
        $select.prop('selectedIndex', 0);
    }
}

function updateTutuImportCategoryVisibility() {
    const target =
        String(
            $('#tutu_import_target').val() ||
            'scenario'
        );

    if (target === 'scenario') {
        renderTutuImportCategorySelect();

        $('#tutu_import_category')
            .show();
    } else {
        $('#tutu_import_category')
            .hide();
    }
}

function renderTutuCategorySelects() {
    const categories = getTutuScenarioCategories();

    renderTutuExportCategorySelect();
    renderTutuImportCategorySelect();


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
function renderTutuStylePresetSelect(target, selector) {
    const $select = $(selector);

    if (!$select.length) return;

    const current =
        tutuSettings.stylePresetIds[target] || '';

    $select.empty().append(
        $('<option>', {
            value: '',
            text: '选择已保存样式',
        })
    );

    tutuStyleLibrary[target].forEach(item => {
        $select.append(
            $('<option>', {
                value: item.id,
                text: item.name,
            })
        );
    });

    $select.val(current);
}

function renderTutuStylePresetSelects() {
    renderTutuStylePresetSelect(
        'manager',
        '#tutu_manager_style_preset'
    );

    renderTutuStylePresetSelect(
        'quote',
        '#tutu_quote_style_preset'
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

        <label
            class="tutu-batch-script-selector"
            title="选择这个剧本">

            <input
                type="checkbox"
                class="tutu-batch-script-checkbox"
                data-index="${index}"
                ${tutuBatchSelectedIndexes.has(index)
                    ? 'checked'
                    : ''}>
        </label>

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
$('#tutu_library_list').toggleClass(
    'tutu-batch-mode',
    tutuBatchManageEnabled
);

updateTutuBatchSelectedCount();

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
    $(document).on(
    'change',
    '#tutu_import_target',
    function () {
        updateTutuImportCategoryVisibility();
    }
);
    $(document).on(
    'change',
    '#tutu_aux_prompts_enabled',
    function () {
        tutuSettings.auxPromptsEnabled =
            $(this).is(':checked');

        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify(tutuSettings)
        );

        updateTutuAuxPromptVisibility();

        toastr.info(
            tutuSettings.auxPromptsEnabled
                ? '已启用破限与文风提示词'
                : '已停用破限与文风提示词'
        );
    }
);
    $(document).on(
    'click',
    '#tutu_batch_manage_btn',
    function () {
        setTutuBatchManageEnabled(
            !tutuBatchManageEnabled
        );
    }
);

$(document).on(
    'click',
    '#tutu_batch_cancel_btn',
    function () {
        setTutuBatchManageEnabled(false);
    }
);

$(document).on(
    'change',
    '.tutu-batch-script-checkbox',
    function () {
        const index =
            Number($(this).attr('data-index'));

        if (!Number.isInteger(index)) {
            return;
        }

        if ($(this).is(':checked')) {
            tutuBatchSelectedIndexes.add(index);
        } else {
            tutuBatchSelectedIndexes.delete(index);
        }

        updateTutuBatchSelectedCount();
    }
);

$(document).on(
    'change',
    '#tutu_batch_select_all',
    function () {
        const checked =
            $(this).is(':checked');

        $('.tutu-batch-script-checkbox')
            .each(function () {
                const index =
                    Number(
                        $(this).attr('data-index')
                    );

                $(this).prop(
                    'checked',
                    checked
                );

                if (!Number.isInteger(index)) {
                    return;
                }

                if (checked) {
                    tutuBatchSelectedIndexes.add(
                        index
                    );
                } else {
                    tutuBatchSelectedIndexes.delete(
                        index
                    );
                }
            });

        updateTutuBatchSelectedCount();
    }
);

$(document).on(
    'click',
    '#tutu_batch_move_btn',
    function () {
        const category =
            String(
                $('#tutu_batch_target_category').val() ||
                ''
            );

        moveSelectedTutuScenariosToCategory(
            category
        );
    }
);
$(document).on(
    'change',
    '#tutu_aux_prompt_type',
    function () {
        clearTutuAuxPromptEditor();
        renderTutuAuxPromptPresetSelect();
    }
);

$(document).on(
    'change',
    '#tutu_aux_prompt_preset',
    function () {
        const type =
            String(
                $('#tutu_aux_prompt_type').val() ||
                'jailbreak'
            );

        const id =
            String($(this).val() || '');

        loadTutuAuxPromptIntoEditor(
            type,
            id
        );

        /*
         * 选中了已有条目时自动展开编辑器。
         */
        if (id) {
            const details =
                document.getElementById(
                    'tutu_aux_prompt_editor_details'
                );

            if (details) {
                details.open = true;
            }
        }

        updateTutuAuxPromptEditorStatus();
    }
);


$(document).on(
    'click',
    '#tutu_new_aux_prompt_btn',
    function () {
        clearTutuAuxPromptEditor();

        $('#tutu_aux_prompt_name')
            .trigger('focus');
    }
);

$(document).on(
    'click',
    '#tutu_save_aux_prompt_btn',
    function () {
        try {
            const type =
                String(
                    $('#tutu_aux_prompt_type').val() ||
                    'jailbreak'
                );

            const oldId =
                String(
                    $('#tutu_aux_prompt_preset').val() ||
                    ''
                );

            const record =
                saveTutuAuxPromptRecord(
                    type,
                    $('#tutu_aux_prompt_name').val(),
                    $('#tutu_aux_prompt_content').val(),
                    oldId
                );

renderTutuAuxPromptManager();

$('#tutu_aux_prompt_type')
    .val(type);

renderTutuAuxPromptPresetSelect();

$('#tutu_aux_prompt_preset')
    .val(record.id);

loadTutuAuxPromptIntoEditor(
    type,
    record.id
);

updateTutuAuxPromptEditorStatus();

            toastr.success(
                `${getTutuAuxPromptTypeLabel(type)}提示词「${record.name}」已保存`
            );
        } catch (error) {
            toastr.warning(
                error.message ||
                '保存提示词失败'
            );
        }
    }
);

$(document).on(
    'click',
    '#tutu_delete_aux_prompt_btn',
    function () {
        const type =
            String(
                $('#tutu_aux_prompt_type').val() ||
                'jailbreak'
            );

        const id =
            String(
                $('#tutu_aux_prompt_preset').val() ||
                ''
            );

        if (!id) {
            toastr.warning('请先选择要删除的提示词');
            return;
        }

        const record =
            findTutuAuxPrompt(type, id);

        if (!record) {
            toastr.error('找不到这个提示词');
            return;
        }

        if (
            !confirm(
                `确定删除「${record.name}」吗？`
            )
        ) {
            return;
        }

        deleteTutuAuxPromptRecord(
            type,
            id
        );

        if (
            type === 'jailbreak' &&
            tutuSettings.activeJailbreakPromptId === id
        ) {
            tutuSettings.activeJailbreakPromptId = '';
        }

        if (
            type === 'style' &&
            tutuSettings.activeStylePromptId === id
        ) {
            tutuSettings.activeStylePromptId = '';
        }

        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify(tutuSettings)
        );

        clearTutuAuxPromptEditor();
        renderTutuAuxPromptManager();

        toastr.success('提示词已删除');
    }
);

$(document).on(
    'change',
    '#tutu_active_jailbreak_prompt, #tutu_active_style_prompt',
    function () {
        tutuSettings.activeJailbreakPromptId =
            String(
                $('#tutu_active_jailbreak_prompt').val() ||
                ''
            );

        tutuSettings.activeStylePromptId =
            String(
                $('#tutu_active_style_prompt').val() ||
                ''
            );

        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify(tutuSettings)
        );

        toastr.success('破限与文风设置已更新');
    }
);
    $(document).on('click', '#tutu_export_styles_btn', exportTutuStyles);

$(document).on('click', '#tutu_import_styles_btn', function () {
    $('#tutu_import_styles_file').val('').trigger('click');
});

$(document).on('change', '#tutu_import_styles_file', async function () {
    try {
        await importTutuStyles(this.files?.[0]);
        toastr.success('样式导入成功');
    } catch (error) {
        toastr.error(error.message || '样式导入失败');
    }
});
    $(document).on('change', '#tutu_quote_style_preset', function () {
    const id = $(this).val();
    const preset = tutuStyleLibrary.quote
        .find(item => item.id === id);

    $('#tutu_quote_style_name').val(preset?.name || '');
    $('#tutu_qe_custom_css').val(preset?.css || '');

    tutuSettings.stylePresetIds.quote = id;
    localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify(tutuSettings)
    );
});



    $(document).on(
    'change',
    '#tutu_ui_theme',
    function () {
        saveAndApplyTutuUiTheme(
            $(this).val()
        );
    }
);

$(document).on(
    'click',
    '.tutu-theme-preview',
    function () {
        const theme =
            String(
                $(this).attr('data-theme') ||
                'classic'
            );

        $('#tutu_ui_theme').val(theme);

        saveAndApplyTutuUiTheme(theme);
    }
);

$(document).on(
    'click',
    '#tutu_apply_custom_css_btn',
    function () {
        $('#tutu_ui_theme').val('custom');

        saveAndApplyTutuUiTheme('custom');

        toastr.success(
            '自定义界面 CSS 已应用'
        );
    }
);
/*
 * 保存或更新管理器自定义样式
 */
$(document).on(
    'click',
    '#tutu_save_manager_style_btn',
    function () {
        try {
            const record = saveTutuStylePreset(
                'manager',
                $('#tutu_manager_style_name').val(),
                $('#tutu_ui_custom_css').val(),
                $('#tutu_manager_style_preset').val()
            );

            tutuSettings.stylePresetIds.manager = record.id;
            tutuSettings.uiTheme = 'custom';
            tutuSettings.uiCustomCss = record.css;

            localStorage.setItem(
                SETTINGS_KEY,
                JSON.stringify(tutuSettings)
            );

            $('#tutu_ui_theme').val('custom');

            renderTutuStylePresetSelects();

            $('#tutu_manager_style_name').val(record.name);


            toastr.success(
                `管理器样式「${record.name}」已保存`
            );
        } catch (error) {
            toastr.warning(
                error.message || '保存管理器样式失败'
            );
        }
    }
);

/*
 * 删除当前选中的管理器样式
 */
$(document).on(
    'click',
    '#tutu_delete_manager_style_btn',
    function () {
        const id = String(
            $('#tutu_manager_style_preset').val() || ''
        );

        if (!id) {
            toastr.warning('请先选择要删除的管理器样式');
            return;
        }

        const preset = tutuStyleLibrary.manager.find(
            item => item.id === id
        );

        if (!preset) {
            toastr.error('找不到要删除的管理器样式');
            return;
        }

        if (
            !confirm(
                `确定删除管理器样式「${preset.name}」吗？`
            )
        ) {
            return;
        }

        deleteTutuStylePreset('manager', id);

        if (
            tutuSettings.stylePresetIds.manager === id
        ) {
            tutuSettings.stylePresetIds.manager = '';
            tutuSettings.uiCustomCss = '';
            tutuSettings.uiTheme = 'classic';
        }

        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify(tutuSettings)
        );

        $('#tutu_manager_style_name').val('');
        $('#tutu_ui_custom_css').val('');
        $('#tutu_ui_theme').val('classic');

        renderTutuStylePresetSelects();
        applyTutuUiTheme('classic', '');

        toastr.success(
            `管理器样式「${preset.name}」已删除`
        );
    }
);

/*
 * 选择已保存的管理器样式
 */
$(document).on(
    'change',
    '#tutu_manager_style_preset',
    function () {
        const id = String($(this).val() || '');

        const preset = tutuStyleLibrary.manager.find(
            item => item.id === id
        );

        $('#tutu_manager_style_name').val(
            preset?.name || ''
        );

        $('#tutu_ui_custom_css').val(
            preset?.css || ''
        );

        tutuSettings.stylePresetIds.manager = id;

        if (preset) {
            tutuSettings.uiTheme = 'custom';
            tutuSettings.uiCustomCss = preset.css;

            $('#tutu_ui_theme').val('custom');

            applyTutuUiTheme(
                'custom',
                preset.css
            );
        }

        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify(tutuSettings)
        );
    }
);





$(document).on(
    'click',
    '#tutu_reset_custom_css_btn',
    function () {
        $('#tutu_ui_custom_css').val('');

        tutuSettings.uiCustomCss = '';

        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify(tutuSettings)
        );

        installTutuCustomCss('');

        toastr.success(
            '自定义 CSS 已清空'
        );
    }
);

/*
 * 编辑 CSS 时实时预览，避免每次都点应用。
 */
let tutuCustomCssPreviewTimer = null;

$(document).on(
    'input',
    '#tutu_ui_custom_css',
    function () {
        if (
            $('#tutu_ui_theme').val() !==
            'custom'
        ) {
            return;
        }

        clearTimeout(
            tutuCustomCssPreviewTimer
        );

        tutuCustomCssPreviewTimer =
            setTimeout(() => {
                const css =
                    String(
                        $('#tutu_ui_custom_css')
                            .val() || ''
                    );

                installTutuCustomCss(css);

                tutuSettings.uiCustomCss = css;

                localStorage.setItem(
                    SETTINGS_KEY,
                    JSON.stringify(tutuSettings)
                );
            }, 250);
    }
);
    $(document).on(
    'input',
    '#tutu_capture_tag_name',
    function () {
        tutuSettings.captureTagName =
            $(this).val().trim();

        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify(tutuSettings)
        );
    }
);
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

$(document).on(
    'change',
    '#tutu_output_mode, #tutu_embed_default_state, #tutu_capture_tag_name',
    function () {
        tutuSettings.outputMode =
            $('#tutu_output_mode').val() || 'panel';

        tutuSettings.embedDefaultCollapsed =
            $('#tutu_embed_default_state').val() === 'collapsed';
tutuSettings.captureTagName =
    $('#tutu_capture_tag_name').val().trim();

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
        if (tutuBatchManageEnabled) {
            return;
        }

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
renderTutuImportCategorySelect();
updateTutuImportCategoryVisibility();

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
renderTutuImportCategorySelect();
updateTutuImportCategoryVisibility();

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

$('#tutu_import_selected_btn').on(
    'click',
    function () {
        const checkedBoxes =
            $('.tutu-import-checkbox:checked');

        if (!checkedBoxes.length) {
            toastr.warning(
                '请至少勾选一个要导入的条目！'
            );
            return;
        }

        const importTarget =
            String(
                $('#tutu_import_target').val() ||
                'scenario'
            );
const importCategory =
    String(
        $('#tutu_import_category').val() ||
        ''
    ).trim();

if (
    importTarget === 'scenario' &&
    !importCategory
) {
    toastr.warning('请选择要导入到的剧本分类');
    return;
}
        let importedCount = 0;
        let firstImportedId = '';

        checkedBoxes.each(function () {
            const index =
                Number($(this).val());

            const item =
                window.tutuTempNativePrompts?.[index];

            if (!item) {
                return;
            }

            const name =
                String(
                    item.name ||
                    `导入条目 ${index + 1}`
                ).trim();

            const content =
                String(
                    item.prompt ||
                    item.content ||
                    item.value ||
                    ''
                ).trim();

            if (!content) {
                return;
            }

            /*
             * 导入为普通剧本
             */
if (importTarget === 'scenario') {
    tutuScenarios.push({
        name,
        desc: '从系统预设或世界书导入',
        category: importCategory,
        prompt: content,
    });

    if (
        !tutuCategories.includes(
            importCategory
        )
    ) {
        tutuCategories.push(
            importCategory
        );
    }

    importedCount++;
    return;
}

            /*
             * 导入为破限或文风
             */
            if (
                importTarget === 'jailbreak' ||
                importTarget === 'style'
            ) {
                const record =
                    saveTutuAuxPromptRecord(
                        importTarget,
                        name,
                        content
                    );

                if (!firstImportedId) {
                    firstImportedId = record.id;
                }

                importedCount++;
            }
        });

        if (!importedCount) {
            toastr.warning(
                '所选条目没有可导入的正文'
            );
            return;
        }
if (importTarget === 'scenario') {
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(tutuScenarios)
    );

    tutuExpandedCategories.add(
        importCategory
    );

    saveTutuExpandedCategories();
            saveTutuCategories();

            renderLibrary();
            renderTutuCategorySelects();

            switchTutuTab(
                'tutu_tab_library'
            );

            toastr.success(
                `成功导入 ${importedCount} 个剧本`
            );

            return;
        }

        /*
         * 导入提示词后，第一个自动设为当前启用项。
         */
        if (
            importTarget === 'jailbreak' &&
            firstImportedId
        ) {
            tutuSettings.activeJailbreakPromptId =
                firstImportedId;
        }

        if (
            importTarget === 'style' &&
            firstImportedId
        ) {
            tutuSettings.activeStylePromptId =
                firstImportedId;
        }

        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify(tutuSettings)
        );

        renderTutuAuxPromptManager();

        const label =
            getTutuAuxPromptTypeLabel(
                importTarget
            );

        toastr.success(
            `成功导入 ${importedCount} 个${label}提示词`
        );

        switchTutuTab(
            'tutu_tab_settings'
        );
    }
);

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

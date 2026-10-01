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
        scriptName: REGEX_SCRIPT_NAME,

        /*
         * 删除发送给 AI 的 prompt 中的小剧场内容。
         */
        findRegex:
            '<!--\\s*TUTU_THEATER_START\\s*-->[\\s\\S]*?<!--\\s*TUTU_THEATER_END\\s*-->',

        replaceString: '',

        trimStrings: [],

        /*
         * AI 输出。
         */
        placement: [
            regex_placement?.AI_OUTPUT ?? 1,
        ],

        disabled: false,

        markdownOnly: false,

        /*
         * 只处理发送给 AI 的 prompt，
         * 不删除聊天页面显示内容。
         */
        promptOnly: true,

        runOnEdit: true,

        substituteRegex: false,

        minDepth: null,
        maxDepth: null,
    };

    try {
        /*
         * 使用 SillyTavern 正则扩展真实使用的设置对象。
         */
        if (!extension_settings.regex) {
            extension_settings.regex = {};
        }

        const regexSettings = extension_settings.regex;

        /*
         * 关键：
         * SillyTavern 正则扩展页面读取的是 scripts，
         * 不是 global_scripts。
         */
        if (!Array.isArray(regexSettings.scripts)) {
            regexSettings.scripts = [];
        }

        /*
         * 如果之前已经错误写入了 global_scripts，
         * 删除旧的错误字段，避免产生两套数据。
         */
        if (Array.isArray(regexSettings.global_scripts)) {
            regexSettings.global_scripts =
                regexSettings.global_scripts.filter(script => {
                    return script?.scriptName !== REGEX_SCRIPT_NAME;
                });

            /*
             * 如果 global_scripts 清空了，可以删除这个错误字段。
             */
            if (regexSettings.global_scripts.length === 0) {
                delete regexSettings.global_scripts;
            }
        }

        /*
         * 查找 scripts 中是否已有同名正则。
         */
        const existingIndex =
            regexSettings.scripts.findIndex(script => {
                return script?.scriptName === REGEX_SCRIPT_NAME;
            });

        if (existingIndex >= 0) {
            /*
             * 已存在则更新。
             */
            regexSettings.scripts[existingIndex] = {
                ...regexSettings.scripts[existingIndex],
                ...tutuRegexScript,
            };

            console.log(
                '[兔兔小剧场] 全局正则已存在，已更新 scripts 中的配置'
            );
        } else {
            /*
             * 不存在则写入 scripts。
             */
            regexSettings.scripts.push(tutuRegexScript);

            console.log(
                '[兔兔小剧场] 已注入 extension_settings.regex.scripts'
            );
        }

        /*
         * 调试用：把实际数据暴露到 window。
         */
        window.tutuRegexDebug =
            extension_settings.regex.scripts;

        /*
         * 使用 SillyTavern 正确的保存函数。
         */
        if (typeof saveSettingsDebounced === 'function') {
            saveSettingsDebounced();

            console.log(
                '[兔兔小剧场] 已调用 saveSettingsDebounced()'
            );
        } else {
            console.warn(
                '[兔兔小剧场] 找不到 saveSettingsDebounced()'
            );
        }

        console.log(
            '[兔兔小剧场] 当前 scripts：',
            extension_settings.regex.scripts
        );

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
function saveTutuTheaterContent(mesIndex, content) {
    const stored = loadLocalJson(THEATER_CONTENT_KEY, {});
    const context = SillyTavern.getContext();
    const chatId = context.chatId || context.chat_metadata?.chat_id || 'default';
    const key = `${chatId}::${mesIndex}`;
    stored[key] = content;

    // 限制存储大小，最多保留最近 50 条
    const keys = Object.keys(stored);
    if (keys.length > 50) {
        keys.slice(0, keys.length - 50).forEach(k => delete stored[k]);
    }

    localStorage.setItem(THEATER_CONTENT_KEY, JSON.stringify(stored));
}

function getTutuStoredTheaterContent(mesIndex) {
    const stored = loadLocalJson(THEATER_CONTENT_KEY, {});
    const context = SillyTavern.getContext();
    const chatId = context.chatId || context.chat_metadata?.chat_id || 'default';
    const key = `${chatId}::${mesIndex}`;
    return stored[key] || '';
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

function showTutuResult(content) {
    content = String(content || '');

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

async function embedTutuTheaterToChat(content) {
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

    // 先移除旧的小剧场内容
    let originalMes = stripTutuTheaterFromMessage(message.mes);

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
            // 找不到 DOM，尝试重新加载聊天
            await context.reloadCurrentChat?.();
            // 保存小剧场内容，以便切换聊天后恢复
saveTutuTheaterContent(lastAiIndex, content);
            // reload 之后再找一次
            appendTheaterToDOM(lastAiIndex, content);
            return;
        }
// 保存小剧场内容，以便切换聊天后恢复
saveTutuTheaterContent(lastAiIndex, content);

        appendTheaterToDOM(lastAiIndex, content);

        toastr.success('小剧场已嵌入聊天楼层', '兔兔小剧场');
    } catch (error) {
        console.error('嵌入小剧场到聊天失败：', error);
        toastr.error('嵌入失败：' + (error.message || error));
    }
}

/**
 * 在指定消息的 DOM 中追加小剧场 HTML
 */
function appendTheaterToDOM(mesId, content) {
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

    // 构建小剧场 HTML 元素
    const theaterHtml = `
<div class="tutu-theater-embed">
    <div class="tutu-theater-embed-header">
        <span>🐰 兔兔小剧场</span>
    </div>
    <div class="tutu-theater-embed-body">${content}</div>
</div>`;

    // 追加到 .mes_text 的末尾
    $mesText.append(theaterHtml);
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
            // 嵌入到聊天楼层
            await embedTutuTheaterToChat(result);

            // 同时在面板中也显示一份（方便查看）
            showTutuResult(result);

            $('#tutu_result_status').text(
                '✅ 已嵌入到最新 AI 回复楼层底部'
            );
        } else {
            // 外置面板预览
            showTutuResult(result);
        }

        if (isAutomatic) {
            if (outputMode === 'embed') {
                toastr.success(
                    '已将小剧场嵌入最新 AI 回复',
                    '兔兔小剧场'
                );
            } else {
                toastr.success(
                    '已根据最新 AI 回复生成小剧场',
                    '兔兔小剧场'
                );
            }
        }


    } catch (error) {
        console.error(
            '小剧场生成失败：',
            error
        );

        $('#tutu_result_status')
            .text('❌ 生成失败');

        $('#tutu_result_preview').html(`
            <div class="tutu-result-placeholder" style="color:red;">
                ❌ 生成失败：
                ${escapeHtml(error.message || error)}
            </div>
        `);

        if (!isAutomatic) {
            toastr.error(
                error.message || '生成失败，请检查 API 配置'
            );
        }

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

                if (
                    !tutuSettings.autoGenerateEnabled
                ) {
                    return;
                }

                const context =
                    SillyTavern.getContext();

                const chat = Array.isArray(context.chat)
                    ? context.chat
                    : [];

                const latestMessage =
                    chat[chat.length - 1];

                if (!latestMessage) {
                    return;
                }

                // 如果最后一条是用户消息，不触发
                if (latestMessage.is_user) {
                    return;
                }

                const messageKey =
                    getTutuLatestMessageKey();

                // 防止同一条 AI 消息重复触发
                if (
                    messageKey &&
                    messageKey ===
                        tutuLastAutoMessageKey
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
            // 延迟一点执行，等 DOM 渲染完成
            setTimeout(() => restoreAllTutuTheaterEmbeds(), 300);
        });
    });
}

function restoreAllTutuTheaterEmbeds() {
    const context = SillyTavern.getContext();
    const chat = Array.isArray(context.chat) ? context.chat : [];

    chat.forEach((message, index) => {
        if (!message || message.is_user) return;

        const mes = String(message.mes || '');

        // 检查消息中是否有小剧场标记
        if (!mes.includes(TUTU_THEATER_START)) return;

        const $messageBlock = $(`.mes[mesid="${index}"]`);
        if (!$messageBlock.length) return;

        const $mesText = $messageBlock.find('.mes_text');
        if (!$mesText.length) return;

        // 如果 DOM 中已经有小剧场，跳过
        if ($mesText.find('.tutu-theater-embed').length) return;

        // 从 localStorage 或其他地方恢复内容
        // 这里我们需要一个存储机制
        const storedContent = getTutuStoredTheaterContent(index);
        if (storedContent) {
            appendTheaterToDOM(index, storedContent);
        }
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
            throw new Error(
                `拉取模型失败：HTTP ${response.status}\n${responseText}`
            );
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
        throw new Error(
            `副 API 请求失败：HTTP ${response.status}\n${responseText}`
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

        // ★ 新增
        outputMode:
            $('#tutu_output_mode').val() || 'panel',
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

    updateSecondaryApiVisibility();
    renderApiPresetDropdown();
    updateAutoGenerateStatus();
    renderTutuCategorySelects();
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
    // 输出方式切换
$(document).on('change', '#tutu_output_mode', function () {
    tutuSettings.outputMode = $(this).val() || 'panel';

    localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify(tutuSettings)
    );
});

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

    // 打开或关闭历史聊天记录读取选项
$(document).on('change', '#tutu_include_history', function () {
    if ($(this).is(':checked')) {
        $('#tutu_history_limit_box').show();
    } else {
        $('#tutu_history_limit_box').hide();
    }
});

loadTutuSettingsToUI();
renderTutuCategorySelects();
renderLibrary();

initTutuAutoGenerationListener();

/*
 * 等待 SillyTavern 设置加载完成后注入全局正则。
 */
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
    $(document).on('click', function() { injectTutuButton(); });
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

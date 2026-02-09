// ==UserScript==
// @name         Web PDF Compiler
// @namespace    http://tampermonkey.net/
// @version      3.4.0
// @description  Scan webpages and compile multiple pages into a single PDF document with inter-page persistence
// @author       You
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @require      https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'wpc_projects';
    const ACTIVE_PROJECT_KEY = 'wpc_active_project';
    const PANEL_STATE_KEY = 'wpc_panel_state';
    const SETTINGS_KEY = 'wpc_settings';
    const { jsPDF } = window.jspdf;

    const DEFAULT_SETTINGS = {
        paperSize: 'a4',
        margins: 20,
        captureScale: 2,
        imageQuality: 0.92,
        pdfImageQuality: 0.92,
        compressMaxWidth: 2400,
        includeHeaders: true,
        includePageNumbers: true,
        includeTOC: true,
        includeCoverPage: false,
        coverAuthor: '',
        watermarkText: '',
        overlapPx: 30,
        pageBreakSeparator: true,
    };

    const PAPER_SIZES = {
        a4:     { w: 210, h: 297, label: 'A4 (210x297mm)' },
        letter: { w: 215.9, h: 279.4, label: 'Letter (8.5x11in)' },
        legal:  { w: 215.9, h: 355.6, label: 'Legal (8.5x14in)' },
    };

    function loadSettings() {
        try {
            const raw = GM_getValue(SETTINGS_KEY, '{}');
            const saved = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return { ...DEFAULT_SETTINGS, ...saved };
        } catch (e) { return { ...DEFAULT_SETTINGS }; }
    }

    function saveSettings(s) { GM_setValue(SETTINGS_KEY, JSON.stringify(s)); }

    function loadProjects() {
        try {
            const raw = GM_getValue(STORAGE_KEY, '{}');
            return typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch (e) { return {}; }
    }

    function saveProjects(p) { GM_setValue(STORAGE_KEY, JSON.stringify(p)); }
    function getActiveProjectId() { return GM_getValue(ACTIVE_PROJECT_KEY, null); }
    function setActiveProjectId(id) { GM_setValue(ACTIVE_PROJECT_KEY, id); }
    function uid() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9); }
    function truncate(str, len) { len = len || 50; if (!str) return ''; return str.length > len ? str.slice(0, len) + '...' : str; }
    function fmtDate(ts) { return new Date(ts).toLocaleString(); }

    function compressImage(dataUrl, maxWidth, quality) {
        maxWidth = maxWidth || 2400;
        quality = quality || 0.92;
        return new Promise(function (resolve) {
            var img = new Image();
            img.onload = function () {
                var w = img.width, h = img.height;
                if (w <= maxWidth) { img.src = ''; resolve(dataUrl); return; }
                var ratio = maxWidth / w;
                w = maxWidth;
                h = Math.round(h * ratio);
                var cvs = document.createElement('canvas');
                cvs.width = w; cvs.height = h;
                var ctx = cvs.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                var result = cvs.toDataURL('image/jpeg', quality);
                // Release memory
                cvs.width = 0; cvs.height = 0;
                img.src = '';
                resolve(result);
            };
            img.onerror = function () { img.src = ''; resolve(dataUrl); };
            img.src = dataUrl;
        });
    }

    GM_addStyle([
        '#wpc-panel{position:fixed;top:10px;right:10px;width:380px;max-height:90vh;background:#1e1e2e;color:#cdd6f4;border:1px solid #45475a;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.45);font-family:"Segoe UI",system-ui,-apple-system,sans-serif;font-size:13px;z-index:2147483647;display:flex;flex-direction:column;overflow:hidden;transition:opacity .2s,transform .2s}',
        '#wpc-panel.wpc-hidden{opacity:0;pointer-events:none;transform:translateX(20px)}',
        '#wpc-header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#181825;border-bottom:1px solid #313244;cursor:move;user-select:none}',
        '#wpc-header .wpc-title{font-weight:700;font-size:14px;color:#cba6f7;display:flex;align-items:center;gap:6px}',
        '#wpc-header .wpc-title svg{width:18px;height:18px}',
        '#wpc-header .wpc-btns{display:flex;gap:6px}',
        '#wpc-header .wpc-btns button{background:none;border:none;color:#a6adc8;cursor:pointer;padding:2px;border-radius:4px;display:flex;align-items:center}',
        '#wpc-header .wpc-btns button:hover{color:#cdd6f4;background:#313244}',
        '#wpc-body{flex:1 1 auto;overflow-y:auto;padding:10px 14px}',
        '#wpc-body::-webkit-scrollbar{width:6px}',
        '#wpc-body::-webkit-scrollbar-track{background:transparent}',
        '#wpc-body::-webkit-scrollbar-thumb{background:#45475a;border-radius:3px}',
        '.wpc-section-title{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:#a6adc8;margin:12px 0 6px 0}',
        '.wpc-section-title:first-child{margin-top:0}',
        '#wpc-project-bar{display:flex;gap:6px;align-items:center}',
        '#wpc-project-select{flex:1;background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:6px;padding:5px 8px;font-size:13px;outline:none}',
        '#wpc-project-select:focus{border-color:#cba6f7}',
        '.wpc-btn{display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;transition:background .15s,transform .1s;color:#1e1e2e}',
        '.wpc-btn:active{transform:scale(.96)}',
        '.wpc-btn-primary{background:#cba6f7}.wpc-btn-primary:hover{background:#b4befe}',
        '.wpc-btn-success{background:#a6e3a1}.wpc-btn-success:hover{background:#94e2d5}',
        '.wpc-btn-danger{background:#f38ba8}.wpc-btn-danger:hover{background:#eba0ac}',
        '.wpc-btn-secondary{background:#585b70;color:#cdd6f4}.wpc-btn-secondary:hover{background:#6c7086}',
        '.wpc-btn-sm{padding:3px 7px;font-size:11px}',
        '.wpc-btn-icon{background:none;border:none;color:#a6adc8;cursor:pointer;padding:2px;border-radius:4px;display:flex;align-items:center}',
        '.wpc-btn-icon svg{width:16px;height:16px}',
        '.wpc-btn-icon:hover{color:#f38ba8;background:#31324466}',
        '.wpc-btn svg{width:14px;height:14px}',
        '#wpc-header .wpc-btns button svg{width:16px;height:16px}',
        '.wpc-btn-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}',
        '.wpc-page-item{display:flex;align-items:center;gap:8px;padding:6px 8px;background:#313244;border-radius:8px;margin-bottom:6px;transition:background .15s}',
        '.wpc-page-item:hover{background:#45475a}',
        '.wpc-page-item .wpc-page-thumb{width:48px;height:36px;border-radius:4px;object-fit:cover;background:#181825;flex-shrink:0}',
        '.wpc-page-item .wpc-page-info{flex:1;min-width:0}',
        '.wpc-page-item .wpc-page-info .wpc-page-name{font-weight:600;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.wpc-page-item .wpc-page-info .wpc-page-url{font-size:10px;color:#a6adc8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.wpc-page-item .wpc-page-actions{display:flex;gap:3px;flex-shrink:0}',
        '.wpc-page-item .wpc-page-actions button{background:#45475a;border:none;cursor:pointer;padding:4px;border-radius:5px;color:#a6adc8;display:flex;align-items:center;justify-content:center;min-width:24px;min-height:24px}',
        '.wpc-page-item .wpc-page-actions button svg{width:14px;height:14px}',
        '.wpc-page-item .wpc-page-actions button:hover{color:#cdd6f4;background:#585b70}',
        '.wpc-page-item .wpc-page-actions button.wpc-page-edit:hover{color:#cba6f7;background:#45475a}',
        '.wpc-page-item .wpc-page-actions button.wpc-page-delete:hover{color:#f38ba8;background:#45475a}',
        '.wpc-empty{text-align:center;color:#6c7086;padding:20px 0;font-style:italic}',
        '.wpc-toast{position:fixed;bottom:20px;right:20px;background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:8px;padding:10px 18px;font-family:"Segoe UI",system-ui,sans-serif;font-size:13px;z-index:2147483647;box-shadow:0 4px 16px rgba(0,0,0,.35);animation:wpc-slide-in .25s ease-out}',
        '@keyframes wpc-slide-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}',
        '#wpc-toggle-btn{position:fixed;bottom:20px;right:20px;width:48px;height:48px;border-radius:50%;background:#cba6f7;color:#1e1e2e;border:none;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:2147483647;transition:background .15s,transform .15s}',
        '#wpc-toggle-btn:hover{background:#b4befe;transform:scale(1.08)}',
        '#wpc-toggle-btn svg{width:22px;height:22px}',
        '#wpc-toggle-btn .wpc-badge{position:absolute;top:-4px;right:-4px;background:#f38ba8;color:#1e1e2e;font-size:10px;font-weight:700;border-radius:10px;min-width:18px;height:18px;display:flex;align-items:center;justify-content:center;padding:0 4px;font-family:"Segoe UI",system-ui,sans-serif}',
        '#wpc-capture-overlay{position:fixed;inset:0;background:rgba(203,166,247,.12);z-index:2147483646;pointer-events:none;animation:wpc-flash .4s ease-out forwards}',
        '@keyframes wpc-flash{0%{opacity:1}100%{opacity:0}}',
        '.wpc-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483647;display:flex;align-items:center;justify-content:center}',
        '.wpc-modal{background:#1e1e2e;border:1px solid #45475a;border-radius:12px;padding:20px;min-width:340px;max-width:480px;max-height:80vh;overflow-y:auto;color:#cdd6f4;font-family:"Segoe UI",system-ui,sans-serif}',
        '.wpc-modal h3{margin:0 0 14px 0;color:#cba6f7;font-size:16px}',
        '.wpc-modal input[type="text"],.wpc-modal input[type="number"],.wpc-modal select{width:100%;padding:7px 10px;border:1px solid #45475a;border-radius:6px;background:#313244;color:#cdd6f4;font-size:13px;outline:none;margin-bottom:10px;box-sizing:border-box}',
        '.wpc-modal input:focus,.wpc-modal select:focus{border-color:#cba6f7}',
        '.wpc-modal label{display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:#a6adc8}',
        '.wpc-modal .wpc-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}',
        '.wpc-modal .wpc-chk{display:flex;align-items:center;gap:8px;margin-bottom:8px}',
        '.wpc-modal .wpc-chk input[type="checkbox"]{accent-color:#cba6f7;width:16px;height:16px;cursor:pointer}',
        '.wpc-modal .wpc-chk label{margin:0;cursor:pointer;font-size:13px;color:#cdd6f4}',
        '.wpc-modal .wpc-sg{border-top:1px solid #313244;padding-top:10px;margin-top:10px}',
        '.wpc-modal .wpc-sgt{font-size:12px;font-weight:700;color:#cba6f7;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px}',
        '.wpc-modal .wpc-sr{display:flex;gap:10px;margin-bottom:8px}',
        '.wpc-modal .wpc-sr>div{flex:1}',
        '.wpc-progress-bar{height:6px;background:#313244;border-radius:3px;overflow:hidden;margin:10px 0}',
        '.wpc-progress-bar .wpc-progress-fill{height:100%;background:#cba6f7;border-radius:3px;transition:width .3s}',
        '.wpc-drag-handle{cursor:grab;color:#585b70;display:flex;align-items:center}',
        '.wpc-drag-handle svg{width:16px;height:16px}',
        '.wpc-drag-handle:active{cursor:grabbing}',
        '.wpc-capture-options{display:flex;gap:6px;margin-top:6px}',
        '.wpc-capture-opt{flex:1;text-align:center;padding:8px;background:#313244;border:2px solid transparent;border-radius:8px;cursor:pointer;transition:border-color .15s,background .15s}',
        '.wpc-capture-opt:hover{background:#45475a}',
        '.wpc-capture-opt.active{border-color:#cba6f7;background:#45475a}',
        '.wpc-capture-opt svg{width:24px;height:24px;margin-bottom:4px}',
        '.wpc-capture-opt span{display:block;font-size:11px;font-weight:600}',
        '.wpc-page-item[draggable="true"]{transition:background .15s,opacity .15s,transform .15s}',
        '.wpc-page-item.wpc-dragging{opacity:.4;transform:scale(.96)}',
        '.wpc-page-item.wpc-drag-over{border-top:2px solid #cba6f7;margin-top:-2px}',
        '.wpc-page-item .wpc-page-thumb{cursor:pointer;transition:opacity .15s}',
        '.wpc-page-item .wpc-page-thumb:hover{opacity:.75}',
        '.wpc-preview-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:2147483647;display:flex;align-items:center;justify-content:center;cursor:zoom-out}',
        '.wpc-preview-backdrop img{max-width:92vw;max-height:90vh;border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,.6);object-fit:contain}',
        '.wpc-preview-title{position:fixed;top:12px;left:50%;transform:translateX(-50%);color:#cdd6f4;font-family:"Segoe UI",system-ui,sans-serif;font-size:14px;font-weight:600;background:rgba(30,30,46,.85);padding:6px 16px;border-radius:8px;z-index:2147483647;max-width:80vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.wpc-preview-close{position:fixed;top:12px;right:16px;background:rgba(30,30,46,.85);border:none;color:#cdd6f4;font-size:24px;cursor:pointer;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;z-index:2147483647;transition:background .15s}',
        '.wpc-preview-close:hover{background:rgba(243,139,168,.3);color:#f38ba8}',
        '.wpc-timer-row{display:flex;gap:4px;align-items:center;margin-top:6px}',
        '.wpc-timer-row span{font-size:11px;color:#a6adc8;margin-right:2px}',
        '.wpc-timer-pill{padding:3px 8px;font-size:11px;font-weight:600;background:#313244;color:#a6adc8;border:1.5px solid transparent;border-radius:12px;cursor:pointer;transition:border-color .15s,background .15s}',
        '.wpc-timer-pill:hover{background:#45475a}',
        '.wpc-timer-pill.active{border-color:#a6e3a1;color:#a6e3a1;background:#45475a}',
        '.wpc-countdown-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483646;display:flex;align-items:center;justify-content:center;pointer-events:none}',
        '.wpc-countdown-num{font-size:120px;font-weight:800;color:#cba6f7;font-family:"Segoe UI",system-ui,sans-serif;text-shadow:0 4px 24px rgba(203,166,247,.4);animation:wpc-pulse .8s ease-in-out infinite}',
        '@keyframes wpc-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.15);opacity:.7}}',
    ].join('\n'));

    var ICONS = {
        pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
        camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
        x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        minimize: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
        plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
        trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
        arrowUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>',
        arrowDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
        download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
        grip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></svg>',
        edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
        fullpage: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>',
        visible: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
        settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
        upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    };

    // Toggle button
    var toggleBtn = document.createElement('button');
    toggleBtn.id = 'wpc-toggle-btn';
    toggleBtn.innerHTML = ICONS.pdf;
    document.body.appendChild(toggleBtn);

    // Main panel
    var panel = document.createElement('div');
    panel.id = 'wpc-panel';
    panel.classList.add('wpc-hidden');
    panel.innerHTML = '<div id="wpc-header">' +
        '<div class="wpc-title">' + ICONS.pdf + ' Web PDF Compiler</div>' +
        '<div class="wpc-btns">' +
        '<button id="wpc-btn-settings" title="Settings">' + ICONS.settings + '</button>' +
        '<button id="wpc-btn-minimize" title="Minimize">' + ICONS.minimize + '</button>' +
        '<button id="wpc-btn-close" title="Close">' + ICONS.x + '</button>' +
        '</div></div>' +
        '<div id="wpc-body">' +
        '<div class="wpc-section-title">Project</div>' +
        '<div id="wpc-project-bar">' +
        '<select id="wpc-project-select"></select>' +
        '<button class="wpc-btn wpc-btn-primary wpc-btn-sm" id="wpc-btn-new-project" title="New Project">' + ICONS.plus + '</button>' +
        '<button class="wpc-btn-icon" id="wpc-btn-edit-project" title="Rename Project">' + ICONS.edit + '</button>' +
        '<button class="wpc-btn-icon" id="wpc-btn-delete-project" title="Delete Project">' + ICONS.trash + '</button>' +
        '</div>' +
        '<div class="wpc-btn-row" style="margin-top:4px">' +
        '<button class="wpc-btn wpc-btn-secondary wpc-btn-sm" id="wpc-btn-export-project">' + ICONS.download + ' Export</button>' +
        '<button class="wpc-btn wpc-btn-secondary wpc-btn-sm" id="wpc-btn-import-project">' + ICONS.upload + ' Import</button>' +
        '<button class="wpc-btn wpc-btn-secondary wpc-btn-sm" id="wpc-btn-clone-project">' + ICONS.plus + ' Clone</button>' +
        '</div>' +
        '<div class="wpc-section-title">Capture This Page</div>' +
        '<div class="wpc-capture-options">' +
        '<div class="wpc-capture-opt active" data-mode="visible">' + ICONS.visible + '<span>Visible Area</span></div>' +
        '<div class="wpc-capture-opt" data-mode="fullpage">' + ICONS.fullpage + '<span>Full Page</span></div>' +
        '</div>' +
        '<div class="wpc-timer-row">' +
        '<span>Timer:</span>' +
        '<div class="wpc-timer-pill active" data-delay="0">None</div>' +
        '<div class="wpc-timer-pill" data-delay="3">3s</div>' +
        '<div class="wpc-timer-pill" data-delay="5">5s</div>' +
        '<div class="wpc-timer-pill" data-delay="10">10s</div>' +
        '</div>' +
        '<div class="wpc-btn-row">' +
        '<button class="wpc-btn wpc-btn-success" id="wpc-btn-capture">' + ICONS.camera + ' Capture Page</button>' +
        '</div>' +
        '<div class="wpc-section-title">Pages (<span id="wpc-page-count">0</span>)</div>' +
        '<div id="wpc-page-list"></div>' +
        '<div class="wpc-section-title">Compile PDF</div>' +
        '<div id="wpc-compile-section">' +
        '<div class="wpc-btn-row">' +
        '<button class="wpc-btn wpc-btn-primary" id="wpc-btn-compile">' + ICONS.download + ' Compile &amp; Download PDF</button>' +
        '</div>' +
        '<div id="wpc-progress-container" style="display:none;">' +
        '<div class="wpc-progress-bar"><div class="wpc-progress-fill" id="wpc-progress-fill" style="width:0%"></div></div>' +
        '<div id="wpc-progress-text" style="font-size:11px;color:#a6adc8;text-align:center;"></div>' +
        '</div></div></div>';
    document.body.appendChild(panel);

    var projectSelect = panel.querySelector('#wpc-project-select');
    var pageList = panel.querySelector('#wpc-page-list');
    var pageCountEl = panel.querySelector('#wpc-page-count');
    var progressContainer = panel.querySelector('#wpc-progress-container');
    var progressFill = panel.querySelector('#wpc-progress-fill');
    var progressText = panel.querySelector('#wpc-progress-text');
    var captureMode = 'visible';
    var captureDelay = 0;
    var isCapturing = false;
    var dragSrcIdx = null;

    function showPanel() { panel.classList.remove('wpc-hidden'); GM_setValue(PANEL_STATE_KEY, 'open'); }
    function hidePanel() { panel.classList.add('wpc-hidden'); GM_setValue(PANEL_STATE_KEY, 'closed'); }

    toggleBtn.addEventListener('click', function () {
        if (panel.classList.contains('wpc-hidden')) showPanel(); else hidePanel();
    });
    panel.querySelector('#wpc-btn-minimize').addEventListener('click', hidePanel);
    panel.querySelector('#wpc-btn-close').addEventListener('click', hidePanel);

    // Dragging
    (function () {
        var header = panel.querySelector('#wpc-header');
        var isDragging = false, startX, startY, origX, origY;
        header.addEventListener('mousedown', function (e) {
            if (e.target.closest('button')) return;
            isDragging = true;
            var rect = panel.getBoundingClientRect();
            startX = e.clientX; startY = e.clientY;
            origX = rect.left; origY = rect.top;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
        function onMove(e) {
            if (!isDragging) return;
            panel.style.left = (origX + e.clientX - startX) + 'px';
            panel.style.top = (origY + e.clientY - startY) + 'px';
            panel.style.right = 'auto';
        }
        function onUp() {
            isDragging = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        }
    })();

    // Clamp panel position within viewport on window resize
    function clampPanelPosition() {
        if (!panel.style.left || panel.classList.contains('wpc-hidden')) return;
        var rect = panel.getBoundingClientRect();
        var vw = window.innerWidth;
        var vh = window.innerHeight;
        var newLeft = parseFloat(panel.style.left);
        var newTop = parseFloat(panel.style.top);
        // Ensure at least 40px of the panel header stays visible
        var minVisible = 40;
        if (rect.right < minVisible) newLeft = minVisible - rect.width;
        if (rect.left > vw - minVisible) newLeft = vw - minVisible;
        if (rect.top < 0) newTop = 0;
        if (rect.top > vh - minVisible) newTop = vh - minVisible;
        panel.style.left = newLeft + 'px';
        panel.style.top = newTop + 'px';
    }
    window.addEventListener('resize', clampPanelPosition);

    function toast(msg, duration) {
        duration = duration || 2500;
        var t = document.createElement('div');
        t.className = 'wpc-toast'; t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(function () {
            t.style.transition = 'opacity .3s'; t.style.opacity = '0';
            setTimeout(function () { t.remove(); }, 300);
        }, duration);
    }

    function showPreview(imageData, title) {
        var backdrop = document.createElement('div');
        backdrop.className = 'wpc-preview-backdrop';
        var titleBar = document.createElement('div');
        titleBar.className = 'wpc-preview-title';
        titleBar.textContent = title;
        var closeBtn = document.createElement('button');
        closeBtn.className = 'wpc-preview-close';
        closeBtn.innerHTML = ICONS.x;
        var img = document.createElement('img');
        img.src = imageData;
        img.alt = title;
        backdrop.appendChild(img);
        document.body.appendChild(backdrop);
        document.body.appendChild(titleBar);
        document.body.appendChild(closeBtn);
        function close() { backdrop.remove(); titleBar.remove(); closeBtn.remove(); }
        backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });
        closeBtn.addEventListener('click', close);
        document.addEventListener('keydown', function handler(e) {
            if (e.key === 'Escape') { close(); document.removeEventListener('keydown', handler); }
        });
    }

    function showModal(opts) {
        var backdrop = document.createElement('div');
        backdrop.className = 'wpc-modal-backdrop';
        var modal = document.createElement('div');
        modal.className = 'wpc-modal';
        var html = '<h3>' + opts.title + '</h3>';
        if (opts.bodyHtml) {
            html += opts.bodyHtml;
        } else if (opts.fields) {
            opts.fields.forEach(function (f) {
                html += '<label>' + f.label + '</label>';
                if (f.type === 'text') {
                    html += '<input type="text" id="wpc-modal-' + f.id + '" value="' + (f.value || '') + '" placeholder="' + (f.placeholder || '') + '">';
                } else if (f.type === 'number') {
                    html += '<input type="number" id="wpc-modal-' + f.id + '" value="' + (f.value || '') + '" min="' + (f.min || '') + '" max="' + (f.max || '') + '">';
                } else if (f.type === 'select') {
                    html += '<select id="wpc-modal-' + f.id + '">';
                    f.options.forEach(function (o) {
                        html += '<option value="' + o.value + '"' + (o.selected ? ' selected' : '') + '>' + o.label + '</option>';
                    });
                    html += '</select>';
                }
            });
        }
        html += '<div class="wpc-modal-actions">' +
            '<button class="wpc-btn wpc-btn-secondary wpc-btn-sm" id="wpc-modal-cancel">Cancel</button>' +
            '<button class="wpc-btn wpc-btn-primary wpc-btn-sm" id="wpc-modal-confirm">OK</button></div>';
        modal.innerHTML = html;
        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);

        function close() { backdrop.remove(); }
        backdrop.querySelector('#wpc-modal-cancel').addEventListener('click', close);
        backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });
        backdrop.querySelector('#wpc-modal-confirm').addEventListener('click', function () {
            if (opts.fields) {
                var values = {};
                opts.fields.forEach(function (f) { values[f.id] = backdrop.querySelector('#wpc-modal-' + f.id).value; });
                close();
                opts.onConfirm(values);
            } else {
                close();
                opts.onConfirm(modal);
            }
        });
        var firstInput = modal.querySelector('input, select');
        if (firstInput) setTimeout(function () { firstInput.focus(); }, 50);
        modal.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') backdrop.querySelector('#wpc-modal-confirm').click();
            else if (e.key === 'Escape') close();
        });
        return { backdrop: backdrop, modal: modal, close: close };
    }

    // Settings modal
    function showSettingsModal() {
        var s = loadSettings();
        var paperOpts = '';
        Object.keys(PAPER_SIZES).forEach(function (k) {
            paperOpts += '<option value="' + k + '"' + (s.paperSize === k ? ' selected' : '') + '>' + PAPER_SIZES[k].label + '</option>';
        });
        var bh = '<div class="wpc-sg"><div class="wpc-sgt">Paper &amp; Layout</div>' +
            '<label>Paper Size</label><select id="wpc-s-paperSize">' + paperOpts + '</select>' +
            '<div class="wpc-sr"><div><label>Margins (px)</label><input type="number" id="wpc-s-margins" value="' + s.margins + '" min="0" max="80"></div>' +
            '<div><label>Segment Overlap (px)</label><input type="number" id="wpc-s-overlapPx" value="' + s.overlapPx + '" min="0" max="100"></div></div></div>' +
            '<div class="wpc-sg"><div class="wpc-sgt">Capture Quality</div>' +
            '<div class="wpc-sr"><div><label>Capture Scale (1-3)</label><input type="number" id="wpc-s-captureScale" value="' + s.captureScale + '" min="1" max="3" step="0.5"></div>' +
            '<div><label>Image Quality (0.5-1)</label><input type="number" id="wpc-s-imageQuality" value="' + s.imageQuality + '" min="0.5" max="1" step="0.05"></div></div>' +
            '<div class="wpc-sr"><div><label>PDF Segment Quality</label><input type="number" id="wpc-s-pdfImageQuality" value="' + s.pdfImageQuality + '" min="0.5" max="1" step="0.05"></div>' +
            '<div><label>Max Stored Width (px)</label><input type="number" id="wpc-s-compressMaxWidth" value="' + s.compressMaxWidth + '" min="800" max="4000" step="200"></div></div></div>' +
            '<div class="wpc-sg"><div class="wpc-sgt">PDF Content</div>' +
            '<div class="wpc-chk"><input type="checkbox" id="wpc-s-includeTOC"' + (s.includeTOC ? ' checked' : '') + '><label for="wpc-s-includeTOC">Include Table of Contents</label></div>' +
            '<div class="wpc-chk"><input type="checkbox" id="wpc-s-includeHeaders"' + (s.includeHeaders ? ' checked' : '') + '><label for="wpc-s-includeHeaders">Page Headers (title + URL)</label></div>' +
            '<div class="wpc-chk"><input type="checkbox" id="wpc-s-includePageNumbers"' + (s.includePageNumbers ? ' checked' : '') + '><label for="wpc-s-includePageNumbers">Page Numbers (Page X of Y)</label></div>' +
            '<div class="wpc-chk"><input type="checkbox" id="wpc-s-pageBreakSeparator"' + (s.pageBreakSeparator ? ' checked' : '') + '><label for="wpc-s-pageBreakSeparator">Section Divider Lines</label></div>' +
            '<div class="wpc-chk"><input type="checkbox" id="wpc-s-includeCoverPage"' + (s.includeCoverPage ? ' checked' : '') + '><label for="wpc-s-includeCoverPage">Cover Page</label></div>' +
            '<label>Cover Author Name</label><input type="text" id="wpc-s-coverAuthor" value="' + (s.coverAuthor || '') + '" placeholder="(optional)">' +
            '<label>Watermark Text</label><input type="text" id="wpc-s-watermarkText" value="' + (s.watermarkText || '') + '" placeholder="e.g. DRAFT, CONFIDENTIAL (leave empty for none)"></div>';

        showModal({
            title: 'PDF Settings',
            bodyHtml: bh,
            onConfirm: function (modalEl) {
                saveSettings({
                    paperSize: modalEl.querySelector('#wpc-s-paperSize').value,
                    margins: parseInt(modalEl.querySelector('#wpc-s-margins').value) || 20,
                    overlapPx: parseInt(modalEl.querySelector('#wpc-s-overlapPx').value) || 30,
                    captureScale: parseFloat(modalEl.querySelector('#wpc-s-captureScale').value) || 2,
                    imageQuality: parseFloat(modalEl.querySelector('#wpc-s-imageQuality').value) || 0.92,
                    pdfImageQuality: parseFloat(modalEl.querySelector('#wpc-s-pdfImageQuality').value) || 0.92,
                    compressMaxWidth: parseInt(modalEl.querySelector('#wpc-s-compressMaxWidth').value) || 2400,
                    includeTOC: modalEl.querySelector('#wpc-s-includeTOC').checked,
                    includeHeaders: modalEl.querySelector('#wpc-s-includeHeaders').checked,
                    includePageNumbers: modalEl.querySelector('#wpc-s-includePageNumbers').checked,
                    pageBreakSeparator: modalEl.querySelector('#wpc-s-pageBreakSeparator').checked,
                    includeCoverPage: modalEl.querySelector('#wpc-s-includeCoverPage').checked,
                    coverAuthor: modalEl.querySelector('#wpc-s-coverAuthor').value.trim(),
                    watermarkText: modalEl.querySelector('#wpc-s-watermarkText').value.trim(),
                });
                toast('Settings saved');
            }
        });
    }

    panel.querySelector('#wpc-btn-settings').addEventListener('click', showSettingsModal);

    // Project management
    function ensureDefaultProject() {
        var projects = loadProjects();
        if (Object.keys(projects).length === 0) {
            var id = uid();
            projects[id] = { id: id, name: 'My Project', created: Date.now(), pages: [] };
            saveProjects(projects); setActiveProjectId(id);
        } else if (!getActiveProjectId() || !projects[getActiveProjectId()]) {
            setActiveProjectId(Object.keys(projects)[0]);
        }
    }

    function refreshProjectSelect() {
        var projects = loadProjects();
        var activeId = getActiveProjectId();
        projectSelect.innerHTML = '';
        Object.values(projects).sort(function (a, b) { return b.created - a.created; }).forEach(function (p) {
            var opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name + ' (' + p.pages.length + ' pages)';
            if (p.id === activeId) opt.selected = true;
            projectSelect.appendChild(opt);
        });
    }

    function refreshPageList() {
        var projects = loadProjects();
        var activeId = getActiveProjectId();
        var project = projects[activeId];
        if (!project) { pageList.innerHTML = '<div class="wpc-empty">No project selected</div>'; pageCountEl.textContent = '0'; updateBadge(); return; }
        pageCountEl.textContent = project.pages.length;
        updateBadge();
        if (project.pages.length === 0) { pageList.innerHTML = '<div class="wpc-empty">No pages captured yet.<br>Navigate to a page and click Capture!</div>'; return; }
        pageList.innerHTML = '';
        project.pages.forEach(function (page, idx) {
            var item = document.createElement('div');
            item.className = 'wpc-page-item';
            item.setAttribute('draggable', 'true');
            item.dataset.idx = idx;
            var thumb = page.thumbnail ? '<img class="wpc-page-thumb" src="' + page.thumbnail + '" alt="thumb" title="Click to preview">' : '<div class="wpc-page-thumb"></div>';
            var displayTitle = page.customTitle || page.title;
            item.innerHTML = '<div class="wpc-drag-handle" title="Drag to reorder">' + ICONS.grip + '</div>' +
                thumb +
                '<div class="wpc-page-info"><div class="wpc-page-name" title="' + displayTitle + '">' + (idx + 1) + '. ' + truncate(displayTitle, 35) + '</div>' +
                '<div class="wpc-page-url" title="' + page.url + '">' + truncate(page.url, 45) + '</div></div>' +
                '<div class="wpc-page-actions">' +
                '<button class="wpc-page-edit" title="Rename page">' + ICONS.edit + '</button>' +
                '<button class="wpc-page-up" title="Move up">' + ICONS.arrowUp + '</button>' +
                '<button class="wpc-page-down" title="Move down">' + ICONS.arrowDown + '</button>' +
                '<button class="wpc-page-delete" title="Remove">' + ICONS.trash + '</button></div>';
            // Thumbnail click → full-size preview
            var thumbEl = item.querySelector('.wpc-page-thumb');
            if (thumbEl && page.imageData) {
                thumbEl.addEventListener('click', (function (imgData, title) {
                    return function () { showPreview(imgData, title); };
                })(page.imageData, displayTitle));
            }
            item.querySelector('.wpc-page-edit').addEventListener('click', (function (pageRef) {
                return function () {
                    showModal({
                        title: 'Rename Page',
                        fields: [{ id: 'title', label: 'Page Title', type: 'text', value: pageRef.customTitle || pageRef.title }],
                        onConfirm: function (v) {
                            var newTitle = v.title.trim();
                            if (!newTitle) { toast('Title cannot be empty'); return; }
                            if (newTitle === pageRef.title) {
                                delete pageRef.customTitle;
                            } else {
                                pageRef.customTitle = newTitle;
                            }
                            saveProjects(projects);
                            refreshPageList();
                            toast('Page renamed');
                        }
                    });
                };
            })(page));
            item.querySelector('.wpc-page-up').addEventListener('click', function () {
                if (idx > 0) { var tmp = project.pages[idx - 1]; project.pages[idx - 1] = project.pages[idx]; project.pages[idx] = tmp; saveProjects(projects); refreshPageList(); }
            });
            item.querySelector('.wpc-page-down').addEventListener('click', function () {
                if (idx < project.pages.length - 1) { var tmp = project.pages[idx]; project.pages[idx] = project.pages[idx + 1]; project.pages[idx + 1] = tmp; saveProjects(projects); refreshPageList(); }
            });
            item.querySelector('.wpc-page-delete').addEventListener('click', function () {
                if (confirm('Remove page "' + (page.customTitle || page.title) + '" from project?')) { project.pages.splice(idx, 1); saveProjects(projects); refreshPageList(); toast('Page removed'); }
            });
            // Drag-and-drop handlers
            item.addEventListener('dragstart', (function (i) {
                return function (e) {
                    dragSrcIdx = i;
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', i);
                    setTimeout(function () { item.classList.add('wpc-dragging'); }, 0);
                };
            })(idx));
            item.addEventListener('dragend', function () {
                item.classList.remove('wpc-dragging');
                pageList.querySelectorAll('.wpc-drag-over').forEach(function (el) { el.classList.remove('wpc-drag-over'); });
                dragSrcIdx = null;
            });
            item.addEventListener('dragover', function (e) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                item.classList.add('wpc-drag-over');
            });
            item.addEventListener('dragleave', function () {
                item.classList.remove('wpc-drag-over');
            });
            item.addEventListener('drop', (function (i) {
                return function (e) {
                    e.preventDefault();
                    item.classList.remove('wpc-drag-over');
                    if (dragSrcIdx === null || dragSrcIdx === i) return;
                    var moved = project.pages.splice(dragSrcIdx, 1)[0];
                    project.pages.splice(i, 0, moved);
                    saveProjects(projects);
                    refreshPageList();
                    toast('Page moved');
                };
            })(idx));
            pageList.appendChild(item);
        });
    }

    function updateBadge() {
        var projects = loadProjects();
        var activeId = getActiveProjectId();
        var project = projects[activeId];
        var count = project ? project.pages.length : 0;
        var badge = toggleBtn.querySelector('.wpc-badge');
        if (count > 0) {
            if (!badge) { badge = document.createElement('span'); badge.className = 'wpc-badge'; toggleBtn.appendChild(badge); }
            badge.textContent = count;
        } else if (badge) { badge.remove(); }
    }

    function refreshUI() { refreshProjectSelect(); refreshPageList(); }

    projectSelect.addEventListener('change', function () { setActiveProjectId(projectSelect.value); refreshPageList(); });

    panel.querySelector('#wpc-btn-new-project').addEventListener('click', function () {
        showModal({
            title: 'New Project',
            fields: [{ id: 'name', label: 'Project Name', type: 'text', placeholder: 'My Project', value: '' }],
            onConfirm: function (v) {
                if (!v.name.trim()) { toast('Name cannot be empty'); return; }
                var projects = loadProjects(); var id = uid();
                projects[id] = { id: id, name: v.name.trim(), created: Date.now(), pages: [] };
                saveProjects(projects); setActiveProjectId(id); refreshUI();
                toast('Project "' + v.name.trim() + '" created');
            }
        });
    });

    panel.querySelector('#wpc-btn-edit-project').addEventListener('click', function () {
        var projects = loadProjects(); var project = projects[getActiveProjectId()];
        if (!project) return;
        showModal({
            title: 'Rename Project',
            fields: [{ id: 'name', label: 'Project Name', type: 'text', value: project.name }],
            onConfirm: function (v) {
                if (!v.name.trim()) { toast('Name cannot be empty'); return; }
                project.name = v.name.trim(); saveProjects(projects); refreshUI(); toast('Project renamed');
            }
        });
    });

    panel.querySelector('#wpc-btn-delete-project').addEventListener('click', function () {
        var projects = loadProjects(); var activeId = getActiveProjectId(); var project = projects[activeId];
        if (!project) return;
        if (!confirm('Delete project "' + project.name + '" and all its pages?')) return;
        delete projects[activeId]; saveProjects(projects);
        var remaining = Object.keys(projects);
        if (remaining.length > 0) setActiveProjectId(remaining[0]); else ensureDefaultProject();
        refreshUI(); toast('Project deleted');
    });

    // Export active project as JSON file
    panel.querySelector('#wpc-btn-export-project').addEventListener('click', function () {
        var projects = loadProjects(); var activeId = getActiveProjectId(); var project = projects[activeId];
        if (!project) { toast('No project to export'); return; }
        var exportData = {
            _wpc_export: true,
            version: '2.9.0',
            exportedAt: new Date().toISOString(),
            project: project,
        };
        var json = JSON.stringify(exportData);
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = project.name.replace(/[^a-zA-Z0-9_-]/g, '_') + '_export.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast('Project exported: ' + a.download);
    });

    // Import project from JSON file
    panel.querySelector('#wpc-btn-import-project').addEventListener('click', function () {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.style.display = 'none';
        input.addEventListener('change', function () {
            if (!input.files || !input.files[0]) return;
            var reader = new FileReader();
            reader.onload = function (e) {
                try {
                    var data = JSON.parse(e.target.result);
                    if (!data._wpc_export || !data.project) {
                        toast('Invalid export file'); return;
                    }
                    var imported = data.project;
                    // Assign a new ID to avoid conflicts
                    var newId = uid();
                    imported.id = newId;
                    imported.name = imported.name + ' (imported)';
                    // Reassign page IDs
                    imported.pages.forEach(function (p) { p.id = uid(); });
                    var projects = loadProjects();
                    projects[newId] = imported;
                    saveProjects(projects);
                    setActiveProjectId(newId);
                    refreshUI();
                    toast('Imported "' + imported.name + '" (' + imported.pages.length + ' pages)');
                } catch (err) {
                    console.error('WPC Import Error:', err);
                    toast('Import failed: ' + err.message);
                }
            };
            reader.readAsText(input.files[0]);
        });
        document.body.appendChild(input);
        input.click();
        document.body.removeChild(input);
    });

    // Clone active project
    panel.querySelector('#wpc-btn-clone-project').addEventListener('click', function () {
        var projects = loadProjects(); var activeId = getActiveProjectId(); var project = projects[activeId];
        if (!project) { toast('No project to clone'); return; }
        var newId = uid();
        var cloned = JSON.parse(JSON.stringify(project));
        cloned.id = newId;
        cloned.name = project.name + ' (copy)';
        cloned.created = Date.now();
        cloned.pages.forEach(function (p) { p.id = uid(); });
        projects[newId] = cloned;
        saveProjects(projects);
        setActiveProjectId(newId);
        refreshUI();
        toast('Cloned "' + project.name + '" (' + cloned.pages.length + ' pages)');
    });

    panel.querySelectorAll('.wpc-capture-opt').forEach(function (opt) {
        opt.addEventListener('click', function () {
            panel.querySelectorAll('.wpc-capture-opt').forEach(function (o) { o.classList.remove('active'); });
            opt.classList.add('active');
            captureMode = opt.dataset.mode;
        });
    });

    // Timer pill selection
    panel.querySelectorAll('.wpc-timer-pill').forEach(function (pill) {
        pill.addEventListener('click', function () {
            panel.querySelectorAll('.wpc-timer-pill').forEach(function (p) { p.classList.remove('active'); });
            pill.classList.add('active');
            captureDelay = parseInt(pill.dataset.delay) || 0;
        });
    });

    // Countdown helper — shows overlay with countdown numbers, resolves when done
    function runCountdown(seconds) {
        return new Promise(function (resolve) {
            var overlay = document.createElement('div');
            overlay.className = 'wpc-countdown-overlay';
            var num = document.createElement('div');
            num.className = 'wpc-countdown-num';
            num.textContent = seconds;
            overlay.appendChild(num);
            document.body.appendChild(overlay);
            var remaining = seconds;
            var interval = setInterval(function () {
                remaining--;
                if (remaining <= 0) {
                    clearInterval(interval);
                    overlay.remove();
                    resolve();
                } else {
                    num.textContent = remaining;
                }
            }, 1000);
        });
    }

    // Capture page (guarded against rapid double-clicks)
    panel.querySelector('#wpc-btn-capture').addEventListener('click', async function () {
        if (isCapturing) return;
        isCapturing = true;
        var projects = loadProjects();
        var activeId = getActiveProjectId();
        var project = projects[activeId];
        if (!project) { toast('No project selected'); isCapturing = false; return; }
        var settings = loadSettings();
        var captureBtn = panel.querySelector('#wpc-btn-capture');
        captureBtn.disabled = true;
        // Hide panel before countdown so user can position the page
        var wasVisible = !panel.classList.contains('wpc-hidden');
        if (wasVisible) panel.style.display = 'none';
        toggleBtn.style.display = 'none';
        try {
            // Delayed capture countdown
            if (captureDelay > 0) {
                await runCountdown(captureDelay);
            }
            captureBtn.textContent = 'Capturing...';
            await new Promise(function (r) { setTimeout(r, 200); });
            var options = { useCORS: true, allowTaint: true, logging: false, scale: settings.captureScale, backgroundColor: '#ffffff' };
            if (captureMode === 'visible') {
                options.windowWidth = document.documentElement.clientWidth;
                options.windowHeight = window.innerHeight;
                options.y = window.scrollY;
                options.height = window.innerHeight;
            }
            var canvas = await html2canvas(document.body, options);
            var dataUrl = canvas.toDataURL('image/jpeg', settings.imageQuality);
            var thumbCanvas = document.createElement('canvas');
            var thumbCtx = thumbCanvas.getContext('2d');
            var thumbW = 120;
            var thumbH = Math.round((canvas.height / canvas.width) * thumbW);
            thumbCanvas.width = thumbW; thumbCanvas.height = thumbH;
            thumbCtx.drawImage(canvas, 0, 0, thumbW, thumbH);
            var thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.6);
            var captureW = canvas.width, captureH = canvas.height;
            // Release capture canvas and thumbnail canvas memory
            canvas.width = 0; canvas.height = 0; canvas = null;
            thumbCanvas.width = 0; thumbCanvas.height = 0; thumbCanvas = null;
            var compressed = await compressImage(dataUrl, settings.compressMaxWidth, settings.imageQuality);
            dataUrl = null; // Release raw data URL string
            project.pages.push({
                id: uid(), title: document.title || location.hostname, url: location.href,
                capturedAt: Date.now(), captureMode: captureMode,
                imageData: compressed, thumbnail: thumbnail,
                width: captureW, height: captureH
            });
            saveProjects(projects);
            var overlay = document.createElement('div');
            overlay.id = 'wpc-capture-overlay';
            document.body.appendChild(overlay);
            setTimeout(function () { overlay.remove(); }, 500);
            toast('Page captured! (' + project.pages.length + ' total)');
        } catch (err) {
            console.error('WPC Capture Error:', err);
            toast('Capture failed: ' + err.message);
        } finally {
            if (wasVisible) panel.style.display = '';
            toggleBtn.style.display = '';
            captureBtn.disabled = false;
            captureBtn.innerHTML = ICONS.camera + ' Capture Page';
            isCapturing = false;
            refreshUI();
        }
    });

    /* ================================================================== */
    /*  PDF Compilation Engine v2                                          */
    /*  Improvements:                                                      */
    /*  - Proper margins on all sides                                      */
    /*  - Page headers with title, URL, timestamp per capture section      */
    /*  - "Page X of Y" footer on every PDF page                          */
    /*  - Multi-page TOC with PDF page references                         */
    /*  - Segment overlap to avoid cutting text at page boundaries        */
    /*  - Section divider lines between captures                          */
    /*  - PDF metadata (title, author, creation date)                     */
    /*  - Configurable paper size (A4, Letter, Legal)                     */
    /*  - Higher capture quality (2x scale default)                       */
    /* ================================================================== */

    panel.querySelector('#wpc-btn-compile').addEventListener('click', async function () {
        var projects = loadProjects();
        var activeId = getActiveProjectId();
        var project = projects[activeId];
        if (!project) { toast('No project selected'); return; }
        if (project.pages.length === 0) { toast('No pages to compile'); return; }

        var settings = loadSettings();
        var compileBtn = panel.querySelector('#wpc-btn-compile');
        compileBtn.disabled = true;
        progressContainer.style.display = 'block';
        progressFill.style.width = '0%';
        progressText.textContent = 'Initializing...';

        try {
            var paper = PAPER_SIZES[settings.paperSize] || PAPER_SIZES.a4;
            var marginMM = settings.margins * 0.264583; // convert px to mm

            var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [paper.w, paper.h], compress: true });

            doc.setProperties({
                title: project.name,
                subject: 'Web PDF Compilation - ' + project.pages.length + ' pages',
                creator: 'Web PDF Compiler (Tampermonkey)',
                author: 'Web PDF Compiler',
            });

            var pdfW = paper.w;
            var pdfH = paper.h;
            var contentW = pdfW - (marginMM * 2);
            var headerReserve = settings.includeHeaders ? 14 : 0; // mm for header block
            var footerReserve = settings.includePageNumbers ? 8 : 0; // mm for footer
            var drawableH = pdfH - marginMM - marginMM - footerReserve;
            var overlapMM = settings.overlapPx * 0.264583;

            // We track which PDF page number each capture section starts on (excluding TOC pages for now)
            var tocEntries = [];
            var contentPageCount = 0;

            // ---- Pass 1: Build content pages (streaming — one page at a time) ----
            for (var i = 0; i < project.pages.length; i++) {
                // Extract only what we need from the page, then release the reference
                var pageRef = project.pages[i];
                var pageTitle = pageRef.customTitle || pageRef.title;
                var pageUrl = pageRef.url;
                var pageCapturedAt = pageRef.capturedAt;
                var pageImageData = pageRef.imageData;

                progressFill.style.width = (((i) / project.pages.length) * 90) + '%';
                progressText.textContent = 'Processing page ' + (i + 1) + ' of ' + project.pages.length + '...';

                if (i > 0) {
                    doc.addPage([paper.w, paper.h], 'portrait');
                }
                contentPageCount++;

                // Record where this capture starts (use custom title if set)
                tocEntries.push({
                    title: pageTitle,
                    url: pageUrl,
                    capturedAt: pageCapturedAt,
                    pdfPage: contentPageCount,
                });

                // Load image from the stored data
                var img = await new Promise(function (resolve, reject) {
                    var im = new Image();
                    im.onload = function () { resolve(im); };
                    im.onerror = reject;
                    im.src = pageImageData;
                });

                // Calculate how the image fits within content area
                var imgAspect = img.width / img.height;
                var drawW = contentW;
                var drawH = drawW / imgAspect;

                // Y position tracking for this section
                var curY = marginMM;

                // ---- Section divider line ----
                if (settings.pageBreakSeparator && i > 0) {
                    doc.setDrawColor(180, 180, 210);
                    doc.setLineWidth(0.4);
                    doc.line(marginMM, curY, pdfW - marginMM, curY);
                    curY += 2;
                }

                // ---- Page header ----
                if (settings.includeHeaders) {
                    curY += 1;
                    doc.setFontSize(10);
                    doc.setTextColor(50, 50, 70);
                    doc.setFont(undefined, 'bold');
                    doc.text((i + 1) + '. ' + truncate(pageTitle, 75), marginMM, curY + 3);
                    doc.setFontSize(7);
                    doc.setTextColor(120, 120, 140);
                    doc.setFont(undefined, 'normal');
                    var headerUrlText = truncate(pageUrl, 95);
                    doc.text(headerUrlText, marginMM, curY + 7.5);
                    // Clickable URL link on header
                    var headerUrlW = doc.getTextWidth(headerUrlText);
                    doc.link(marginMM, curY + 4.5, headerUrlW, 4, { url: pageUrl });
                    doc.text(fmtDate(pageCapturedAt), pdfW - marginMM, curY + 7.5, { align: 'right' });

                    // Underline
                    doc.setDrawColor(210, 210, 225);
                    doc.setLineWidth(0.15);
                    doc.line(marginMM, curY + 9.5, pdfW - marginMM, curY + 9.5);
                    curY += headerReserve;
                }

                var imgStartY = curY;
                var availableH = drawableH - (curY - marginMM);

                if (drawH <= availableH) {
                    // Fits on one page — use pageImageData directly, then release
                    doc.addImage(pageImageData, 'JPEG', marginMM, imgStartY, drawW, drawH);
                } else {
                    // Split image into segments
                    var pxPerMM = img.width / drawW;
                    var firstSegAvailable = availableH;
                    var laterSegAvailable = drawableH;
                    var overlapSrcPx = Math.round(overlapMM * pxPerMM);

                    // First segment
                    var firstSegSourceH = Math.round(firstSegAvailable * pxPerMM);
                    firstSegSourceH = Math.min(firstSegSourceH, img.height);
                    var firstSegDrawH = firstSegSourceH / pxPerMM;

                    var segCanvas = document.createElement('canvas');
                    var segCtx = segCanvas.getContext('2d');
                    segCanvas.width = img.width;
                    segCanvas.height = firstSegSourceH;
                    segCtx.drawImage(img, 0, 0, img.width, firstSegSourceH, 0, 0, img.width, firstSegSourceH);
                    var segData = segCanvas.toDataURL('image/jpeg', settings.pdfImageQuality);
                    doc.addImage(segData, 'JPEG', marginMM, imgStartY, drawW, firstSegDrawH);
                    segCanvas.width = 0; segCanvas.height = 0; segCtx = null; // Release segment canvas memory
                    segData = null; // Release base64 string

                    var srcOffset = firstSegSourceH - overlapSrcPx;

                    // Subsequent segments
                    while (srcOffset < img.height) {
                        doc.addPage([paper.w, paper.h], 'portrait');
                        contentPageCount++;

                        var remaining = img.height - srcOffset;
                        var segH = Math.round(laterSegAvailable * pxPerMM);
                        var actualH = Math.min(segH, remaining);
                        var actualDrawH = actualH / pxPerMM;

                        segCanvas = document.createElement('canvas');
                        segCtx = segCanvas.getContext('2d');
                        segCanvas.width = img.width;
                        segCanvas.height = actualH;
                        segCtx.drawImage(img, 0, srcOffset, img.width, actualH, 0, 0, img.width, actualH);
                        segData = segCanvas.toDataURL('image/jpeg', settings.pdfImageQuality);
                        doc.addImage(segData, 'JPEG', marginMM, marginMM, drawW, actualDrawH);
                        segCanvas.width = 0; segCanvas.height = 0; segCtx = null; // Release segment canvas memory
                        segData = null; // Release base64 string

                        srcOffset += actualH - overlapSrcPx;

                        // Yield between segments for large images to let GC collect
                        await new Promise(function (r) { setTimeout(r, 10); });
                    }
                }

                // Release all data for this page before moving to next (streaming)
                img.src = '';
                img = null;
                pageImageData = null;
                pageRef = null;

                // Yield to event loop between pages — allows GC and keeps UI responsive
                await new Promise(function (r) { setTimeout(r, 50); });
            }

            // ---- Pass 2: Add page numbers to all content pages ----
            if (settings.includePageNumbers) {
                var totalContentPages = doc.getNumberOfPages();
                for (var p = 1; p <= totalContentPages; p++) {
                    doc.setPage(p);
                    doc.setFontSize(7);
                    doc.setTextColor(160, 160, 170);
                    doc.setFont(undefined, 'normal');
                    doc.text('Page ' + p + ' of ' + totalContentPages, pdfW / 2, pdfH - marginMM + 4, { align: 'center' });
                    doc.text(project.name, marginMM, pdfH - marginMM + 4);
                    doc.text(new Date().toLocaleDateString(), pdfW - marginMM, pdfH - marginMM + 4, { align: 'right' });
                }
            }

            // ---- Pass 3: Insert TOC at the beginning ----
            if (settings.includeTOC) {
                progressFill.style.width = '95%';
                progressText.textContent = 'Building table of contents...';

                // Calculate how many TOC pages we need
                var tocItemH = 14; // mm per TOC item
                var tocHeaderH = 40; // mm for TOC header
                var tocAvailH = pdfH - marginMM * 2 - footerReserve;
                var firstPageItems = Math.floor((tocAvailH - tocHeaderH) / tocItemH);
                var laterPageItems = Math.floor(tocAvailH / tocItemH);
                var tocPageCount = 1;
                var remainingItems = project.pages.length - firstPageItems;
                if (remainingItems > 0) {
                    tocPageCount += Math.ceil(remainingItems / laterPageItems);
                }

                // Insert TOC pages at the beginning
                for (var tp = 0; tp < tocPageCount; tp++) {
                    doc.insertPage(tp + 1);
                }

                // Update TOC page references (shift by tocPageCount)
                tocEntries.forEach(function (entry) {
                    entry.pdfPage += tocPageCount;
                });

                // Draw TOC content
                var tocIdx = 0;
                for (var tp2 = 0; tp2 < tocPageCount; tp2++) {
                    doc.setPage(tp2 + 1);
                    var ty = marginMM;

                    if (tp2 === 0) {
                        // TOC Header on first page
                        doc.setFontSize(22);
                        doc.setTextColor(50, 50, 70);
                        doc.setFont(undefined, 'bold');
                        doc.text(project.name, pdfW / 2, ty + 12, { align: 'center' });

                        doc.setFontSize(10);
                        doc.setTextColor(120, 120, 140);
                        doc.setFont(undefined, 'normal');
                        doc.text('Compiled on ' + new Date().toLocaleString(), pdfW / 2, ty + 20, { align: 'center' });
                        doc.text(project.pages.length + ' page(s) captured', pdfW / 2, ty + 27, { align: 'center' });

                        // Decorative line
                        doc.setDrawColor(180, 160, 220);
                        doc.setLineWidth(0.5);
                        doc.line(marginMM + 20, ty + 32, pdfW - marginMM - 20, ty + 32);

                        ty += tocHeaderH;
                    }

                    var maxItems = (tp2 === 0) ? firstPageItems : laterPageItems;
                    var drawn = 0;
                    while (tocIdx < tocEntries.length && drawn < maxItems) {
                        var entry = tocEntries[tocIdx];

                        // Entry number + title
                        doc.setFontSize(10);
                        doc.setTextColor(50, 50, 70);
                        doc.setFont(undefined, 'bold');
                        var titleText = (tocIdx + 1) + '.  ' + truncate(entry.title, 65);
                        doc.text(titleText, marginMM, ty + 4);

                        // Page number reference (right-aligned)
                        doc.setFontSize(9);
                        doc.setTextColor(160, 130, 200);
                        doc.setFont(undefined, 'bold');
                        doc.text('p.' + entry.pdfPage, pdfW - marginMM, ty + 4, { align: 'right' });

                        // URL + date
                        doc.setFontSize(7);
                        doc.setTextColor(140, 140, 155);
                        doc.setFont(undefined, 'normal');
                        var tocUrlText = truncate(entry.url, 90);
                        doc.text(tocUrlText, marginMM + 5, ty + 9);
                        // Clickable URL link on TOC entry
                        var tocUrlW = doc.getTextWidth(tocUrlText);
                        doc.link(marginMM + 5, ty + 6, tocUrlW, 4, { url: entry.url });
                        doc.text(fmtDate(entry.capturedAt), pdfW - marginMM, ty + 9, { align: 'right' });

                        // Subtle separator
                        doc.setDrawColor(230, 230, 240);
                        doc.setLineWidth(0.1);
                        doc.line(marginMM, ty + 12, pdfW - marginMM, ty + 12);

                        // Clickable link region — jumps to the target PDF page
                        doc.link(marginMM, ty, pdfW - marginMM * 2, tocItemH, { pageNumber: entry.pdfPage });

                        ty += tocItemH;
                        tocIdx++;
                        drawn++;
                    }
                }

                // Update page numbers on TOC pages
                if (settings.includePageNumbers) {
                    var totalPages = doc.getNumberOfPages();
                    for (var tp3 = 0; tp3 < tocPageCount; tp3++) {
                        doc.setPage(tp3 + 1);
                        doc.setFontSize(7);
                        doc.setTextColor(160, 160, 170);
                        doc.setFont(undefined, 'normal');
                        doc.text('Table of Contents' + (tocPageCount > 1 ? ' (' + (tp3 + 1) + '/' + tocPageCount + ')' : ''), pdfW / 2, pdfH - marginMM + 4, { align: 'center' });
                    }
                    // Update content page numbers to reflect new total
                    var newTotal = doc.getNumberOfPages();
                    for (var cp = tocPageCount + 1; cp <= newTotal; cp++) {
                        doc.setPage(cp);
                        doc.setFontSize(7);
                        doc.setTextColor(160, 160, 170);
                        doc.setFont(undefined, 'normal');
                        doc.text('Page ' + cp + ' of ' + newTotal, pdfW / 2, pdfH - marginMM + 4, { align: 'center' });
                        doc.text(project.name, marginMM, pdfH - marginMM + 4);
                        doc.text(new Date().toLocaleDateString(), pdfW - marginMM, pdfH - marginMM + 4, { align: 'right' });
                    }
                }
            }

            // ---- Pass 4: Insert cover page at the very beginning ----
            if (settings.includeCoverPage) {
                doc.insertPage(1);

                doc.setPage(1);
                var coverCenterX = pdfW / 2;

                // Top decorative line
                doc.setDrawColor(180, 160, 220);
                doc.setLineWidth(0.8);
                doc.line(marginMM + 10, marginMM + 30, pdfW - marginMM - 10, marginMM + 30);

                // Project name
                doc.setFontSize(32);
                doc.setTextColor(50, 50, 70);
                doc.setFont(undefined, 'bold');
                var coverTitle = project.name;
                var titleLines = doc.splitTextToSize(coverTitle, contentW - 20);
                doc.text(titleLines, coverCenterX, pdfH * 0.35, { align: 'center' });

                // Subtitle — page count
                doc.setFontSize(14);
                doc.setTextColor(120, 120, 140);
                doc.setFont(undefined, 'normal');
                doc.text(project.pages.length + ' Captured Page' + (project.pages.length !== 1 ? 's' : ''), coverCenterX, pdfH * 0.35 + titleLines.length * 14 + 8, { align: 'center' });

                // Author
                if (settings.coverAuthor) {
                    doc.setFontSize(16);
                    doc.setTextColor(80, 80, 100);
                    doc.setFont(undefined, 'bold');
                    doc.text(settings.coverAuthor, coverCenterX, pdfH * 0.55, { align: 'center' });
                }

                // Date
                doc.setFontSize(12);
                doc.setTextColor(140, 140, 155);
                doc.setFont(undefined, 'normal');
                doc.text(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }), coverCenterX, pdfH * 0.62, { align: 'center' });

                // Bottom decorative line
                doc.setDrawColor(180, 160, 220);
                doc.setLineWidth(0.8);
                doc.line(marginMM + 10, pdfH - marginMM - 20, pdfW - marginMM - 10, pdfH - marginMM - 20);

                // Footer credit
                doc.setFontSize(8);
                doc.setTextColor(170, 170, 185);
                doc.text('Generated by Web PDF Compiler', coverCenterX, pdfH - marginMM - 10, { align: 'center' });

                // Update all page numbers (shift everything by 1 for the cover page)
                if (settings.includePageNumbers) {
                    var finalTotal = doc.getNumberOfPages();
                    for (var fp = 2; fp <= finalTotal; fp++) {
                        doc.setPage(fp);
                        doc.setFontSize(7);
                        doc.setTextColor(160, 160, 170);
                        doc.setFont(undefined, 'normal');
                        doc.text('Page ' + fp + ' of ' + finalTotal, pdfW / 2, pdfH - marginMM + 4, { align: 'center' });
                    }
                }
            }

            // ---- Pass 5: Apply watermark to all pages ----
            if (settings.watermarkText) {
                var wmTotal = doc.getNumberOfPages();
                var wmStartPage = settings.includeCoverPage ? 2 : 1; // skip cover page
                for (var wp = wmStartPage; wp <= wmTotal; wp++) {
                    doc.setPage(wp);
                    doc.saveGraphicsState();
                    doc.setGState(new doc.GState({ opacity: 0.08 }));
                    doc.setFontSize(60);
                    doc.setTextColor(120, 100, 160);
                    doc.setFont(undefined, 'bold');
                    doc.text(settings.watermarkText, pdfW / 2, pdfH / 2, {
                        align: 'center',
                        angle: 45,
                    });
                    doc.restoreGraphicsState();
                }
            }

            progressFill.style.width = '100%';
            progressText.textContent = 'Generating PDF...';

            var filename = project.name.replace(/[^a-zA-Z0-9_-]/g, '_') + '_' + new Date().toISOString().slice(0, 10) + '.pdf';
            doc.save(filename);

            toast('PDF saved: ' + filename);
            progressText.textContent = 'Done!';
            setTimeout(function () { progressContainer.style.display = 'none'; }, 2000);

        } catch (err) {
            console.error('WPC Compile Error:', err);
            toast('Compile failed: ' + err.message);
            progressText.textContent = 'Error: ' + err.message;
        } finally {
            compileBtn.disabled = false;
        }
    });

    /* ------------------------------------------------------------------ */
    /*  Keyboard Shortcuts                                                 */
    /* ------------------------------------------------------------------ */

    document.addEventListener('keydown', function (e) {
        if (e.altKey && e.shiftKey && e.key === 'P') {
            e.preventDefault();
            if (panel.classList.contains('wpc-hidden')) showPanel(); else hidePanel();
        }
        if (e.altKey && e.shiftKey && e.key === 'C') {
            e.preventDefault();
            panel.querySelector('#wpc-btn-capture').click();
        }
    });

    /* ------------------------------------------------------------------ */
    /*  Tampermonkey Menu Commands                                         */
    /* ------------------------------------------------------------------ */

    GM_registerMenuCommand('Toggle PDF Compiler Panel', function () {
        if (panel.classList.contains('wpc-hidden')) showPanel(); else hidePanel();
    });
    GM_registerMenuCommand('Quick Capture Current Page', function () {
        panel.querySelector('#wpc-btn-capture').click();
    });
    GM_registerMenuCommand('Compile & Download PDF', function () {
        panel.querySelector('#wpc-btn-compile').click();
    });
    GM_registerMenuCommand('PDF Settings', showSettingsModal);

    /* ------------------------------------------------------------------ */
    /*  Init                                                               */
    /* ------------------------------------------------------------------ */

    ensureDefaultProject();
    refreshUI();

    if (GM_getValue(PANEL_STATE_KEY, 'closed') === 'open') {
        showPanel();
    }

    console.log('%c[Web PDF Compiler v2]%c Ready | Alt+Shift+P toggle | Alt+Shift+C capture',
        'color: #cba6f7; font-weight: bold;', 'color: inherit;');

})();

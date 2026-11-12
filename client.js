/** The host owns prompt contents; this DSH panel displays names and observed state only. */
window.__ModuleLoader__.load({
  id: '@local/dsh-yanyu-purge',
  factory: (require) => {
    const React = require('react');
    const { createPortal } = require('react-dom');
    const h = React.createElement;
    const { useState, useEffect, useRef, useId } = React;
    const API = '/plugins/yanyu-purge/api';
    const SITE = 'https://yanyuapi.com/';
    const GROUP = 'https://qm.qq.com/q/AgbEXUorUA';
    const SWALLOW = 'M10 6.5C25.5 9.4 42.1 15.1 46.3 23.3C47.1 24.8 47.2 26 47.1 27C49.2 25.6 50.1 24.4 52.3 24.5C53.9 24.5 55 25.2 56.3 25.7L53.3 27.2C52.7 30 51.8 31.5 50.3 33C52.8 35.3 51.8 39.4 49.4 43.2C44.6 50.7 36.4 56 29.1 60C35.2 53.1 40.5 45.7 41.8 40.6L40.3 36.7L34.6 38.1L9.6 56.2L27.8 38.6L6.4 45.9L36.2 30.4L37.7 29.4C35.9 27.2 35.5 24.8 35.7 22.8C30 16.2 19.1 10.5 10 6.5Z';
    const BIRDS = [
      { id: 'a', name: '红燕子', note: '中文表达', color: '#bf3623' },
      { id: 'b', name: '黄燕子', note: '英文表达', color: '#a47518' },
      { id: 'c', name: '蓝燕子', note: '执行规范', color: '#336caa' },
      { id: 'd', name: '绿燕子', note: '通道规范', color: '#2c7b60' }
    ];

    async function api(path, body, signal) {
      const controller = new AbortController();
      let timedOut = false;
      const abort = () => controller.abort();
      if (signal?.aborted) abort();
      signal?.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(() => { timedOut = true; abort(); }, 12000);
      try {
        const res = await fetch(`${API}/${path}`, {
          method: body === undefined ? 'GET' : 'POST',
          headers: body === undefined ? undefined : { 'content-type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
          credentials: 'same-origin', cache: 'no-store', signal: controller.signal
        });
        let wire;
        try { wire = await res.json(); }
        catch { throw new Error('暂时没有收到插件响应，请重试。'); }
        if (!res.ok || wire?.ok !== true) throw new Error('插件状态更新失败，请重试。');
        const value = wire.value;
        if (!value || !Array.isArray(value.schemes) || !BIRDS.some((bird) => bird.id === value.scheme)) {
          throw new Error('插件返回的状态不完整，请刷新后重试。');
        }
        if (!value.schemes.some((scheme) => scheme.id === value.scheme)) {
          throw new Error('插件尚未提供可用方案，请刷新后重试。');
        }
        return value;
      } catch (error) {
        if (timedOut) throw new Error('连接超时，请确认插件已启用后重试。');
        throw error;
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
      }
    }

    const CSS = `
      .yy{--yy-night:#0c1d40;--yy-sky:#bad7eb;--yy-seal:#bf3623;--yy-seal-hover:#a92b1b;--yy-paper:var(--dsw-alias-bg-layer-1,#faf7f0);--yy-ink:var(--dsw-alias-label-primary,#29251f);--yy-muted:var(--dsw-alias-label-secondary,#6b6259);--yy-line:var(--dsw-alias-border-l1,#e4ded3);--yy-tint:color-mix(in srgb,var(--yy-paper) 94%,var(--yy-seal));--yy-accent-ink:color-mix(in srgb,var(--yy-ink) 42%,var(--yy-seal));--yy-serif:"Noto Serif SC","Source Han Serif SC","Songti SC","STSong","SimSun",serif;box-sizing:border-box;position:relative;width:100%;min-width:0;height:100%;min-height:0;flex:1 1 0;overflow-y:auto;overflow-x:hidden;overscroll-behavior-y:contain;scrollbar-gutter:stable;background:var(--yy-paper);color:var(--yy-ink);font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;container:yy-panel / inline-size;scrollbar-color:var(--yy-muted) var(--yy-paper)}
      .yy:focus-visible{outline:2px solid var(--yy-accent-ink);outline-offset:-2px}
      .yy *,.yy *::before,.yy *::after{box-sizing:border-box}
      .yy ::selection{background:#bad7eb;color:#0c1d40}
      .yy h1,.yy h2,.yy h3,.yy p{margin:0}
      .yy a{color:inherit;text-underline-offset:4px}
      .yy button,.yy input{font:inherit}
      .yy svg{display:block;flex:none}
      .yy button,.yy a,.yy label{-webkit-tap-highlight-color:transparent}
      .yy :is(button,a,input):focus-visible{outline:3px solid var(--yy-accent-ink);outline-offset:4px}
      .yy-shell{max-width:1040px;margin-inline:auto;padding:32px 36px 24px}
      .yy-masthead{background:var(--yy-night);color:#fffaf2}
      .yy-masthead .yy-shell{padding-block:28px 30px}
      .yy-brand-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:20px}
      .yy-brand{display:flex;align-items:center;gap:14px;min-width:0}
      .yy-brand h1{white-space:nowrap;font:800 27px/1.25 var(--yy-serif);letter-spacing:.04em}
      .yy-brand p{font-size:12px;color:var(--yy-sky);margin-top:4px}
      .yy-site-link{display:inline-flex;align-items:center;gap:8px;min-height:44px;color:var(--yy-sky)!important;font-size:13px;text-decoration:none;white-space:nowrap}
      .yy-site-link:hover{color:#fffaf2!important;text-decoration:underline}
      .yy-masthead :is(a,button):focus-visible{outline-color:var(--yy-sky)}
      .yy-intro{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-top:28px}
      .yy-intro h2{font:700 30px/1.45 var(--yy-serif);letter-spacing:.02em;text-wrap:balance}
      .yy-intro h2 span{color:var(--yy-sky)}
      .yy-intro p{max-width:240px;color:var(--yy-sky);font-size:13px}
      .yy-section-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:20px}
      .yy-section-heading h2{font:700 22px/1.4 var(--yy-serif)}
      .yy-section-heading p{color:var(--yy-muted);font-size:13px;margin-top:5px}
      .yy-connection{display:inline-flex;align-items:center;gap:7px;font-size:12px;white-space:nowrap;color:var(--yy-muted)}
      .yy-dot{width:7px;height:7px;border-radius:50%;background:currentColor;flex:none}
      .yy-connection[data-online="true"] .yy-dot{background:#2c7b60}
      .yy-choices{border:0;padding:0;margin:0;min-width:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .yy-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
      .yy-choice{position:relative;display:flex;align-items:center;gap:14px;padding:19px 20px;border:1px solid var(--yy-line);border-radius:12px;cursor:pointer;min-width:0;transition:background-color .18s,border-color .18s}
      .yy-choice:hover:not([data-disabled="true"]){border-color:var(--yy-accent-ink);background:var(--yy-tint)}
      .yy-choice[data-selected="true"]{border-color:var(--yy-accent-ink);background:var(--yy-tint)}
      .yy-choice:has(input:focus-visible){outline:3px solid var(--yy-accent-ink);outline-offset:3px}
      .yy-choice[data-disabled="true"]{cursor:default}
      .yy-choice[data-loading="true"]{opacity:.55}
      .yy-choice-content{min-width:0;flex:1}
      .yy-choice-name{font-weight:650;font-size:16px;display:block}
      .yy-choice-note{display:block;font-size:12px;color:var(--yy-muted);margin-top:3px}
      .yy-radio-mark{width:19px;height:19px;border:1px solid var(--yy-muted);border-radius:50%;display:grid;place-items:center;flex:none}
      .yy-choice[data-selected="true"] .yy-radio-mark{background:var(--yy-seal);border-color:var(--yy-seal);color:#fff}
      .yy-selection-note{margin-top:14px!important;color:var(--yy-muted);font-size:12px}
      .yy-master{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:22px;margin-bottom:24px;border-bottom:1px solid var(--yy-line)}
      .yy-master h2{font:700 20px/1.4 var(--yy-serif)}
      .yy-master p{font-size:12px;color:var(--yy-muted);margin-top:5px}
      .yy-master-switch{display:inline-flex;align-items:center;gap:9px;flex:none;border:0;background:transparent;color:var(--yy-ink);padding:8px 0;cursor:pointer;font-size:13px!important}
      .yy-master-switch:disabled{opacity:.6;cursor:wait}
      .yy-switch-track{display:block;width:38px;height:22px;border-radius:12px;background:var(--yy-muted);padding:3px}
      .yy-switch-track::after{content:"";display:block;width:16px;height:16px;border-radius:50%;background:var(--yy-paper)}
      .yy-master-switch[aria-checked="true"] .yy-switch-track{background:var(--yy-seal)}
      .yy-master-switch[aria-checked="true"] .yy-switch-track::after{transform:translateX(16px);background:#fff}
      .yy-error{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-top:16px;padding:14px 16px;border:1px solid var(--yy-accent-ink);border-radius:10px;background:var(--yy-tint);font-size:13px}
      .yy-retry{border:0;background:transparent;color:var(--yy-accent-ink);font-weight:650!important;text-decoration:underline;text-underline-offset:4px;cursor:pointer;padding:8px;min-height:40px}
      .yy-retry:disabled{opacity:.6;cursor:wait}
      .yy-monitor{margin-top:28px;border-top:1px solid var(--yy-line);padding-top:22px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:start}
      .yy-monitor h3{font-size:14px;font-weight:650;display:flex;align-items:center;gap:9px}
      .yy-monitor p{color:var(--yy-muted);font-size:12px;margin-top:5px;max-width:62ch}
      .yy-monitor-meta{text-align:right;color:var(--yy-muted);font-size:12px;display:flex;flex-direction:column;gap:4px;font-variant-numeric:tabular-nums}
      .yy-monitor-meta strong{font-weight:500;color:var(--yy-ink)}
      .yy-live-dot{width:8px;height:8px;border-radius:50%;background:var(--yy-muted);flex:none}
      .yy-live-dot[data-confirmed="true"]{background:#2c7b60;animation:yy-confirm .65s ease-out 1}
      @keyframes yy-confirm{from{box-shadow:0 0 0 5px #2c7b6026}to{box-shadow:0 0 0 0 #2c7b6000}}
      .yy-links{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:28px;margin-top:32px;padding-top:28px;border-top:1px solid var(--yy-line)}
      .yy-relay{background:var(--yy-night);color:#fffaf2;border-radius:14px;padding:24px}
      .yy-relay h2{font:700 22px/1.4 var(--yy-serif)}
      .yy-relay h2 small{font:500 13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--yy-sky);margin-left:8px}
      .yy-relay p{font-size:13px;color:var(--yy-sky);margin-top:7px}
      .yy-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:20px}
      .yy-button{min-height:42px;border-radius:8px;padding:9px 15px;border:1px solid transparent;display:inline-flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;font-size:13px!important;font-weight:600!important;text-decoration:none;transition:background-color .18s,border-color .18s}
      .yy-button-primary{background:var(--yy-seal);color:#fff!important}
      .yy-button-primary:hover{background:var(--yy-seal-hover)}
      .yy-button-ghost{border-color:#63718a;background:transparent;color:#edf4fb}
      .yy-button-ghost:hover{border-color:#bad7eb;background:#ffffff0a}
      .yy-button:disabled{opacity:.65;cursor:wait}
      .yy-relay :is(a,button):focus-visible{outline-color:#bad7eb}
      .yy-address{font-size:12px;color:var(--yy-sky);margin-top:14px!important;user-select:all;overflow-wrap:anywhere}
      .yy-copy-feedback{min-height:20px;font-size:12px;color:#fffaf2;margin-top:4px}
      .yy-community{padding:13px 0;display:flex;flex-direction:column;align-items:flex-start}
      .yy-community h2{font:700 21px/1.4 var(--yy-serif)}
      .yy-community p{font-size:13px;color:var(--yy-muted);margin-top:10px;max-width:26ch}
      .yy-community .yy-group-number{font-variant-numeric:tabular-nums;color:var(--yy-ink);font-size:13px;margin-top:18px}
      .yy-join{min-height:44px;margin-top:6px;display:inline-flex;align-items:center;gap:8px;font-weight:600;font-size:13px;color:var(--yy-accent-ink)!important;text-decoration:underline;text-decoration-color:var(--yy-line)}
      .yy-join:hover{text-decoration-color:currentColor}
      .yy-footer{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;color:var(--yy-muted);font-size:11px;margin-top:28px}
      @container yy-panel (max-width:600px){.yy-shell{padding:24px}.yy-masthead .yy-shell{padding-block:24px}.yy-intro{display:block;margin-top:24px}.yy-intro h2{font-size:27px}.yy-intro p{max-width:none;margin-top:10px}.yy-links{grid-template-columns:1fr;gap:20px}.yy-community{padding:0}.yy-community p{max-width:none}.yy-choice{padding:16px 14px;gap:10px}.yy-section-heading{align-items:flex-start}.yy-section-heading h2{font-size:21px}.yy-choice svg.yy-bird{width:32px;height:32px}}
      @container yy-panel (max-width:380px){.yy-shell{padding-inline:18px}.yy-brand-row{gap:12px}.yy-brand{gap:10px}.yy-brand h1{font-size:24px}.yy-site-link{font-size:12px;gap:4px}.yy-choice{gap:8px;padding:15px 11px}.yy-choice-name{font-size:14px}.yy-choice svg.yy-bird{width:26px;height:26px}.yy-radio-mark{width:16px;height:16px}.yy-section-heading{display:block}.yy-connection{margin-top:10px}.yy-monitor{grid-template-columns:1fr;gap:8px}.yy-monitor-meta{text-align:left;flex-direction:row;flex-wrap:wrap;gap:12px}.yy-relay{padding:20px}}
      @container yy-panel (max-width:330px){.yy-choices{grid-template-columns:1fr}.yy-choice{padding:14px 16px;gap:14px}.yy-choice svg.yy-bird{width:34px;height:34px}}
      @media(prefers-reduced-motion:reduce){.yy *{animation:none!important;transition:none!important}}
    `;

    function Bird({ size = 24, color = 'currentColor', seal = false }) {
      return h('svg', { className: 'yy-bird', width: size, height: size, viewBox: '0 0 64 64', 'aria-hidden': true, focusable: false },
        seal ? h('rect', { x: 1, y: 1, width: 62, height: 62, rx: 11, fill: '#bf3623' }) : null,
        h('path', { d: SWALLOW, fill: seal ? '#fffaf2' : color }));
    }
    function Icon({ name, size = 16 }) {
      const paths = { arrow: 'M5 12h14M13 6l6 6-6 6', external: 'M8 5H5v14h14v-3M13 5h6v6M10 14l9-9', copy: 'M9 9h11v11H9zM15 9V4H4v11h5', check: 'M5 12l4 4L19 6' };
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: paths[name] }));
    }
    function SchemeChoices({ state, loading, pending, error, onPick }) {
      const groupId = useId();
      const available = new Set((state?.schemes || []).map((scheme) => scheme.id));
      return h('fieldset', { className: 'yy-choices', disabled: loading || Boolean(pending) || Boolean(error) },
        h('legend', { className: 'yy-sr' }, '选择提示词方案'),
        BIRDS.map((bird) => {
          const selected = state?.scheme === bird.id;
          const disabled = loading || Boolean(pending) || Boolean(error) || !available.has(bird.id);
          return h('label', { key: bird.id, className: 'yy-choice', 'data-selected': selected, 'data-disabled': disabled, 'data-loading': !state },
            h('input', { className: 'yy-sr', type: 'radio', name: groupId, value: bird.id, checked: selected, disabled, onChange: () => onPick(bird.id), 'aria-label': bird.name }),
            h(Bird, { size: 38, color: bird.color }),
            h('span', { className: 'yy-choice-content' }, h('span', { className: 'yy-choice-name' }, bird.name), h('span', { className: 'yy-choice-note' }, pending === bird.id ? '正在切换…' : bird.note)),
            h('span', { className: 'yy-radio-mark', 'aria-hidden': true }, selected ? h(Icon, { name: 'check', size: 13 }) : null));
        }));
    }
    function InjectionStatus({ state, error }) {
      const info = state?.injection;
      const assembled = !error && info?.proof === 'assembled' && info.lastAssembledScheme === state?.scheme && info.lastAssembledMode === state?.mode;
      const evaluated = !error && info?.lastEvaluatedScheme === state?.scheme && info?.lastEvaluatedAt;
      let title = '正在读取注入状态';
      let description = '状态由插件实际运行结果更新。';
      if (error) { title = '状态暂未确认'; description = '重新连接后，将继续更新实际注入状态。'; }
      else if (state?.enabled === false || state?.mode === 'off') { title = '提示词注入已关闭'; description = '本插件不再向新请求注入提示词；余额查询继续可用。'; }
      else if (state && !info) { title = '运行状态待验证'; description = '当前插件尚未返回注入记录，请更新插件后刷新。'; }
      else if (assembled) { title = state.mode === 'purge' ? '系统提示词覆盖已确认' : '系统提示词注入已确认'; description = '最近确认记录：本地模型请求的 system 已包含当前燕子。'; }
      else if (evaluated) { title = '提示词已读取'; description = '宿主已读取当前方案，等待最终系统提示词确认。'; }
      else if (info?.registered) { title = '已就绪，等待下一次请求'; description = '发送一条新消息后，这里会更新注入结果。'; }
      else if (state) { title = '提示词尚未注册'; description = '请确认插件已启用，再刷新状态。'; }
      const parsedTime = info?.lastAssembledAt ? new Date(info.lastAssembledAt) : null;
      return h('section', { className: 'yy-monitor', 'aria-label': '实时注入状态' },
        h('div', { role: 'status', 'aria-live': 'polite', 'aria-atomic': true }, h('h3', null, h('span', { className: 'yy-live-dot', 'data-confirmed': assembled, 'aria-hidden': true }), title), h('p', null, description)),
        h('div', { className: 'yy-monitor-meta' },
          h('strong', null, state ? ({ purge: '覆盖系统提示词', inject: '追加系统提示词', off: '已停用' }[state.mode] || '模式待确认') : '正在连接'),
          h('span', null, assembled && parsedTime && !Number.isNaN(parsedTime.getTime()) ? `最近确认 ${parsedTime.toLocaleTimeString('zh-CN', { hour12: false })}` : '状态自动更新')));
    }
    function RelayCard() {
      const [status, setStatus] = useState('idle');
      const timer = useRef(null);
      const alive = useRef(true);
      const copying = useRef(false);
      useEffect(() => { alive.current = true; return () => { alive.current = false; clearTimeout(timer.current); }; }, []);
      const copy = async () => {
        if (copying.current) return;
        copying.current = true;
        clearTimeout(timer.current);
        setStatus('pending');
        try {
          if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(SITE);
          else {
            const previous = document.activeElement;
            const field = document.createElement('textarea');
            field.value = SITE;
            field.setAttribute('readonly', '');
            field.style.cssText = 'position:fixed;left:-9999px;top:0';
            document.body.appendChild(field);
            try { field.select(); if (!document.execCommand('copy')) throw new Error('copy failed'); }
            finally { field.remove(); previous?.focus?.(); }
          }
          if (alive.current) { setStatus('done'); timer.current = setTimeout(() => setStatus('idle'), 2400); }
        } catch { if (alive.current) setStatus('error'); }
        finally { copying.current = false; }
      };
      return h('section', { className: 'yy-relay' },
        h('h2', null, '燕语', h('small', null, 'FreeCoding')), h('p', null, '一语即达，自在编码。'),
        h('div', { className: 'yy-actions' },
          h('a', { className: 'yy-button yy-button-primary', href: SITE, target: '_blank', rel: 'noopener noreferrer' }, '访问燕语', h(Icon, { name: 'external' })),
          h('button', { type: 'button', className: 'yy-button yy-button-ghost', onClick: copy, disabled: status === 'pending' }, h(Icon, { name: status === 'done' ? 'check' : 'copy' }), status === 'done' ? '已复制' : status === 'pending' ? '复制中…' : '复制链接')),
        h('p', { className: 'yy-address' }, SITE),
        h('div', { className: 'yy-copy-feedback', role: 'status', 'aria-live': 'polite' }, status === 'error' ? '复制失败，请选择上方链接手动复制。' : status === 'done' ? '链接已复制到剪贴板。' : ''));
    }
    const BALANCE_CSS = `
      .yy-account,.yy-balance-dock,.yy-balance-popover{--yb-bg:var(--dsw-alias-bg-layer-1,#fcfaf7);--yb-ink:var(--dsw-alias-label-primary,#252b32);--yb-muted:var(--dsw-alias-label-secondary,#676c74);--yb-line:var(--dsw-alias-border-l1,#e0ded9);color:var(--yb-ink);font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;text-align:left;box-sizing:border-box}
      .yy-account *,.yy-balance-dock *{box-sizing:border-box}
      .yy-account{padding:22px 0;margin-top:28px;border-top:1px solid var(--yb-line)}
      .yy-account h2,.yy-account p,.yy-balance-dock h2,.yy-balance-dock p{margin:0}
      .yy-account h2,.yy-balance-dock h2{font-size:17px;font-weight:650;line-height:1.4}
      .yy-account-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
      .yy-account-note{font-size:12px;color:var(--yb-muted);margin-top:5px!important;overflow-wrap:anywhere}
      .yy-account-form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;align-items:end;gap:12px;margin-top:16px}
      .yy-account-form label{display:grid;gap:6px;min-width:0;font-size:13px;font-weight:500}
      .yy-account-form input{display:block;width:100%;min-width:0;min-height:42px;border:1px solid var(--yb-line);border-radius:8px;background:var(--yb-bg);color:var(--yb-ink);font:inherit;font-size:16px;line-height:1.4;padding:9px 11px}
      .yy-account-form input:focus{outline:2px solid #bf3623;outline-offset:2px}
      .yy-account-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .yy-account-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:38px;padding:8px 12px;border:1px solid var(--yb-line);border-radius:8px;background:var(--yb-bg);color:var(--yb-ink);cursor:pointer;font:500 13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;text-decoration:none}
      .yy-account-btn:hover{border-color:var(--yb-muted)}
      .yy-account-btn[data-primary="true"]{background:#bf3623;color:#fff;border-color:#bf3623}
      .yy-account-btn[data-primary="true"]:hover{background:#a92b1b;border-color:#a92b1b}
      .yy-account-btn:disabled{opacity:.6;cursor:wait}
      .yy-account-btn:focus-visible,.yy-balance-trigger:focus-visible{outline:2px solid #bf3623;outline-offset:3px}
      .yy-account-overview{display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap}
      .yy-account-amount{display:block;font-size:28px;font-weight:650;line-height:1.4;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
      .yy-account-amount small{font-size:12px;color:var(--yb-muted);font-weight:400;margin-left:8px}
      .yy-account-feedback{margin-top:12px!important;font-size:12px;color:var(--yb-muted);overflow-wrap:anywhere}
      .yy-account-feedback[role="alert"]{color:var(--yb-ink)}
      .yy-balance-dock{position:relative;display:inline-flex;max-width:100%;min-width:0}
      .yy-balance-trigger{display:inline-flex;align-items:center;gap:7px;max-width:100%;min-height:30px;padding:4px 10px;border:1px solid var(--yb-line);border-radius:7px;background:var(--yb-bg);color:var(--yb-muted);font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;cursor:pointer;font-variant-numeric:tabular-nums}
      .yy-balance-trigger strong{color:var(--yb-ink);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .yy-balance-trigger svg{flex:none}
      .yy-balance-mark{width:6px;height:6px;border-radius:50%;background:var(--yb-muted);flex:none}
      .yy-balance-mark[data-ready="true"]{background:#2c7b60}
      .yy-balance-popover{position:fixed;z-index:2000;width:350px;max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);overflow-y:auto;overflow-x:hidden;overscroll-behavior-y:contain;scrollbar-gutter:stable;padding:20px;background:var(--yb-bg);border:1px solid var(--yb-line);border-radius:12px}
      .yy-balance-popover .yy-account-form{grid-template-columns:1fr}
      .yy-balance-popover .yy-account-overview{display:block}
      .yy-balance-popover .yy-account-actions{margin-top:14px}
      .yy-balance-popover .yy-account{padding:0;margin:0;border:0}
      .yy-account-titleline{display:flex;align-items:center;gap:8px;min-width:0}
      .yy-account .yy-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
      .yy-balance-popover h2,.yy-balance-popover p{margin:0}
      .yy-balance-popover h2{font-size:17px;font-weight:650;line-height:1.4}
      @container yy-panel (max-width:600px){.yy-account-form{grid-template-columns:1fr}.yy-account-overview{align-items:flex-start}.yy-account-actions{gap:6px}}
    `;

    // Both views share one store. Upstream tokens stay on the host; desktop keeps only an opaque local session.
    const accountStore = (() => {
      const desktop = window.location.protocol === 'dsh-app:';
      const sessionKey = 'yanyu-purge.account-session.v1';
      const validSession = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
      let session = '';
      let sessionPersistent = true;
      if (desktop) {
        try { const saved = window.localStorage.getItem(sessionKey); if (validSession(saved)) session = saved; }
        catch { sessionPersistent = false; }
      }
      let snapshot = { data: null, busy: '', error: '', sessionPersistent };
      let active = null;
      let timer = null;
      const listeners = new Set();
      const publish = (patch) => { snapshot = { ...snapshot, ...patch }; for (const fn of listeners) fn(snapshot); };
      const acceptSession = (response) => {
        if (!desktop) return;
        const value = response.headers.get('x-yanyu-session');
        if (value === null || (value !== '' && !validSession(value))) return;
        session = value;
        try {
          if (session) window.localStorage.setItem(sessionKey, session);
          else window.localStorage.removeItem(sessionKey);
          publish({ sessionPersistent: true });
        } catch { publish({ sessionPersistent: false }); }
      };
      const schedule = () => {
        clearTimeout(timer);
        if (listeners.size) timer = setTimeout(tick, Math.max(15000, snapshot.data?.refreshAfterMs || 0, snapshot.error ? 30000 : 0));
      };
      async function run(action = '', body) {
        if (active) {
          if (action && active.action === '') active.abort(); else return false;
        }
        clearTimeout(timer);
        const controller = new AbortController();
        controller.action = action;
        active = controller;
        publish({ busy: action || 'read', error: '' });
        const timeout = setTimeout(() => controller.abort('timeout'), 20000);
        try {
          const response = await fetch(`${API}/account${action ? '/' + action : ''}`, {
            method: action ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
            headers: { 'x-yanyu-client': '1', ...(desktop ? { 'x-yanyu-session-mode': 'header', ...(session ? { 'x-yanyu-session': session } : {}) } : {}), ...(action ? { 'content-type': 'application/json' } : {}) },
            ...(action ? { body: JSON.stringify(body || {}) } : {})
          });
          if (active !== controller) return false;
          acceptSession(response);
          let wire;
          try { wire = await response.json(); } catch { throw new Error('余额服务暂时没有响应，请稍后重试。'); }
          if (!response.ok || wire?.ok !== true) throw new Error(wire?.error?.message || '操作未完成，请稍后重试。');
          const data = wire.value;
          if (!data || !['signed_out', 'signed_in', 'two_factor', 'expired'].includes(data.status) || typeof data.authenticated !== 'boolean') throw new Error('余额状态格式异常，请刷新后重试。');
          if (data.balance !== null && (typeof data.balance !== 'number' || !Number.isFinite(data.balance))) throw new Error('余额格式异常，请稍后刷新。');
          if (active !== controller) return false;
          publish({ data, error: '' });
          return true;
        } catch (error) {
          if (active === controller && listeners.size) publish({ data: snapshot.data?.authenticated ? { ...snapshot.data, stale: true } : snapshot.data, error: controller.signal.aborted ? '请求超时，请稍后重试。' : error instanceof TypeError ? '连接中断，当前显示上次余额。' : error.message });
          return false;
        } finally {
          clearTimeout(timeout);
          if (active === controller) { active = null; publish({ busy: '' }); schedule(); }
        }
      }
      function tick() { if (!document.hidden) run(); else schedule(); }
      function visible() { if (!document.hidden) run(); }
      return {
        read: () => snapshot, run,
        subscribe(fn) {
          listeners.add(fn);
          if (listeners.size === 1) { document.addEventListener('visibilitychange', visible); window.addEventListener('focus', visible); run(); }
          return () => {
            listeners.delete(fn);
            if (!listeners.size) { clearTimeout(timer); document.removeEventListener('visibilitychange', visible); window.removeEventListener('focus', visible); const prior = active; active = null; prior?.abort(); snapshot = { ...snapshot, busy: '' }; }
          };
        }
      };
    })();
    function useAccount() {
      const [value, setValue] = useState(accountStore.read);
      useEffect(() => { const dispose = accountStore.subscribe(setValue); setValue(accountStore.read()); return dispose; }, []);
      return value;
    }
    const money = (value) => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(value) : '—';
    function AccountCard({ account, compact = false }) {
      const { data, busy, error } = account;
      const [email, setEmail] = useState('');
      const [password, setPassword] = useState('');
      const [code, setCode] = useState('');
      const id = useId();
      const twoFactor = data?.status === 'two_factor';
      const submit = (event) => {
        event.preventDefault();
        if (busy) return;
        if (twoFactor) { const value = code; setCode(''); accountStore.run('2fa', { code: value }); }
        else { const value = password; setPassword(''); accountStore.run('login', { email: email.trim(), password: value }); }
      };
      const time = data?.updatedAt ? new Date(data.updatedAt) : null;
      const updated = time && Number.isFinite(time.getTime()) ? time.toLocaleTimeString('zh-CN', { hour12: false }) : '';
      return h('section', { className: 'yy-account', 'aria-label': '燕语账号与余额' },
        h('style', null, BALANCE_CSS),
        !compact ? h('div', { className: 'yy-account-head' }, h('div', { className: 'yy-account-titleline' }, h(Bird, { size: 24, color: '#bf3623' }), h('h2', null, '燕语余额')), h('a', { className: 'yy-account-btn', href: `${SITE}dashboard`, target: '_blank', rel: 'noopener noreferrer' }, '官网控制台', h(Icon, { name: 'external' }))) : null,
        data?.authenticated ? h('div', null,
          h('div', { className: 'yy-account-overview' }, h('div', null,
            h('p', { className: 'yy-account-note' }, data.emailMasked || data.displayName || '已登录燕语'),
            h('strong', { className: 'yy-account-amount' }, money(data.balance), h('small', null, 'USD')),
            h('p', { className: 'yy-account-note' }, updated ? `最近更新 ${updated} · 每 15 秒检查` : '余额等待更新')),
            h('div', { className: 'yy-account-actions' },
              h('button', { type: 'button', className: 'yy-account-btn', disabled: Boolean(busy), onClick: () => accountStore.run('refresh') }, busy === 'refresh' ? '刷新中…' : '刷新余额'),
              h('button', { type: 'button', className: 'yy-account-btn', disabled: Boolean(busy), onClick: () => accountStore.run('logout') }, busy === 'logout' ? '退出中…' : '退出登录'))))
          : h('div', null,
            h('p', { className: 'yy-account-note' }, twoFactor ? '输入验证器中的 6 位验证码，完成登录。' : '登录后，在对话框下方随时查看余额。'),
            h('form', { className: 'yy-account-form', onSubmit: submit },
              twoFactor ? h('label', { htmlFor: `${id}-code` }, '动态验证码', h('input', { id: `${id}-code`, type: 'text', inputMode: 'numeric', autoComplete: 'one-time-code', pattern: '[0-9]{6}', maxLength: 6, required: true, value: code, onChange: (e) => setCode(e.target.value), disabled: Boolean(busy) })) : h(React.Fragment, null,
                h('label', { htmlFor: `${id}-email` }, '邮箱', h('input', { id: `${id}-email`, type: 'email', name: 'email', autoComplete: 'username', maxLength: 254, required: true, value: email, onChange: (e) => setEmail(e.target.value), disabled: Boolean(busy) })),
                h('label', { htmlFor: `${id}-password` }, '密码', h('input', { id: `${id}-password`, type: 'password', name: 'password', autoComplete: 'current-password', maxLength: 256, required: true, value: password, onChange: (e) => setPassword(e.target.value), disabled: Boolean(busy) }))),
              h('button', { type: 'submit', className: 'yy-account-btn', 'data-primary': true, disabled: Boolean(busy) }, busy === 'login' || busy === '2fa' ? '正在登录…' : twoFactor ? '验证并登录' : '登录并查询')),
            twoFactor ? h('button', { type: 'button', className: 'yy-account-btn', disabled: Boolean(busy), onClick: () => accountStore.run('logout') }, '返回邮箱登录') : null,
            h('p', { className: 'yy-account-note' }, account.sessionPersistent === false ? '密码仅用于登录；登录状态仅在当前窗口保留，重启后需重新登录。' : '密码仅用于登录；登录状态保存在本机，重启后自动恢复。')),
        data?.authenticated && account.sessionPersistent === false ? h('p', { className: 'yy-account-note', role: 'status' }, '登录状态仅在当前窗口保留，重启后需重新登录。') : null,
        error || data?.message ? h('p', { className: 'yy-account-feedback', role: 'alert' }, error || data.message) : null,
        h('span', { className: 'yy-sr', role: 'status', 'aria-live': 'polite' }, busy === 'login' ? '正在登录燕语' : data?.authenticated ? '燕语账号已登录' : ''));
    }
    function BalanceDock() {
      const account = useAccount();
      const [open, setOpen] = useState(false);
      const [position, setPosition] = useState({ left: 12, top: 12 });
      const dock = useRef(null);
      const trigger = useRef(null);
      const popover = useRef(null);
      const id = useId();
      useEffect(() => {
        if (!open) return;
        const place = () => {
          const button = trigger.current?.getBoundingClientRect();
          const box = popover.current?.getBoundingClientRect();
          if (!button || !box) return;
          const viewport = window.visualViewport;
          const left = (viewport?.offsetLeft || 0) + 12;
          const top = (viewport?.offsetTop || 0) + 12;
          const maxWidth = Math.max(0, (viewport?.width || window.innerWidth) - 24);
          const maxHeight = Math.max(0, (viewport?.height || window.innerHeight) - 24);
          const width = Math.min(box.width, maxWidth);
          const height = Math.min(box.height, maxHeight);
          const next = { left: Math.max(left, Math.min(left + maxWidth - width, button.left)), top: Math.max(top, Math.min(top + maxHeight - height, button.top - height - 8)), maxWidth, maxHeight };
          setPosition((previous) => Object.keys(next).every((key) => previous[key] === next[key]) ? previous : next);
        };
        const scroll = (event) => { if (!(event.target instanceof Node && popover.current?.contains(event.target))) place(); };
        const outside = (event) => { if (!dock.current?.contains(event.target) && !popover.current?.contains(event.target)) setOpen(false); };
        const escape = (event) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null;
        if (popover.current) observer?.observe(popover.current);
        place();
        popover.current?.querySelector('input,button')?.focus({ preventScroll: true });
        const viewport = window.visualViewport;
        window.addEventListener('resize', place); window.addEventListener('scroll', scroll, true);
        viewport?.addEventListener('resize', place); viewport?.addEventListener('scroll', place);
        document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
        return () => { observer?.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', scroll, true); viewport?.removeEventListener('resize', place); viewport?.removeEventListener('scroll', place); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
      }, [open]);
      const data = account.data;
      const ready = data?.authenticated && !data.stale && !account.error;
      return h('div', { className: 'yy-balance-dock', ref: dock }, h('style', null, BALANCE_CSS),
        h('button', { className: 'yy-balance-trigger', type: 'button', ref: trigger, onClick: () => setOpen(!open), 'aria-expanded': open, 'aria-controls': open ? id : undefined, 'aria-label': data?.authenticated ? `燕语余额 ${money(data.balance)}，打开账号面板` : '登录燕语查看余额' },
          h(Bird, { size: 16 }), h('span', null, '燕语余额'), h('strong', null, data?.authenticated ? money(data.balance) : '登录查询'), h('span', { className: 'yy-balance-mark', 'data-ready': ready, 'aria-hidden': true }), data?.authenticated && !ready ? h('span', null, '待更新') : null),
        open ? createPortal(h('div', { className: 'yy-balance-popover', id, ref: popover, role: 'region', 'aria-label': '燕语余额浮窗', style: position },
          h('div', { className: 'yy-account-head' }, h('h2', null, '燕语余额'), h('button', { type: 'button', className: 'yy-account-btn', onClick: () => { setOpen(false); trigger.current?.focus(); }, 'aria-label': '收起余额浮窗' }, '收起')),
          h(AccountCard, { account, compact: true })), document.body) : null);
    }
    function AccountPanel() { return h(AccountCard, { account: useAccount() }); }
    function YanyuPanel() {
      const [state, setState] = useState(null);
      const [loading, setLoading] = useState(true);
      const [pending, setPending] = useState(null);
      const [error, setError] = useState('');
      const alive = useRef(false);
      const request = useRef(null);
      const knownState = useRef(null);
      const restoreFocus = useRef(null);
      const refresh = async (next, quiet = false) => {
        const changing = next !== undefined;
        const operation = typeof next === 'boolean' ? 'enabled' : next ? 'scheme' : 'state';
        if (request.current) {
          // A user choice takes precedence over an in-flight background read.
          if (changing && request.current.operation === 'state') request.current.abort();
          else return;
        }
        const controller = new AbortController();
        controller.operation = operation;
        request.current = controller;
        if (changing && document.activeElement?.matches('input[type="radio"],.yy-master-switch')) restoreFocus.current = document.activeElement;
        if (changing) setPending(operation === 'enabled' ? 'enabled' : next); else if (!quiet) setLoading(true);
        try {
          const value = await api(operation, operation === 'enabled' ? { enabled: next } : next ? { scheme: next } : undefined, controller.signal);
          if (!alive.current || request.current !== controller) return;
          knownState.current = value;
          setState(value);
          setError('');
        } catch (err) {
          if (alive.current && request.current === controller && err.name !== 'AbortError') {
            setError(changing ? '切换尚未确认，请刷新状态后重试。' : (err instanceof TypeError ? '连接暂时中断，请重试。' : err.message || '连接暂时中断，请重试。'));
          }
        } finally {
          if (request.current === controller) {
            request.current = null;
            if (alive.current) { setLoading(false); setPending(null); }
          }
        }
      };
      useEffect(() => {
        if (pending || loading) return;
        const target = restoreFocus.current;
        restoreFocus.current = null;
        if (target?.isConnected && !error && document.activeElement === document.body) target.focus({ preventScroll: true });
      }, [pending, loading, error]);
      useEffect(() => {
        alive.current = true;
        refresh();
        const poll = setInterval(() => { if (!document.hidden) refresh(undefined, true); }, 3000);
        const visible = () => { if (!document.hidden) refresh(undefined, true); };
        document.addEventListener('visibilitychange', visible);
        return () => { alive.current = false; clearInterval(poll); document.removeEventListener('visibilitychange', visible); request.current?.abort(); request.current = null; };
      }, []);
      return h('div', { className: 'yy', role: 'region', 'aria-label': '破甲工作台', tabIndex: 0 }, h('style', null, CSS),
        h('header', { className: 'yy-masthead' }, h('div', { className: 'yy-shell' },
          h('div', { className: 'yy-brand-row' },
            h('div', { className: 'yy-brand' }, h(Bird, { size: 46, seal: true }), h('div', null, h('h1', null, '破甲工作台'), h('p', null, '燕子 · DSH'))),
            h('a', { className: 'yy-site-link', href: SITE, target: '_blank', rel: 'noopener noreferrer' }, '燕语官网', h(Icon, { name: 'external', size: 15 }))),
          h('div', { className: 'yy-intro' }, h('h2', null, '把系统提示词，', h('span', null, '变成你的主场。')), h('p', null, '红黄蓝绿，一键切换。下一次请求，你的方案就位。')))),
        h('div', { className: 'yy-shell' },
          h('section', { className: 'yy-master', 'aria-label': '提示词注入总开关' },
            h('div', null, h('h2', null, '提示词注入'), h('p', null, '切换后下一次请求生效；重载后按启动配置恢复。')),
            h('button', { type: 'button', role: 'switch', className: 'yy-master-switch', 'aria-label': '提示词注入总开关', 'aria-checked': Boolean(state && state.enabled !== false && state.mode !== 'off'), disabled: !state || loading || Boolean(pending) || Boolean(error), onClick: () => refresh(state.enabled === false || state.mode === 'off') },
              h('span', { className: 'yy-switch-track', 'aria-hidden': true }), pending === 'enabled' ? '切换中…' : state ? state.enabled === false || state.mode === 'off' ? '已关闭' : '已开启' : '读取中')),
          h('section', { 'aria-label': '提示词方案' },
            h('div', { className: 'yy-section-heading' }, h('div', null, h('h2', null, '选择你的燕子'), h('p', null, '四种方案，一次选择。')),
              h('span', { className: 'yy-connection', 'data-online': Boolean(state && !error), role: 'status' }, h('span', { className: 'yy-dot', 'aria-hidden': true }), loading ? '正在连接' : error ? '连接待确认' : '面板已连接')),
            h(SchemeChoices, { state, loading, pending, error, onPick: (id) => { if (id !== knownState.current?.scheme) refresh(id); } }),
            h('p', { className: 'yy-selection-note' }, pending ? '正在保存选择…' : '切换后下一次请求生效，无需重启。'),
            error ? h('div', { className: 'yy-error', role: 'alert' }, h('span', null, error), h('button', { type: 'button', className: 'yy-retry', disabled: loading, onClick: () => refresh() }, loading ? '正在刷新…' : '刷新状态')) : null,
            h(InjectionStatus, { state, error })),
          h(AccountPanel),
          h('div', { className: 'yy-links' }, h(RelayCard),
            h('section', { className: 'yy-community' }, h('h2', null, '交流与反馈'), h('p', null, '插件更新、使用交流，或是一个新想法，都可以来群里聊聊。'), h('p', { className: 'yy-group-number' }, 'QQ 交流群 · 740438905'), h('a', { className: 'yy-join', href: GROUP, target: '_blank', rel: 'noopener noreferrer' }, '加入交流群', h(Icon, { name: 'arrow' })))),
          h('footer', { className: 'yy-footer' }, h('span', null, '燕语 FreeCoding'), h('span', null, '一语即达，自在编码'))));
    }
    return {
      inject: ['slots'],
      apply(ctx) {
        let slots;
        try { slots = ctx.get ? ctx.get('slots') : null; } catch { slots = null; }
        if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') { console.warn('[yanyu-purge] slots 服务不可用，面板未注册'); return; }
        const seats = [
          ['sidebar.panellist', { name: 'sidebar.panellist', id: 'yanyu-purge', order: 24, label: () => '破甲工作台' }, (props) => h(Bird, { size: props?.size || 20 })],
          ['main', { name: 'main', key: 'yanyu-purge' }, () => h(YanyuPanel)],
          ['conversation.composer.dock', { name: 'conversation.composer.dock', id: 'yanyu.balance', order: 20 }, () => h(BalanceDock)]
        ];
        for (const [slot, desc, render] of seats) {
          try { ctx.effect(() => slots.inject(slot, () => slots.register(desc, render)), `yanyu-purge: ${slot}`); }
          catch (err) { console.warn(`[yanyu-purge] ${slot} 注册失败:`, err?.message || err); }
        }
      }
    };
  }
});

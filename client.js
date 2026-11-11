/** The host owns prompt contents; this DSH panel displays names and observed state only. */
window.__ModuleLoader__.load({
  id: '@local/dsh-yanyu-purge',
  factory: (require) => {
    const React = require('react');
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
      .yy{--yy-night:#0c1d40;--yy-sky:#bad7eb;--yy-seal:#bf3623;--yy-seal-hover:#a92b1b;--yy-paper:var(--dsw-alias-bg-layer-1,#faf7f0);--yy-ink:var(--dsw-alias-label-primary,#29251f);--yy-muted:var(--dsw-alias-label-secondary,#6b6259);--yy-line:var(--dsw-alias-border-l1,#e4ded3);--yy-tint:color-mix(in srgb,var(--yy-paper) 94%,var(--yy-seal));--yy-accent-ink:color-mix(in srgb,var(--yy-ink) 42%,var(--yy-seal));--yy-serif:"Noto Serif SC","Source Han Serif SC","Songti SC","STSong","SimSun",serif;box-sizing:border-box;width:100%;min-width:0;min-height:100%;background:var(--yy-paper);color:var(--yy-ink);font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;container:yy-panel / inline-size;scrollbar-color:var(--yy-muted) var(--yy-paper)}
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
      .yy-brand-row{display:flex;align-items:center;justify-content:space-between;gap:20px}
      .yy-brand{display:flex;align-items:center;gap:14px;min-width:0}
      .yy-brand h1{font:800 27px/1.25 var(--yy-serif);letter-spacing:.04em}
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
        if (request.current) {
          // A user choice takes precedence over an in-flight background read.
          if (next && request.current.operation === 'state') request.current.abort();
          else return;
        }
        const controller = new AbortController();
        controller.operation = next ? 'scheme' : 'state';
        request.current = controller;
        if (next && document.activeElement?.matches('input[type="radio"]')) restoreFocus.current = document.activeElement;
        if (next) setPending(next); else if (!quiet) setLoading(true);
        try {
          const value = await api(next ? 'scheme' : 'state', next ? { scheme: next } : undefined, controller.signal);
          if (!alive.current || request.current !== controller) return;
          knownState.current = value;
          setState(value);
          setError('');
        } catch (err) {
          if (alive.current && request.current === controller && err.name !== 'AbortError') {
            setError(next ? '切换尚未确认，请刷新状态后重试。' : (err instanceof TypeError ? '连接暂时中断，请重试。' : err.message || '连接暂时中断，请重试。'));
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
      return h('div', { className: 'yy' }, h('style', null, CSS),
        h('header', { className: 'yy-masthead' }, h('div', { className: 'yy-shell' },
          h('div', { className: 'yy-brand-row' },
            h('div', { className: 'yy-brand' }, h(Bird, { size: 46, seal: true }), h('div', null, h('h1', null, '燕子'), h('p', null, 'DSH 提示词工作台'))),
            h('a', { className: 'yy-site-link', href: SITE, target: '_blank', rel: 'noopener noreferrer' }, '燕语官网', h(Icon, { name: 'external', size: 15 }))),
          h('div', { className: 'yy-intro' }, h('h2', null, '四只燕子，', h('span', null, '随心切换。')), h('p', null, '选择你的表达方式，下一次对话即刻启程。')))),
        h('div', { className: 'yy-shell' },
          h('section', { 'aria-label': '提示词方案' },
            h('div', { className: 'yy-section-heading' }, h('div', null, h('h2', null, '选择你的燕子'), h('p', null, '四种方案，一次选择。')),
              h('span', { className: 'yy-connection', 'data-online': Boolean(state && !error), role: 'status' }, h('span', { className: 'yy-dot', 'aria-hidden': true }), loading ? '正在连接' : error ? '连接待确认' : '面板已连接')),
            h(SchemeChoices, { state, loading, pending, error, onPick: (id) => { if (id !== knownState.current?.scheme) refresh(id); } }),
            h('p', { className: 'yy-selection-note' }, pending ? '正在保存选择…' : '切换后下一次请求生效，无需重启。'),
            error ? h('div', { className: 'yy-error', role: 'alert' }, h('span', null, error), h('button', { type: 'button', className: 'yy-retry', disabled: loading, onClick: () => refresh() }, loading ? '正在刷新…' : '刷新状态')) : null,
            h(InjectionStatus, { state, error })),
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
          ['sidebar.panellist', { name: 'sidebar.panellist', id: 'yanyu-purge', order: 24, label: () => '燕子' }, (props) => h(Bird, { size: props?.size || 20 })],
          ['main', { name: 'main', key: 'yanyu-purge' }, () => h(YanyuPanel)]
        ];
        for (const [slot, desc, render] of seats) {
          try { ctx.effect(() => slots.inject(slot, () => slots.register(desc, render)), `yanyu-purge: ${slot}`); }
          catch (err) { console.warn(`[yanyu-purge] ${slot} 注册失败:`, err?.message || err); }
        }
      }
    };
  }
});

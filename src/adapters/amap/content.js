(() => {
  const state = { step: 'IDLE', running: false, aborted: false, logs: [] };
  const TEST_ROUTE = {
    start: '上海交通大学闵行校区',
    end: '沧源二村',
    waypoint: '上海交通大学闵行校区北1门'
  };
  const emit = (type, detail = {}) => chrome.runtime.sendMessage({ type, ...detail }).catch(() => {});
  const log = (level, message) => {
    const item = { at: new Date().toISOString(), level, message };
    state.logs.push(item); emit('GPX2AMAP_LOG', item);
  };
  const visible = (el) => !!el && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const input = (label) => [...document.querySelectorAll('input')].find((el) =>
    el.getAttribute('aria-label') === label || el.placeholder === label || el.getAttribute('placeholder') === label);
  const routePage = () => location.hostname === 'www.amap.com' && location.pathname.startsWith('/ssr/dir');
  const waitFor = async (predicate, timeout = 8000, label = '页面状态') => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (state.aborted) throw new Error('用户已中止');
      if (predicate()) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`${label}等待超时（${timeout}ms）`);
  };
  const setStep = (step, message) => { state.step = step; log('info', `${step}: ${message}`); emit('GPX2AMAP_STEP', { step, message }); };
  const clickCycling = async () => {
    const img = [...document.querySelectorAll('img')].find((el) => el.alt === '骑行');
    const target = img?.closest('button,[role="button"],div');
    if (!target) throw new Error('未找到骑行模式控件');
    target.click();
    await waitFor(() => document.body.innerText.includes('自行车'), 5000, '骑行模式');
  };
  const typeAndChoose = async (field, value) => {
    const el = input(field);
    if (!el) throw new Error(`未找到输入框：${field}`);
    el.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => [...document.querySelectorAll('body *')].some((node) => visible(node) && node.textContent?.trim().includes(value)), 6000, `搜索建议 ${value}`);
    // 高德新版建议项的点击监听挂在 suggestionItem 容器上；不要点击其
    // 内层 name/content span，否则文本可见但不会提交 POI。
    const candidate = [...document.querySelectorAll('[class*="suggestionItem"], [role="option"], li')]
      .filter((node) => visible(node) && node.textContent?.trim().includes(value))
      .sort((a, b) => a.textContent.trim().length - b.textContent.trim().length)[0]
      || [...document.querySelectorAll('body *')]
        .filter((node) => visible(node) && node.textContent?.trim().includes(value) && !['INPUT','TEXTAREA'].includes(node.tagName))
        .sort((a, b) => a.textContent.trim().length - b.textContent.trim().length)[0];
    if (!candidate) throw new Error(`未找到可确认的建议项：${value}`);
    candidate.click();
    await waitFor(() => document.activeElement !== el && !!el.value, 4000, `确认 ${field}`);
    return el.value;
  };
  const addWaypointField = () => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'add' || b.querySelector('img[alt="add"]'));
    if (!btn) throw new Error('未找到添加途经点按钮');
    btn.click();
  };
  const run = async (route = TEST_ROUTE) => {
    if (state.running) throw new Error('已有任务正在执行');
    state.running = true; state.aborted = false; state.logs = [];
    try {
      setStep('CHECK_PAGE', '检查当前是否为高德新版路线页');
      if (!routePage()) throw new Error('当前不是 https://www.amap.com/ssr/dir 路线页');
      setStep('ENTER_ROUTE_PLANNER', '已在路线规划页面');
      setStep('SELECT_BICYCLING', '选择骑行模式'); await clickCycling();
      setStep('SET_START', `设置起点：${route.start}`); await typeAndChoose('请输入起点', route.start);
      setStep('VERIFY_START', '起点已从建议列表确认');
      setStep('SET_END', `设置终点：${route.end}`); await typeAndChoose('请输入终点', route.end);
      setStep('VERIFY_END', '终点已从建议列表确认');
      setStep('ADD_WAYPOINT', '添加一个途经点输入框'); addWaypointField();
      await waitFor(() => !!input('请输入途经点1'), 3000, '途经点输入框');
      setStep('VERIFY_WAYPOINT', `设置途经点：${route.waypoint}`); await typeAndChoose('请输入途经点1', route.waypoint);
      setStep('WAIT_ROUTE_RESULT', '等待路线重新规划');
      await waitFor(() => [...document.querySelectorAll('body *')].some((n) => visible(n) && /分钟|公里/.test(n.textContent || '')), 10000, '路线结果');
      setStep('VERIFY_ROUTE', '页面存在路线结果；请人工核对地图改道及途经点标记');
      setStep('DONE', 'P0 操作完成，路线几何仍需人工对照确认');
      emit('GPX2AMAP_DONE', { route });
    } catch (error) {
      state.step = 'FAILED'; log('error', error.message); emit('GPX2AMAP_FAILED', { message: error.message });
      throw error;
    } finally { state.running = false; }
  };
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'GPX2AMAP_DETECT') sendResponse({ ok: true, isRoutePage: routePage(), url: location.href, inputs: [...document.querySelectorAll('input[aria-label],input[placeholder]')].map((el) => el.getAttribute('aria-label') || el.placeholder) });
    if (message?.type === 'GPX2AMAP_RUN') { run(message.route || TEST_ROUTE).then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ ok: false, error: e.message })); return true; }
    if (message?.type === 'GPX2AMAP_ABORT') { state.aborted = true; log('warn', '收到中止请求'); sendResponse({ ok: true }); }
  });
  emit('GPX2AMAP_READY', { isRoutePage: routePage() });
})();

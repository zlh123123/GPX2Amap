import { buildAmapUrl, describeRoute, parseGpx } from '../src/core/gpx-route.mjs';
const $ = (id) => document.getElementById(id); let currentUrl = '';
const status = (text, error = false) => { $('status').textContent = text; $('status').className = error ? 'error' : ''; };
const append = (text) => { const el = document.createElement('div'); el.className = 'log'; el.textContent = text; $('logs').prepend(el); };
const setEnabled = (enabled) => { $('copy').disabled = !enabled; $('open').disabled = !enabled; };
async function handleFile(file) {
  if (!file?.name.toLowerCase().endsWith('.gpx')) { status('请选择 .gpx 文件', true); return; }
  try {
    status(`正在处理：${file.name}`); setEnabled(false); $('result').hidden = true;
    const points = parseGpx(await file.text()); const summary = describeRoute(points);
    currentUrl = buildAmapUrl(points, { alreadyGcj02: $('gcj').checked });
    $('summary').textContent = `${file.name}：${summary.trackPoints} 个轨迹点，约 ${summary.distanceKm.toFixed(1)} km，已选 ${summary.waypointCount} 个途经点`;
    $('url').textContent = currentUrl; $('result').hidden = false; setEnabled(true); status('已生成高德链接'); append(`${file.name} 处理完成`);
  } catch (error) { currentUrl = ''; setEnabled(false); status(error.message, true); append(error.message); }
}
$('drop').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', (event) => handleFile(event.target.files[0]));
for (const eventName of ['dragenter', 'dragover']) $('drop').addEventListener(eventName, (event) => { event.preventDefault(); $('drop').classList.add('drag'); });
for (const eventName of ['dragleave', 'drop']) $('drop').addEventListener(eventName, (event) => { event.preventDefault(); $('drop').classList.remove('drag'); });
$('drop').addEventListener('drop', (event) => handleFile(event.dataTransfer.files[0]));
$('gcj').addEventListener('change', () => { if ($('file').files[0]) handleFile($('file').files[0]); });
$('copy').addEventListener('click', async () => { await navigator.clipboard.writeText(currentUrl); status('链接已复制'); });
$('open').addEventListener('click', () => { if (currentUrl) chrome.tabs.create({ url: currentUrl }); });

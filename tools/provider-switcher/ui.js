const $ = (id) => document.getElementById(id);
let status = null;
let saving = false;
let changed = false;
const storedTheme = localStorage.getItem('codex-provider-theme');
if (storedTheme) document.documentElement.dataset.theme = storedTheme;
$('theme').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme === 'dark' || !document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
  localStorage.setItem('codex-provider-theme', dark ? 'light' : 'dark');
});
function selectedProvider() { return document.querySelector('input[name=provider]:checked')?.value; }
function selectedModel() { return document.querySelector('input[name=model]:checked')?.value; }
function message(text, error = false) {
  $('message').hidden = !text;
  $('message').textContent = text;
  $('message').className = error ? 'error' : '';
}
async function api(path, options) {
  const res = await fetch(path, options);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || '无法完成操作');
  return body;
}
function updateSelection() {
  const go = selectedProvider() === 'opencode-go';
  $('model-section').hidden = !go;
  const same = status && selectedProvider() === status.provider && (!go || selectedModel() === status.model);
  $('apply').disabled = saving || !status || same || go && !selectedModel();
  $('apply').textContent = saving ? '正在保存…' : same ? status.savedAt ? '已保存 · 重启后新建聊天' : '已是此配置' : go ? '保存 Go 模型设置' : '恢复原生 Codex 设置';
}
function renderModels(models) {
  $('models').replaceChildren();
  const usable = models.filter(model => model.toolPassed);
  $('model-count').textContent = `${usable.length} 个已验证`;
  for (const model of usable) {
    const label = document.createElement('label'); label.className = 'model-row';
    const input = document.createElement('input'); input.type = 'radio'; input.name = 'model'; input.value = model.id;
    input.checked = model.id === status.model || !usable.some(m => m.id === status.model) && model === usable[0];
    const name = document.createElement('span'); name.className = 'model-name'; name.textContent = model.name;
    const check = document.createElement('span'); check.className = 'model-check'; check.textContent = '工具已验证';
    label.append(input, name, check); $('models').append(label);
  }
  if (!usable.length) {
    const text = document.createElement('p'); text.className = 'muted'; text.textContent = '尚无通过工具调用验证的模型。'; $('models').append(text);
  }
}
async function loadStatus() {
  try {
    status = await api('/api/status');
    const name = status.provider === 'opencode-go' ? `OpenCode Go · ${status.models.find(m => m.id === status.model)?.name || status.model}` : `Codex / OpenAI · ${status.model || '原生默认模型'}`;
    $('configured').textContent = `已保存配置：${name}`;
    document.querySelector(`input[name=provider][value="${status.provider === 'opencode-go' ? 'opencode-go' : 'openai'}"]`).checked = true;
    renderModels(status.models);
    document.querySelector('input[name=provider][value="opencode-go"]').disabled = !status.configured;
    updateSelection();
  } catch (error) { message(error.message, true); $('configured').textContent = '配置读取失败'; }
}
function formatTime(time, full = false) {
  const date = new Date(time);
  if (!Number.isFinite(date.getTime())) return '重置时间暂不可用';
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', ...(full ? { month: 'numeric', day: 'numeric' } : {}), hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}
async function loadUsage() {
  $('refresh').disabled = true;
  try {
    const result = await api('/api/usage');
    $('usage-data').replaceChildren();
    if (result.error) {
      const text = document.createElement('p'); text.className = 'muted error'; text.textContent = result.error; $('usage-data').append(text);
    }
    for (const window of result.windows) {
      const row = document.createElement('div'); row.className = 'usage-row';
      const name = document.createElement('span'); name.className = 'usage-label'; name.textContent = window.label;
      const track = document.createElement('div'); track.className = 'track'; track.setAttribute('role', 'progressbar'); track.setAttribute('aria-label', `${window.label}已用`); track.setAttribute('aria-valuenow', String(window.usedPercent)); track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', '100');
      const fill = document.createElement('span'); fill.style.width = `${window.usedPercent}%`; track.append(fill);
      const value = document.createElement('span'); value.className = 'usage-value'; value.textContent = `已用 ${window.usedPercent}%`;
      const reset = document.createElement('span'); reset.className = 'reset'; reset.textContent = window.resetsAt ? `${formatTime(window.resetsAt, true)} 重置 · 北京时间` : '重置时间暂不可用';
      row.append(name, track, value, reset); $('usage-data').append(row);
    }
    $('usage-time').textContent = `更新于 ${formatTime(result.updatedAt * 1000)}`;
  } catch (error) { $('usage-data').textContent = error.message; }
  finally { $('refresh').disabled = false; }
}
$('selection').addEventListener('change', () => { changed = true; message(''); updateSelection(); });
$('selection').addEventListener('submit', async (event) => {
  event.preventDefault(); if (saving || $('apply').disabled) return;
  saving = true; updateSelection(); message('');
  try {
    await api('/api/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: selectedProvider(), model: selectedModel(), revision: status.revision }) });
    changed = false;
    await loadStatus();
    message('设置已保存，待桌面 App 重新读取。任务结束后重启 Codex，并新建聊天。');
  } catch (error) { message(error.message, true); }
  finally { saving = false; updateSelection(); }
});
$('refresh').addEventListener('click', () => { loadUsage(); if (!changed) loadStatus(); });
loadStatus(); loadUsage();
setInterval(loadUsage, 60000);

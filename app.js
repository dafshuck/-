const STORAGE_KEY = 'para.messages.v1';
const chat = document.querySelector('#chat');
const input = document.querySelector('#input');
const sendBtn = document.querySelector('#sendBtn');
const composer = document.querySelector('.composer');
const typing = document.querySelector('#typing');
const subtitle = document.querySelector('#subtitle');
const statusDot = document.querySelector('#statusDot');
const sheet = document.querySelector('#sheet');
const sheetBackdrop = document.querySelector('#sheetBackdrop');
const infoDialog = document.querySelector('#infoDialog');

let messages = loadMessages();
let sending = false;

if (!messages.length) {
  messages = [{ id: crypto.randomUUID(), role: 'assistant', content: '我在。', ts: Date.now() }];
  persist();
}

renderAll();
checkHealth();
registerSW();

input.addEventListener('input', () => {
  resizeInput();
  composer.classList.toggle('has-text', Boolean(input.value.trim()));
});
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    sendCurrent();
  }
});

sendBtn.addEventListener('click', sendCurrent);
document.querySelector('#menuBtn').addEventListener('click', openSheet);
document.querySelector('#closeSheetBtn').addEventListener('click', closeSheet);
sheetBackdrop.addEventListener('click', closeSheet);
document.querySelector('#installBtn').addEventListener('click', () => { closeSheet(); infoDialog.showModal(); });
document.querySelector('#dialogOk').addEventListener('click', () => infoDialog.close());
document.querySelector('#clearBtn').addEventListener('click', clearHistory);
document.querySelector('#exportBtn').addEventListener('click', exportHistory);
document.querySelector('#backBtn').addEventListener('click', () => window.history.length > 1 ? history.back() : undefined);
document.querySelector('#voiceBtn').addEventListener('click', startVoiceInput);
document.querySelector('#plusBtn').addEventListener('click', () => input.focus());

async function sendCurrent() {
  const text = input.value.trim();
  if (!text || sending) return;
  messages.push({ id: crypto.randomUUID(), role: 'user', content: text, ts: Date.now() });
  input.value = '';
  resizeInput();
  composer.classList.remove('has-text');
  persist();
  renderAll();
  await requestReply();
}

async function requestReply() {
  sending = true;
  typing.hidden = false;
  subtitle.textContent = '正在输入…';
  scrollBottom();
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messages.map(({ role, content }) => ({ role, content })) })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || '发送失败');
    messages.push({ id: crypto.randomUUID(), role: 'assistant', content: data.text, ts: Date.now() });
  } catch (error) {
    messages.push({ id: crypto.randomUUID(), role: 'assistant', content: `［连接提示］${error.message}`, ts: Date.now(), systemNotice: true });
  } finally {
    sending = false;
    typing.hidden = true;
    subtitle.textContent = '在线';
    persist();
    renderAll();
  }
}

function renderAll() {
  chat.innerHTML = '';
  let lastDay = '';
  for (const msg of messages) {
    const d = new Date(msg.ts);
    const day = dateKey(d);
    if (day !== lastDay) {
      const label = document.createElement('div');
      label.className = 'day-label';
      label.textContent = formatDay(d);
      chat.appendChild(label);
      lastDay = day;
    }
    const row = document.createElement('div');
    row.className = `row ${msg.role === 'user' ? 'mine' : 'theirs'}`;
    const avatar = document.createElement('div');
    avatar.className = `avatar ${msg.role === 'user' ? 'me-avatar' : 'para-avatar'}`;
    avatar.textContent = msg.role === 'user' ? '我' : '帕';
    const wrap = document.createElement('div');
    wrap.className = 'bubble-wrap';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = msg.content;
    if (msg.systemNotice) bubble.style.opacity = '.72';
    const time = document.createElement('div');
    time.className = 'msg-time';
    time.textContent = d.toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit', hour12:false });
    wrap.append(bubble, time);
    row.append(avatar, wrap);
    chat.appendChild(row);
  }
  scrollBottom();
}

function loadMessages() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}
function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); }
function resizeInput() { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 126)}px`; }
function scrollBottom() { requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; }); }
function dateKey(d) { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
function formatDay(d) {
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (dateKey(d) === dateKey(today)) return '今天';
  if (dateKey(d) === dateKey(yesterday)) return '昨天';
  return d.toLocaleDateString('zh-CN', { month:'numeric', day:'numeric', weekday:'short' });
}

function openSheet() { sheetBackdrop.hidden = false; sheet.classList.add('open'); sheet.setAttribute('aria-hidden', 'false'); }
function closeSheet() { sheet.classList.remove('open'); sheet.setAttribute('aria-hidden', 'true'); setTimeout(() => sheetBackdrop.hidden = true, 220); }
function clearHistory() {
  if (!confirm('清空这台设备上的全部聊天记录？')) return;
  messages = [{ id: crypto.randomUUID(), role:'assistant', content:'我在。', ts:Date.now() }];
  persist(); renderAll(); closeSheet();
}
function exportHistory() {
  const text = messages.map(m => `[${new Date(m.ts).toLocaleString('zh-CN')}] ${m.role === 'user' ? '我' : '帕拉'}：\n${m.content}`).join('\n\n');
  const blob = new Blob([text], { type:'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `帕拉聊天记录-${new Date().toISOString().slice(0,10)}.txt`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500); closeSheet();
}

async function checkHealth() {
  try {
    const r = await fetch('/api/health'); const data = await r.json();
    if (!data.configured) { subtitle.textContent = '等待接入'; statusDot.style.background = '#aaa'; }
  } catch { subtitle.textContent = '离线'; statusDot.style.background = '#aaa'; }
}

function startVoiceInput() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { alert('当前浏览器不支持网页语音识别；iPhone 可直接使用系统键盘的麦克风。'); return; }
  const rec = new Recognition(); rec.lang = 'zh-CN'; rec.interimResults = true;
  rec.onstart = () => subtitle.textContent = '正在听…';
  rec.onresult = (e) => {
    input.value = Array.from(e.results).map(r => r[0].transcript).join('');
    resizeInput(); composer.classList.toggle('has-text', Boolean(input.value.trim()));
  };
  rec.onend = () => subtitle.textContent = '在线';
  rec.start();
}

async function registerSW() {
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('/sw.js'); } catch {}
  }
}

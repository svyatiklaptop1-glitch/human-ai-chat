/**
 * Human-in-the-Loop “AI” Chat — with avatars + typing indicator
 * -------------------------------------------------------------
 * Пользователь думает, что пишет ИИ, а отвечает оператор.
 * Красивый чат с пузырьками + аватарки (👤 и 🤖) + «печатает…».
 *
 * Запуск:
 *   npm init -y
 *   npm i express cookie-parser nanoid
 *   node server.js
 *
 * Пользователь: http://localhost:3000/
 * Оператор:    http://localhost:3000/operator?token=YOUR_SECRET
 */

const express = require('express');
const cookieParser = require('cookie-parser');
const { nanoid } = require('nanoid');

const PORT = process.env.PORT || 3000;
const OPERATOR_TOKEN = process.env.OPERATOR_TOKEN || 'CHANGE_ME';

const chats = new Map();
const subscribers = new Map();

function getOrCreateChat(convoId) {
  if (!convoId || !chats.has(convoId)) {
    const id = convoId || nanoid(12);
    const chat = { id, createdAt: Date.now(), messages: [] };
    chats.set(id, chat);
    return chat;
  }
  return chats.get(convoId);
}

function publish(convoId, event, data) {
  const subs = subscribers.get(convoId);
  if (!subs) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of subs) {
    try { res.write(payload); } catch (_) {}
  }
}

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// назначаем пользователю id сессии
app.use((req, res, next) => {
  if (!req.cookies.conversationId) {
    const chat = getOrCreateChat();
    res.cookie('conversationId', chat.id, { httpOnly: false, sameSite: 'lax' });
    req.conversationId = chat.id;
  } else {
    req.conversationId = req.cookies.conversationId;
    getOrCreateChat(req.conversationId);
  }
  next();
});

// ===== страница пользователя =====
app.get('/', (req, res) => {
  res.type('html').send(userPage());
});

app.get('/events', (req, res) => {
  const convoId = req.conversationId;
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write(`event: hello\ndata: ${JSON.stringify({ convoId })}\n\n`);

  let set = subscribers.get(convoId);
  if (!set) { set = new Set(); subscribers.set(convoId, set); }
  set.add(res);
  req.on('close', () => set.delete(res));
});

app.post('/api/message', (req, res) => {
  const convoId = req.conversationId;
  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ ok: false });
  const chat = getOrCreateChat(convoId);
  const msg = { id: nanoid(10), role: 'user', text: text.trim(), at: Date.now() };
  chat.messages.push(msg);
  publish(convoId, 'queued', { messageId: msg.id });
  publish('operator', 'new_user_message', { convoId, preview: msg.text });
  res.json({ ok: true, id: msg.id });
});

// ===== панель оператора =====
app.get('/operator', (req, res) => {
  if (req.query.token !== OPERATOR_TOKEN) return res.status(401).send('Unauthorized');
  res.type('html').send(operatorPage());
});

app.get('/operator/events', (req, res) => {
  if (req.query.token !== OPERATOR_TOKEN) return res.status(401).end();
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  let set = subscribers.get('operator');
  if (!set) { set = new Set(); subscribers.set('operator', set); }
  set.add(res);
  const list = Array.from(chats.values()).map(c=>({ id:c.id, last:c.messages.at(-1)?.text||'', count:c.messages.length }));
  res.write(`event: snapshot\ndata: ${JSON.stringify({ list })}\n\n`);
  req.on('close', () => set.delete(res));
});

app.get('/operator/chat', (req, res) => {
  if (req.query.token !== OPERATOR_TOKEN) return res.status(401).json({ ok:false });
  const { convoId } = req.query;
  if (!chats.has(convoId)) return res.status(404).json({ ok:false });
  res.json({ ok:true, chat: chats.get(convoId) });
});

app.post('/operator/reply', (req, res) => {
  if (req.query.token !== OPERATOR_TOKEN) return res.status(401).json({ ok:false });
  const { convoId, text } = req.body || {};
  if (!chats.has(convoId)) return res.status(404).json({ ok:false });
  const msg = { id: nanoid(10), role: 'assistant', text: text.trim(), at: Date.now() };
  chats.get(convoId).messages.push(msg);
  publish(convoId, 'assistant_message', msg);
  publish('operator', 'assistant_message', { convoId, id: msg.id });
  res.json({ ok:true });
});

// оператор печатает
app.post('/operator/typing', (req, res) => {
  if (req.query.token !== OPERATOR_TOKEN) return res.status(401).json({ ok:false });
  const { convoId } = req.body || {};
  if (!chats.has(convoId)) return res.status(404).json({ ok:false });
  publish(convoId, 'typing', { convoId });
  res.json({ ok:true });
});

// ===== HTML страниц =====
function userPage(){return `<!doctype html><html><head><meta charset=utf-8><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-gray-900 text-white flex items-center justify-center h-screen"><div class="w-full max-w-md flex flex-col h-[90vh] bg-gray-800 rounded-2xl shadow-lg overflow-hidden"><div id="messages" class="flex-1 overflow-y-auto p-4 space-y-3"></div><div id="typing" class="p-2 text-sm text-gray-400 hidden">🤖 печатает...</div><div class="flex p-3 border-t border-gray-700"><input id="input" class="flex-1 px-3 py-2 rounded-xl bg-gray-700 text-white outline-none" placeholder="Ваш вопрос..."><button id="send" class="ml-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-xl">➤</button></div></div><script>const m=document.getElementById('messages'),i=document.getElementById('input'),b=document.getElementById('send'),ty=document.getElementById('typing');function add(r,t){const e=document.createElement('div');e.className='flex items-end '+(r==='user'?'justify-end':'justify-start');const avatar=document.createElement('div');avatar.textContent=r==='user'?'👤':'🤖';avatar.className='w-8 h-8 flex items-center justify-center rounded-full bg-gray-600 mr-2';if(r==='user'){avatar.classList.add('order-2','ml-2');avatar.classList.remove('mr-2')}const bubble=document.createElement('div');bubble.className='px-3 py-2 rounded-2xl max-w-[70%] '+(r==='user'?'bg-indigo-600 text-white':'bg-gray-700 text-gray-100');bubble.textContent=t;if(r==='user'){e.appendChild(bubble);e.appendChild(avatar);}else{e.appendChild(avatar);e.appendChild(bubble);}m.appendChild(e);m.scrollTop=m.scrollHeight}b.onclick=()=>{const t=i.value.trim();if(!t)return;add('user',t);i.value='';fetch('/api/message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:t})})};i.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();b.click()}});const es=new EventSource('/events');es.addEventListener('assistant_message',ev=>{const d=JSON.parse(ev.data);ty.classList.add('hidden');add('assistant',d.text)});es.addEventListener('typing',()=>{ty.classList.remove('hidden')});</script></body></html>`;}

function operatorPage(){return `<!doctype html><html><head><meta charset=utf-8><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-gray-900 text-white flex items-center justify-center h-screen"><div class="w-full max-w-5xl h-[90vh] bg-gray-800 rounded-2xl shadow-lg overflow-hidden grid grid-cols-3"><div id="list" class="border-r border-gray-700 overflow-y-auto p-3 space-y-2"></div><div class="col-span-2 flex flex-col"><div id="thread" class="flex-1 overflow-y-auto p-4 space-y-3"></div><div class="flex p-3 border-t border-gray-700"><input id="reply" class="flex-1 px-3 py-2 rounded-xl bg-gray-700 text-white outline-none" placeholder="Ответ..."><button id="send" class="ml-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-xl">Ответить</button></div></div></div><script>const l=document.getElementById('list'),t=document.getElementById('thread'),r=document.getElementById('reply'),s=document.getElementById('send');const token=new URLSearchParams(location.search).get('token');let current=null;function addMsg(m){const e=document.createElement('div');e.className='flex items-end '+(m.role==='user'?'justify-end':'justify-start');const avatar=document.createElement('div');avatar.textContent=m.role==='user'?'👤':'🤖';avatar.className='w-8 h-8 flex items-center justify-center rounded-full bg-gray-600 mr-2';if(m.role==='user'){avatar.classList.add('order-2','ml-2');avatar.classList.remove('mr-2')}const bubble=document.createElement('div');bubble.className='px-3 py-2 rounded-2xl max-w-[70%] '+(m.role==='user'?'bg-indigo-600 text-white':'bg-gray-700 text-gray-100');bubble.textContent=m.text;if(m.role==='user'){e.appendChild(bubble);e.appendChild(avatar);}else{e.appendChild(avatar);e.appendChild(bubble);}t.appendChild(e);t.scrollTop=t.scrollHeight}function openChat(id){fetch('/operator/chat?token='+token+'&convoId='+id).then(r=>r.json()).then(d=>{if(!d.ok)return;current=d.chat.id;t.innerHTML='';d.chat.messages.forEach(addMsg);t.scrollTop=t.scrollHeight})}s.onclick=()=>{if(!current)return;const text=r.value.trim();if(!text)return;fetch('/operator/reply?token='+token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({convoId:current,text})});r.value=''};r.addEventListener('input',()=>{if(!current)return;fetch('/operator/typing?token='+token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({convoId:current})})});const es=new EventSource('/operator/events?token='+token);es.addEventListener('snapshot',ev=>{const {list}=JSON.parse(ev.data);l.innerHTML='';list.forEach(c=>{const d=document.createElement('div');d.className='p-2 bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-600';d.textContent=c.id+' ('+c.count+')';d.onclick=()=>openChat(c.id);l.appendChild(d)})});</script></body></html>`;}

app.listen(PORT,()=>{console.log('Server running at http://localhost:'+PORT)})

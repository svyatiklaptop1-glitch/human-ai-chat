/**
 * Human-in-the-Loop Chat — с регистрацией, Cloudinary и автологином
 * ---------------------------------------------------
 * npm install express cookie-parser nanoid bcrypt cloudinary multer multer-storage-cloudinary
 *
 * Пользователь: http://localhost:3000/
 * Оператор:     http://localhost:3000/operator?token=YOUR_SECRET
 */

const express = require('express');
const cookieParser = require('cookie-parser');
const { nanoid } = require('nanoid');
const fs = require('fs');
const bcrypt = require('bcrypt');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

const PORT = process.env.PORT || 3000;
const OPERATOR_TOKEN = process.env.OPERATOR_TOKEN || 'CHANGE_ME';

// ----------------- Cloudinary -----------------
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_SECRET,
});
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'chat_uploads',
    allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'pdf'],
  },
});
const upload = multer({ storage });

// ----------------- Users -----------------
const USERS_FILE = './users.json';
let users = { users: [] };
if (fs.existsSync(USERS_FILE)) {
  users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}
function saveUsers() {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ----------------- Chats -----------------
const chats = new Map();
const subscribers = new Map();

function getOrCreateChat(userId) {
  if (!chats.has(userId)) {
    chats.set(userId, { id: userId, messages: [] });
  }
  return chats.get(userId);
}

function publish(channel, event, data) {
  const subs = subscribers.get(channel);
  if (!subs) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of subs) {
    try { res.write(payload); } catch (_) {}
  }
}

// ----------------- App -----------------
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

// ========== Auth ==========
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (users.users.find(u => u.username === username)) {
    return res.status(400).json({ ok: false, error: 'User exists' });
  }
  const hash = await bcrypt.hash(password, 10);
  const user = { id: nanoid(8), username, password: hash };
  users.users.push(user);
  saveUsers();
  res.json({ ok: true });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = users.users.find(u => u.username === username);
  if (!user) return res.status(400).json({ ok: false });
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(400).json({ ok: false });
  res.cookie('userId', user.id, { httpOnly: false, sameSite: 'lax' });
  res.json({ ok: true });
});

app.get('/me', (req, res) => {
  const user = users.users.find(u => u.id === req.cookies.userId);
  if (!user) return res.json({ ok: false });
  res.json({ ok: true, user: { id: user.id, username: user.username } });
});

// ========== Upload ==========
app.post('/upload', upload.single('file'), (req, res) => {
  res.json({ url: req.file.path });
});

// ========== Chat ==========
app.get('/', (req, res) => {
  res.type('html').send(userPage());
});

app.get('/events', (req, res) => {
  const userId = req.cookies.userId;
  if (!userId) return res.status(401).end();
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  let set = subscribers.get(userId);
  if (!set) { set = new Set(); subscribers.set(userId, set); }
  set.add(res);
  req.on('close', () => set.delete(res));
});

app.post('/api/message', (req, res) => {
  const userId = req.cookies.userId;
  if (!userId) return res.status(401).end();
  const { text, fileUrl } = req.body;
  const chat = getOrCreateChat(userId);
  const msg = { id: nanoid(10), role: 'user', text: text || null, fileUrl: fileUrl || null, at: Date.now() };
  chat.messages.push(msg);
  publish(userId, 'message', msg);
  publish('operator', 'new_user_message', { userId, preview: msg.text || '[file]' });
  res.json({ ok: true });
});

app.get('/api/history', (req, res) => {
  const userId = req.cookies.userId;
  if (!userId || !chats.has(userId)) return res.json({ ok: true, messages: [] });
  res.json({ ok: true, messages: chats.get(userId).messages });
});

// ========== Operator ==========
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
  req.on('close', () => set.delete(res));
  const list = Array.from(chats.entries()).map(([id, c]) => ({ id, count: c.messages.length }));
  res.write(`event: snapshot\ndata: ${JSON.stringify({ list })}\n\n`);
});

app.post('/operator/reply', (req, res) => {
  if (req.query.token !== OPERATOR_TOKEN) return res.status(401).end();
  const { userId, text } = req.body;
  const chat = getOrCreateChat(userId);
  const msg = { id: nanoid(10), role: 'assistant', text, at: Date.now() };
  chat.messages.push(msg);
  publish(userId, 'message', msg);
  publish('operator', 'assistant_message', { userId, id: msg.id });
  res.json({ ok: true });
});

// ========== Pages ==========
function userPage() {
  return `<!doctype html><html><head><meta charset=utf-8><script src="https://cdn.tailwindcss.com"></script></head>
  <body class="bg-gray-900 text-white flex items-center justify-center h-screen">
  <div id="auth" class="w-full max-w-sm p-4 bg-gray-800 rounded-xl hidden">
    <h1 class="text-xl mb-2">Вход</h1>
    <input id="username" placeholder="Имя" class="w-full mb-2 p-2 rounded bg-gray-700"/>
    <input id="password" type="password" placeholder="Пароль" class="w-full mb-2 p-2 rounded bg-gray-700"/>
    <button onclick="register()" class="w-full mb-2 bg-indigo-600 p-2 rounded">Регистрация</button>
    <button onclick="login()" class="w-full bg-green-600 p-2 rounded">Войти</button>
  </div>
  <div id="chat" class="hidden w-full max-w-md flex flex-col h-[90vh] bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
    <div id="messages" class="flex-1 overflow-y-auto p-4 space-y-3"></div>
    <div class="flex p-3 border-t border-gray-700 items-center">
      <input id="input" class="flex-1 px-3 py-2 rounded-xl bg-gray-700 text-white outline-none" placeholder="Сообщение...">
      <input type="file" id="file" class="ml-2 text-sm text-gray-300">
      <button id="sendBtn" class="ml-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-white font-semibold">Отправить</button>
    </div>
  </div>
  <script>
  async function register() {
    const r = await fetch('/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:username.value,password:password.value})});
    if(r.ok) alert('Зарегистрирован! Теперь войди.');
  }
  async function login() {
    const r = await fetch('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:username.value,password:password.value})});
    if(r.ok) { showChat(); } else { alert("Ошибка входа"); }
  }
  async function checkAuth() {
    const r = await fetch('/me'); const d = await r.json();
    if (d.ok) { showChat(); } else { showAuth(); }
  }
  function showChat(){document.getElementById('auth').classList.add('hidden');document.getElementById('chat').classList.remove('hidden');loadHistory();connectEvents();}
  function showAuth(){document.getElementById('auth').classList.remove('hidden');document.getElementById('chat').classList.add('hidden');}
  async function loadHistory(){const r=await fetch('/api/history');const d=await r.json();d.messages.forEach(addMsg);}
  function addMsg(m){const e=document.createElement('div');if(m.text){e.textContent=(m.role==='user'?'👤':'🤖')+': '+m.text;}else if(m.fileUrl){if(m.fileUrl.match(/.(jpg|jpeg|png|gif)$/)){e.innerHTML=(m.role==='user'?'👤':'🤖')+': <img src="'+m.fileUrl+'" class="max-w-[200px] rounded"/>';}else{e.innerHTML=(m.role==='user'?'👤':'🤖')+': <a href="'+m.fileUrl+'" target="_blank" class="underline">Файл</a>';}}messages.appendChild(e);messages.scrollTop=messages.scrollHeight;}
  function connectEvents(){const es=new EventSource('/events');es.addEventListener('message',ev=>{addMsg(JSON.parse(ev.data))});}
  const sendBtn=document.getElementById('sendBtn');sendBtn.onclick=async()=>{let fileInput=document.getElementById('file');if(fileInput.files.length>0){const fd=new FormData();fd.append('file',fileInput.files[0]);const r=await fetch('/upload',{method:'POST',body:fd});const d=await r.json();await fetch('/api/message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileUrl:d.url})});fileInput.value='';}else{const text=input.value.trim();if(!text)return;input.value='';await fetch('/api/message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});}};
  input.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();sendBtn.click();}});
  checkAuth();
  </script></body></html>`;
}

function operatorPage() {
  return `<!doctype html><html><head><meta charset=utf-8><script src="https://cdn.tailwindcss.com"></script></head>
  <body class="bg-gray-900 text-white flex items-center justify-center h-screen">
  <div class="w-full max-w-5xl h-[90vh] bg-gray-800 rounded-2xl shadow-lg overflow-hidden grid grid-cols-3">
    <div id="list" class="border-r border-gray-700 overflow-y-auto p-3 space-y-2"></div>
    <div class="col-span-2 flex flex-col">
      <div id="thread" class="flex-1 overflow-y-auto p-4 space-y-3"></div>
      <div class="flex p-3 border-t border-gray-700">
        <input id="reply" class="flex-1 px-3 py-2 rounded-xl bg-gray-700 text-white" placeholder="Ответ...">
        <button id="send" class="ml-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-xl">Ответить</button>
      </div>
    </div>
  </div>
  <script>
  const l=document.getElementById('list'),t=document.getElementById('thread'),r=document.getElementById('reply'),s=document.getElementById('send');const token=new URLSearchParams(location.search).get('token');let current=null;
  function addMsg(m){const e=document.createElement('div');if(m.text){e.textContent=(m.role==='user'?'👤':'🤖')+': '+m.text;}else if(m.fileUrl){if(m.fileUrl.match(/.(jpg|jpeg|png|gif)$/)){e.innerHTML=(m.role==='user'?'👤':'🤖')+': <img src="'+m.fileUrl+'" class="max-w-[200px] rounded"/>';}else{e.innerHTML=(m.role==='user'?'👤':'🤖')+': <a href="'+m.fileUrl+'" target="_blank" class="underline">Файл</a>';}}t.appendChild(e);t.scrollTop=t.scrollHeight;}
  function openChat(id){current=id;t.innerHTML='';fetch('/api/history').then(r=>r.json()).then(d=>{d.messages.forEach(addMsg)});} 
  s.onclick=()=>{if(!current)return;const text=r.value.trim();if(!text)return;fetch('/operator/reply?token='+token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:current,text})});r.value='';};
  const es=new EventSource('/operator/events?token='+token);es.addEventListener('snapshot',ev=>{const{list}=JSON.parse(ev.data);l.innerHTML='';list.forEach(c=>{const d=document.createElement('div');d.className='p-2 bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-600';d.textContent=c.id+' ('+c.count+')';d.onclick=()=>openChat(c.id);l.appendChild(d)})});
  </script></body></html>`;
}

// -----------------
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

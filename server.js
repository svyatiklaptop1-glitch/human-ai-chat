// server.js
import express from "express";
import multer from "multer";
import cookieParser from "cookie-parser";
import fs from "fs";

const app = express();
const PORT = 3000;

// ------------------- CONFIG -------------------
const OPERATOR_TOKEN = "supersecret"; // токен для оператора
const upload = multer({ dest: "uploads/" });
app.use(cookieParser());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

// ------------------- DATA -------------------
let users = { users: [] };
const saveUsers = () => fs.writeFileSync("users.json", JSON.stringify(users, null, 2));
if (fs.existsSync("users.json")) users = JSON.parse(fs.readFileSync("users.json"));

// ------------------- SSE -------------------
const streams = { users: {}, operator: [] };
function sendToOperator(event, data) {
  streams.operator.forEach((res) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  });
}
function sendToUser(userId, event, data) {
  const res = streams.users[userId];
  if (res) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ------------------- ROUTES -------------------

// User registration
app.post("/register", (req, res) => {
  const userId = "u" + Math.random().toString(36).slice(2, 8);
  const user = { id: userId, messages: [], avatarUrl: "" };
  users.users.push(user);
  saveUsers();
  res.cookie("userId", userId, { httpOnly: true });
  res.json({ ok: true, userId });
});

// User events
app.get("/events", (req, res) => {
  const userId = req.cookies.userId;
  if (!userId) return res.sendStatus(401);
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  streams.users[userId] = res;
  const u = users.users.find((x) => x.id === userId);
  res.write(`event: snapshot\ndata: ${JSON.stringify(u)}\n\n`);
  req.on("close", () => delete streams.users[userId]);
});

// User send message
app.post("/send", upload.single("file"), (req, res) => {
  const userId = req.cookies.userId;
  const u = users.users.find((x) => x.id === userId);
  if (!u) return res.sendStatus(401);
  const msg = {
    role: "user",
    text: req.body.text || "",
    fileUrl: req.file ? "/uploads/" + req.file.filename : null,
    at: Date.now(),
  };
  u.messages.push(msg);
  saveUsers();
  sendToOperator("new_user_message", { userId, msg });
  res.json({ ok: true });
});

// Update avatar
app.post("/update-avatar", upload.single("file"), (req, res) => {
  const u = users.users.find((x) => x.id === req.cookies.userId);
  if (!u) return res.status(401).json({ ok: false });
  u.avatarUrl = "/uploads/" + req.file.filename;
  saveUsers();
  res.json({ ok: true, url: u.avatarUrl });
});

// Operator events
app.get("/operator/events", (req, res) => {
  if (req.query.token !== OPERATOR_TOKEN) return res.sendStatus(403);
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  streams.operator.push(res);
  const list = users.users.map((u) => ({ id: u.id, count: u.messages.length }));
  res.write(`event: snapshot\ndata: ${JSON.stringify({ list })}\n\n`);
  req.on("close", () => (streams.operator = streams.operator.filter((r) => r !== res)));
});

// Operator reply
app.post("/operator/reply", (req, res) => {
  if (req.query.token !== OPERATOR_TOKEN) return res.sendStatus(403);
  const { userId, text } = req.body;
  const u = users.users.find((x) => x.id === userId);
  if (!u) return res.sendStatus(404);
  const msg = { role: "assistant", text, at: Date.now() };
  u.messages.push(msg);
  saveUsers();
  sendToUser(userId, "assistant_message", msg);
  sendToOperator("assistant_message", { userId, msg });
  res.json({ ok: true });
});

// Get history
app.get("/api/history", (req, res) => {
  const { userId } = req.query;
  const u = users.users.find((x) => x.id === userId);
  if (!u) return res.sendStatus(404);
  res.json({ messages: u.messages });
});

// ------------------- PAGES -------------------

function userPage() {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Чат с Нейросетью</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-900 text-white flex flex-col h-screen">
  <div class="flex justify-between items-center p-4 border-b border-gray-700">
    <h2 id="chatTitle" class="text-lg font-semibold">🤖 Чат с Нейросетью</h2>
    <button onclick="openProfile()" class="text-sm">👤 Профиль</button>
  </div>

  <div id="messages" class="flex-1 overflow-y-auto p-4 space-y-3"></div>

  <div class="p-3 border-t border-gray-700 flex">
    <input id="msg" class="flex-1 rounded-l-lg px-3 py-2 text-black" placeholder="Сообщение...">
    <button id="sendBtn" onclick="sendMessage()" class="bg-indigo-600 px-4 py-2 rounded-r-lg">Отправить</button>
  </div>

  <!-- Profile Modal -->
  <div id="profileModal" class="hidden fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center">
    <div class="bg-gray-800 rounded-xl p-6 w-80">
      <div class="text-center">
        <img id="profileAvatar" src="https://via.placeholder.com/100x100?text=👤" class="w-20 h-20 rounded-full mx-auto mb-3 object-cover"/>
        <input type="file" id="avatarInput" class="hidden" onchange="uploadAvatar()">
        <button onclick="document.getElementById('avatarInput').click()" class="text-sm text-blue-400 underline">Сменить аватар</button>
        <h4 id="profileUsername" class="text-lg font-medium">Загрузка...</h4>
        <p class="text-sm text-gray-400">ID: <span id="profileId">...</span></p>
      </div>
      <div class="mt-4">
        <label class="block text-sm mb-1">Тема</label>
        <select id="themeSelect" onchange="changeTheme()" class="w-full p-2 bg-gray-700 rounded-lg">
          <option value="dark">Тёмная</option>
          <option value="light">Светлая</option>
          <option value="auto">Системная</option>
        </select>
      </div>
      <div class="mt-4">
        <label class="block text-sm mb-1">Язык</label>
        <select id="langSelect" onchange="changeLanguage()" class="w-full p-2 bg-gray-700 rounded-lg">
          <option value="ru" selected>Русский</option>
          <option value="en">English</option>
          <option value="kk">Қазақша</option>
        </select>
      </div>
      <button id="logoutBtn" onclick="logout()" class="mt-6 w-full bg-red-600 rounded-lg py-2">🚪 Выйти</button>
    </div>
  </div>

<script>
let currentUser = {};
const es = new EventSource('/events');

es.addEventListener('snapshot', ev => {
  currentUser = JSON.parse(ev.data);
  renderMessages(currentUser.messages);
});

es.addEventListener('assistant_message', ev => {
  const msg = JSON.parse(ev.data);
  currentUser.messages.push(msg);
  renderMessages(currentUser.messages);
});

function renderMessages(list) {
  const box = document.getElementById('messages');
  box.innerHTML = '';
  list.forEach(m => {
    const div = document.createElement('div');
    div.className = 'flex ' + (m.role==='user'?'justify-start':'justify-end');
    div.innerHTML = '<div class="px-3 py-2 rounded-xl max-w-[70%] ' + 
      (m.role==='user'?'bg-gray-700':'bg-indigo-600') + '">' +
      (m.text||'') + '</div>';
    box.appendChild(div);
  });
  box.scrollTop = box.scrollHeight;
}

async function sendMessage() {
  const text = document.getElementById('msg').value;
  if (!text) return;
  document.getElementById('msg').value='';
  await fetch('/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});
}

function openProfile(){
  document.getElementById('profileModal').classList.remove('hidden');
  document.getElementById('profileId').textContent=currentUser.id;
  document.getElementById('profileUsername').textContent='User';
  if(currentUser.avatarUrl){
    document.getElementById('profileAvatar').src=currentUser.avatarUrl;
  }
}

function logout(){document.cookie='userId=; Max-Age=0';location.reload();}

async function uploadAvatar(){
  const inp=document.getElementById('avatarInput');
  if(!inp.files.length) return;
  const fd=new FormData();fd.append('file',inp.files[0]);
  const r=await fetch('/update-avatar',{method:'POST',body:fd});
  const d=await r.json();
  if(d.ok){
    document.getElementById('profileAvatar').src=d.url;
    currentUser.avatarUrl=d.url;
  }
}

// THEME
function changeTheme(){
  const v=document.getElementById('themeSelect').value;
  if(v==='dark'){document.body.className='bg-gray-900 text-white flex flex-col h-screen';}
  else if(v==='light'){document.body.className='bg-white text-black flex flex-col h-screen';}
  else{ if(window.matchMedia('(prefers-color-scheme: dark)').matches) changeTheme('dark'); else changeTheme('light'); }
}

// LANG
const translations={
  ru:{chatTitle:"🤖 Чат с Нейросетью",send:"Отправить",logout:"🚪 Выйти"},
  en:{chatTitle:"🤖 Chat with AI",send:"Send",logout:"🚪 Logout"},
  kk:{chatTitle:"🤖 Жасанды интеллектпен чат",send:"Жіберу",logout:"🚪 Шығу"}
};
let currentLang="ru";
function changeLanguage(){
  currentLang=document.getElementById('langSelect').value;
  applyTranslations();
}
function applyTranslations(){
  const t=translations[currentLang];
  document.getElementById('chatTitle').textContent=t.chatTitle;
  document.getElementById('sendBtn').textContent=t.send;
  document.getElementById('logoutBtn').textContent=t.logout;
}
applyTranslations();
</script>
</body></html>`;
}

function operatorPage() {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Operator</title><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-gray-900 text-white h-screen flex">
  <div class="w-1/4 border-r border-gray-700 p-3 overflow-y-auto" id="list"></div>
  <div class="flex-1 flex flex-col">
    <div id="thread" class="flex-1 p-4 overflow-y-auto space-y-3"></div>
    <div class="p-3 border-t border-gray-700 flex">
      <input id="reply" class="flex-1 text-black rounded-l-lg px-3 py-2" placeholder="Ответ...">
      <button onclick="sendReply()" class="bg-indigo-600 px-4 py-2 rounded-r-lg">Отправить</button>
    </div>
  </div>
<script>
let currentUserId=null;
const es=new EventSource('/operator/events?token=${OPERATOR_TOKEN}');
es.addEventListener('snapshot',ev=>{renderList(JSON.parse(ev.data).list);});
es.addEventListener('new_user_message',ev=>{const d=JSON.parse(ev.data);addOrUpdateUser(d.userId);if(currentUserId===d.userId)loadHistory(d.userId);});
es.addEventListener('assistant_message',ev=>{const d=JSON.parse(ev.data);if(currentUserId===d.userId)loadHistory(d.userId);});

async function loadHistory(userId){
  currentUserId=userId;
  const r=await fetch('/api/history?userId='+encodeURIComponent(userId));
  const d=await r.json();
  const t=document.getElementById('thread');t.innerHTML='';
  d.messages.forEach(m=>addMsg(m,t));
}
function addMsg(m,c){const e=document.createElement('div');e.className='flex '+(m.role==='user'?'justify-start':'justify-end');const b=document.createElement('div');b.className='max-w-[80%] p-3 rounded-2xl '+(m.role==='user'?'bg-gray-700':'bg-indigo-600');b.innerHTML='<p>'+m.text+'</p>';e.appendChild(b);c.appendChild(e);}
function renderList(list){const el=document.getElementById('list');el.innerHTML='';list.forEach(u=>{const d=document.createElement('div');d.className='p-2 bg-gray-700 rounded cursor-pointer hover:bg-gray-600 flex justify-between';d.textContent='👤 '+u.id;const s=document.createElement('span');s.className='text-xs opacity-70';s.textContent=u.count;d.appendChild(s);d.onclick=()=>loadHistory(u.id);el.appendChild(d);});}
async function sendReply(){if(!currentUserId)return;const text=document.getElementById('reply').value.trim();if(!text)return;document.getElementById('reply').value='';await fetch('/operator/reply?token=${OPERATOR_TOKEN}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUserId,text})});loadHistory(currentUserId);}
</script>
</body></html>`;
}

app.get("/", (req, res) => res.send(userPage()));
app.get("/operator", (req, res) => res.send(operatorPage()));

// ------------------- START -------------------
app.listen(PORT, () => console.log("Server running http://localhost:" + PORT));

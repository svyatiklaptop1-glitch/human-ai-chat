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
  const user = { 
    id: nanoid(8), 
    username, 
    password: hash,
    avatar: null,
    settings: {
      theme: 'dark',
      language: 'ru',
      fontSize: 14,
      soundNotif: true,
      desktopNotif: false
    }
  };
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

app.post('/logout', (req, res) => {
  res.clearCookie('userId');
  res.json({ ok: true });
});

app.get('/me', (req, res) => {
  const user = users.users.find(u => u.id === req.cookies.userId);
  if (!user) return res.json({ ok: false });
  res.json({ 
    ok: true, 
    user: { 
      id: user.id, 
      username: user.username,
      avatar: user.avatar,
      settings: user.settings
    } 
  });
});

// ========== Settings ==========
app.post('/api/settings', (req, res) => {
  const userId = req.cookies.userId;
  if (!userId) return res.status(401).end();
  
  const user = users.users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ ok: false });
  
  const { theme, language, fontSize, soundNotif, desktopNotif } = req.body;
  
  if (theme) user.settings.theme = theme;
  if (language) user.settings.language = language;
  if (fontSize) user.settings.fontSize = fontSize;
  if (soundNotif !== undefined) user.settings.soundNotif = soundNotif;
  if (desktopNotif !== undefined) user.settings.desktopNotif = desktopNotif;
  
  saveUsers();
  res.json({ ok: true });
});

app.post('/api/avatar', upload.single('avatar'), (req, res) => {
  const userId = req.cookies.userId;
  if (!userId) return res.status(401).end();
  
  const user = users.users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ ok: false });
  
  user.avatar = req.file.path;
  saveUsers();
  
  res.json({ ok: true, avatar: req.file.path });
});

app.post('/api/change-password', async (req, res) => {
  const userId = req.cookies.userId;
  if (!userId) return res.status(401).end();
  
  const { currentPassword, newPassword } = req.body;
  const user = users.users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ ok: false });
  
  const match = await bcrypt.compare(currentPassword, user.password);
  if (!match) return res.status(400).json({ ok: false, error: 'Current password is incorrect' });
  
  user.password = await bcrypt.hash(newPassword, 10);
  saveUsers();
  
  res.json({ ok: true });
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
  const requestedUserId = req.query.userId;
  
  if (requestedUserId) {
    if (!chats.has(requestedUserId)) {
      return res.json({ ok: true, messages: [] });
    }
    return res.json({ ok: true, messages: chats.get(requestedUserId).messages });
  }
  
  if (!userId || !chats.has(userId)) {
    return res.json({ ok: true, messages: [] });
  }
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
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    .slide-panel {
      transform: translateX(100%);
      transition: transform 0.3s ease;
    }
    .slide-panel.open {
      transform: translateX(0);
    }
    .modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .modal.open {
      display: flex;
    }
    .typing-dots span {
      animation: blink 1.4s infinite;
      animation-fill-mode: both;
    }
    .typing-dots span:nth-child(2) {
      animation-delay: 0.2s;
    }
    .typing-dots span:nth-child(3) {
      animation-delay: 0.4s;
    }
    @keyframes blink {
      0%, 60%, 100% {
        opacity: 0.3;
      }
      30% {
        opacity: 1;
      }
    }
  </style>
</head>
<body class="bg-gray-900 text-white flex items-center justify-center h-screen">
  <!-- AUTH FORM -->
  <div id="auth" class="w-full max-w-sm p-4 bg-gray-800 rounded-xl hidden">
    <h1 class="text-xl mb-2">Вход</h1>
    <input id="username" placeholder="Имя" class="w-full mb-2 p-2 rounded bg-gray-700"/>
    <input id="password" type="password" placeholder="Пароль" class="w-full mb-2 p-2 rounded bg-gray-700"/>
    <button onclick="register()" class="w-full mb-2 bg-indigo-600 p-2 rounded hover:bg-indigo-700">Регистрация</button>
    <button onclick="login()" class="w-full bg-green-600 p-2 rounded hover:bg-green-700">Войти</button>
  </div>

  <!-- MAIN CHAT -->
  <div id="chat" class="hidden w-full max-w-md flex flex-col h-[90vh] bg-gray-800 rounded-2xl shadow-lg overflow-hidden relative">
    <!-- HEADER С КНОПКАМИ -->
    <div class="bg-gray-700 p-3 flex items-center justify-between border-b border-gray-600">
      <h2 class="text-lg font-semibold">🤖 Чат с ботом нейросетью</h2>
      <div class="flex items-center gap-2">
        <!-- КНОПКА ПРОФИЛЯ -->
        <button onclick="openProfile()" class="p-2 hover:bg-gray-600 rounded-lg transition" title="Профиль">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
          </svg>
        </button>
        <!-- КНОПКА НАСТРОЕК (ШЕСТЕРЕНКА) -->
        <button onclick="openSettings()" class="p-2 hover:bg-gray-600 rounded-lg transition" title="Настройки">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
          </svg>
        </button>
      </div>
    </div>

    <!-- MESSAGES -->
    <div id="messages" class="flex-1 overflow-y-auto p-4 space-y-3"></div>

    <!-- INPUT -->
    <div class="p-3 border-t border-gray-700 space-y-2">
      <div class="flex items-center gap-2">
        <input id="input" class="flex-1 px-3 py-2 rounded-xl bg-gray-700 text-white outline-none" placeholder="Сообщение...">
        <input type="file" id="file" class="hidden">
        <button onclick="document.getElementById('file').click()" class="px-3 py-2 bg-gray-600 hover:bg-gray-500 rounded-xl text-white">📎</button>
      </div>
      <button id="sendBtn" class="w-full py-2 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-white font-semibold">Отправить</button>
    </div>
  </div>

  <!-- ПАНЕЛЬ НАСТРОЕК -->
  <div id="settingsPanel" class="fixed right-0 top-0 h-full w-80 bg-gray-800 shadow-2xl slide-panel z-50">
    <div class="p-4 border-b border-gray-700 flex items-center justify-between">
      <h3 class="text-xl font-semibold">⚙️ Настройки</h3>
      <button onclick="closeSettings()" class="text-gray-400 hover:text-white">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    </div>
    <div class="p-4 space-y-4 overflow-y-auto h-full">
      <!-- Тема -->
      <div>
        <label class="block text-sm font-medium mb-2">🎨 Тема оформления</label>
        <select id="themeSelect" onchange="changeTheme()" class="w-full p-2 bg-gray-700 rounded-lg">
          <option value="dark">Темная</option>
          <option value="light">Светлая</option>
          <option value="auto">Автоматически</option>
        </select>
      </div>
      
      <!-- Уведомления -->
      <div>
        <label class="block text-sm font-medium mb-2">🔔 Уведомления</label>
        <div class="space-y-2">
          <label class="flex items-center">
            <input type="checkbox" id="soundNotif" checked class="mr-2">
            <span>Звуковые уведомления</span>
          </label>
          <label class="flex items-center">
            <input type="checkbox" id="desktopNotif" class="mr-2">
            <span>Уведомления на рабочем столе</span>
          </label>
        </div>
      </div>
      
      <!-- Размер шрифта -->
      <div>
        <label class="block text-sm font-medium mb-2">📝 Размер шрифта</label>
        <input type="range" id="fontSizeSlider" min="12" max="20" value="14" onchange="changeFontSize()" class="w-full">
        <div class="text-center text-sm mt-1">
          <span id="fontSizeValue">14px</span>
        </div>
      </div>
      
      <!-- Язык -->
      <div>
        <label class="block text-sm font-medium mb-2">🌐 Язык интерфейса</label>
        <select id="languageSelect" onchange="changeLanguage()" class="w-full p-2 bg-gray-700 rounded-lg">
          <option value="ru">Русский</option>
          <option value="en">English</option>
          <option value="kz">Қазақша</option>
        </select>
      </div>
      
      <!-- Действия -->
      <div class="space-y-2 pt-4 border-t border-gray-700">
        <button onclick="clearChat()" class="w-full p-2 bg-red-600 hover:bg-red-700 rounded-lg">🗑️ Очистить чат</button>
        <button onclick="exportChat()" class="w-full p-2 bg-blue-600 hover:bg-blue-700 rounded-lg">💾 Экспорт чата</button>
      </div>
    </div>
  </div>

  <!-- МОДАЛЬНОЕ ОКНО ПРОФИЛЯ -->
  <div id="profileModal" class="modal">
    <div class="bg-gray-800 rounded-2xl p-6 w-96 max-w-[90%]">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-xl font-semibold">👤 Профиль</h3>
        <button onclick="closeProfile()" class="text-gray-400 hover:text-white">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
      
      <div class="space-y-4">
        <div class="text-center">
          <div class="w-20 h-20 bg-indigo-600 rounded-full mx-auto mb-3 flex items-center justify-center text-3xl relative">
            <img id="profileAvatar" src="" class="w-full h-full rounded-full object-cover hidden">
            <span id="profileAvatarPlaceholder" class="text-3xl">👤</span>
          </div>
          <input type="file" id="avatarInput" accept="image/*" class="hidden">
          <button onclick="document.getElementById('avatarInput').click()" class="text-sm text-blue-400 hover:text-blue-300 mb-2">Сменить аватар</button>
          <h4 id="profileUsername" class="text-lg font-medium">Загрузка...</h4>
          <p class="text-sm text-gray-400">ID: <span id="profileId">...</span></p>
        </div>
        
        <div class="border-t border-gray-700 pt-4">
          <div class="flex justify-between items-center mb-2">
            <span class="text-sm text-gray-400">Статус</span>
            <span class="text-sm bg-green-600 px-2 py-1 rounded">Онлайн</span>
          </div>
          <div class="flex justify-between items-center mb-2">
            <span class="text-sm text-gray-400">Сообщений отправлено</span>
            <span id="messageCount" class="text-sm">0</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-sm text-gray-400">Время в чате</span>
            <span id="chatTime" class="text-sm">0м</span>
          </div>
        </div>
        
        <div class="space-y-2 pt-4 border-t border-gray-700">
          <button onclick="changePassword()" class="w-full p-2 bg-gray-700 hover:bg-gray-600 rounded-lg">🔐 Изменить пароль</button>
          <button onclick="logout()" class="w-full p-2 bg-red-600 hover:bg-red-700 rounded-lg">🚪 Выйти</button>
        </div>
      </div>
    </div>
  </div>

  <script>
  let currentUser = null;
  let messagesSent = 0;
  let chatStartTime = Date.now();

  // Переводы для интерфейса
  const translations = {
    ru: {
      login: "Вход",
      register: "Регистрация",
      chatSupport: "🤖 Чат с ботом нейросетью",
      messagePlaceholder: "Сообщение...",
      send: "Отправить",
      settings: "⚙️ Настройки",
      theme: "🎨 Тема оформления",
      dark: "Темная",
      light: "Светлая",
      auto: "Автоматически",
      notifications: "🔔 Уведомления",
      sound: "Звуковые уведомления",
      desktop: "Уведомления на рабочем столе",
      fontSize: "📝 Размер шрифта",
      language: "🌐 Язык интерфейса",
      clearChat: "🗑️ Очистить чат",
      exportChat: "💾 Экспорт чата",
      profile: "👤 Профиль",
      online: "Онлайн",
      messagesSent: "Сообщений отправлено",
      chatTime: "Время в чате",
      changeAvatar: "Сменить аватар",
      changePassword: "🔐 Изменить пароль",
      logout: "🚪 Выйти"
    },
    en: {
      login: "Login",
      register: "Register",
      chatSupport: "🤖 AI Neural Network Chat",
      messagePlaceholder: "Message...",
      send: "Send",
      settings: "⚙️ Settings",
      theme: "🎨 Theme",
      dark: "Dark",
      light: "Light",
      auto: "Auto",
      notifications: "🔔 Notifications",
      sound: "Sound notifications",
      desktop: "Desktop notifications",
      fontSize: "📝 Font size",
      language: "🌐 Language",
      clearChat: "🗑️ Clear chat",
      exportChat: "💾 Export chat",
      profile: "👤 Profile",
      online: "Online",
      messagesSent: "Messages sent",
      chatTime: "Chat time",
      changeAvatar: "Change avatar",
      changePassword: "🔐 Change password",
      logout: "🚪 Logout"
    },
    kz: {
      login: "Кіру",
      register: "Тіркелу",
      chatSupport: "🤖 Жасанды интеллект чаты",
      messagePlaceholder: "Хабарлама...",
      send: "Жіберу",
      settings: "⚙️ Баптаулар",
      theme: "🎨 Тақырып",
      dark: "Қараңғы",
      light: "Жарық",
      auto: "Автоматты",
      notifications: "🔔 Хабарландырулар",
      sound: "Дыбысты хабарландырулар",
      desktop: "Жұмыс үстелі хабарландырулары",
      fontSize: "📝 Қаріп өлшемі",
      language: "🌐 Тіл",
      clearChat: "🗑️ Чатты тазалау",
      exportChat: "💾 Чатты экспорттау",
      profile: "👤 Профиль",
      online: "Онлайн",
      messagesSent: "Жіберілген хабарламалар",
      chatTime: "Чат уақыты",
      changeAvatar: "Аватарды өзгерту",
      changePassword: "🔐 Құпия сөзді өзгерту",
      logout: "🚪 Шығу"
    }
  };

  async function register() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    const r = await fetch('/register', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({username, password})
    });
    if(r.ok) alert('Зарегистрирован! Теперь войди.');
  }

  async function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    const r = await fetch('/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({username, password})
    });
    if(r.ok) { 
      showChat(); 
    } else { 
      alert("Ошибка входа"); 
    }
  }

  async function logout() {
    if(confirm('Вы уверены, что хотите выйти?')) {
      await fetch('/logout', {method: 'POST'});
      location.reload();
    }
  }

  async function checkAuth() {
    const r = await fetch('/me'); 
    const d = await r.json();
    if (d.ok) { 
      currentUser = d.user;
      applyUserSettings();
      showChat(); 
    } else { 
      showAuth(); 
    }
  }

  function applyUserSettings() {
    if (!currentUser || !currentUser.settings) return;
    
    // Применяем тему
    applyTheme(currentUser.settings.theme);
    document.getElementById('themeSelect').value = currentUser.settings.theme;
    
    // Применяем язык
    document.getElementById('languageSelect').value = currentUser.settings.language;
    updateLanguage(currentUser.settings.language);
    
    // Применяем размер шрифта
    document.getElementById('fontSizeSlider').value = currentUser.settings.fontSize;
    document.getElementById('fontSizeValue').textContent = currentUser.settings.fontSize + 'px';
    document.getElementById('messages').style.fontSize = currentUser.settings.fontSize + 'px';
    
    // Применяем настройки уведомлений
    document.getElementById('soundNotif').checked = currentUser.settings.soundNotif;
    document.getElementById('desktopNotif').checked = currentUser.settings.desktopNotif;
    
    // Показываем аватар если есть
    updateAvatarDisplay();
  }

  function updateAvatarDisplay() {
    if (currentUser && currentUser.avatar) {
      document.getElementById('profileAvatar').src = currentUser.avatar;
      document.getElementById('profileAvatar').classList.remove('hidden');
      document.getElementById('profileAvatarPlaceholder').classList.add('hidden');
    } else {
      document.getElementById('profileAvatar').classList.add('hidden');
      document.getElementById('profileAvatarPlaceholder').classList.remove('hidden');
    }
  }

  function applyTheme(theme) {
    const body = document.body;
    const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    if (isDark) {
      body.classList.add('bg-gray-900', 'text-white');
      body.classList.remove('bg-gray-100', 'text-gray-900');
      document.getElementById('chat').classList.add('bg-gray-800');
      document.getElementById('chat').classList.remove('bg-white');
    } else {
      body.classList.add('bg-gray-100', 'text-gray-900');
      body.classList.remove('bg-gray-900', 'text-white');
      document.getElementById('chat').classList.add('bg-white');
      document.getElementById('chat').classList.remove('bg-gray-800');
    }
  }

  function updateLanguage(lang) {
    const t = translations[lang] || translations.ru;
    document.querySelector('h1').textContent = t.login;
    document.querySelector('h2').textContent = t.chatSupport;
    document.getElementById('input').placeholder = t.messagePlaceholder;
    document.getElementById('sendBtn').textContent = t.send;
    document.querySelector('[for="themeSelect"]').textContent = t.theme;
    document.querySelector('[for="languageSelect"]').textContent = t.language;
    document.querySelector('[for="fontSizeSlider"]').textContent = t.fontSize;
    document.querySelector('[for="soundNotif"] + span').textContent = t.sound;
    document.querySelector('[for="desktopNotif"] + span').textContent = t.desktop;
  }

  function showChat() {
    document.getElementById('auth').classList.add('hidden');
    document.getElementById('chat').classList.remove('hidden');
    chatStartTime = Date.now();
    loadHistory();
    connectEvents();
  }

  function showAuth() {
    document.getElementById('auth').classList.remove('hidden');
    document.getElementById('chat').classList.add('hidden');
  }

  async function loadHistory() {
    const r = await fetch('/api/history');
    const d = await r.json();
    d.messages.forEach(m => {
      if(m.role === 'user') messagesSent++;
      addMsg(m);
    });
  }

  let typingIndicator = null;
  
  function addMsg(m) {
    const messages = document.getElementById('messages');
    const e = document.createElement('div');
    const isUser = m.role === 'user';
    e.className = 'flex ' + (isUser ? 'justify-end' : 'justify-start');
    
    const bubble = document.createElement('div');
    bubble.className = 'max-w-[80%] p-3 rounded-2xl ' + (isUser ? 'bg-indigo-600' : 'bg-gray-700');
    
    if (m.text) {
      bubble.innerHTML = '<p class="text-sm">' + m.text + '</p><span class="text-xs opacity-60 mt-1 block">' + new Date(m.at).toLocaleTimeString() + '</span>';
    } else if (m.fileUrl) {
      if (m.fileUrl.match(/\\.(jpg|jpeg|png|gif)$/)) {
        bubble.innerHTML = '<img src="' + m.fileUrl + '" class="max-w-[200px] rounded-xl"/><span class="text-xs opacity-60 mt-1 block">' + new Date(m.at).toLocaleTimeString() + '</span>';
      } else {
        bubble.innerHTML = '<a href="' + m.fileUrl + '" target="_blank" class="text-blue-400 underline">📎 Файл</a><span class="text-xs opacity-60 mt-1 block">' + new Date(m.at).toLocaleTimeString() + '</span>';
      }
    }
    
    e.appendChild(bubble);
    messages.appendChild(e);
    messages.scrollTop = messages.scrollHeight;
  }
  
  function showTyping() {
    if (typingIndicator) return;
    const messages = document.getElementById('messages');
    typingIndicator = document.createElement('div');
    typingIndicator.className = 'flex justify-start';
    typingIndicator.innerHTML = '<div class="bg-gray-700 p-3 rounded-2xl"><div class="typing-dots flex gap-1"><span>●</span><span>●</span><span>●</span></div></div>';
    messages.appendChild(typingIndicator);
    messages.scrollTop = messages.scrollHeight;
  }
  
  function hideTyping() {
    if (typingIndicator) {
      typingIndicator.remove();
      typingIndicator = null;
    }
  }

  // ФУНКЦИИ НАСТРОЕК
  function openSettings() {
    document.getElementById('settingsPanel').classList.add('open');
  }

  function closeSettings() {
    document.getElementById('settingsPanel').classList.remove('open');
  }

  async function changeTheme() {
    const theme = document.getElementById('themeSelect').value;
    applyTheme(theme);
    
    if (currentUser) {
      await fetch('/api/settings', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ theme })
      });
    }
  }

  async function changeLanguage() {
    const language = document.getElementById('languageSelect').value;
    updateLanguage(language);
    
    if (currentUser) {
      await fetch('/api/settings', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ language })
      });
    }
  }

  async function changeFontSize() {
    const fontSize = parseInt(document.getElementById('fontSizeSlider').value);
    document.getElementById('fontSizeValue').textContent = fontSize + 'px';
    document.getElementById('messages').style.fontSize = fontSize + 'px';
    
    if (currentUser) {
      await fetch('/api/settings', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ fontSize })
      });
    }
  }

    async function saveNotificationSettings() {
    if (!currentUser) return;
    
    const soundNotif = document.getElementById('soundNotif').checked;
    const desktopNotif = document.getElementById('desktopNotif').checked;
    
    await fetch('/api/settings', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ soundNotif, desktopNotif })
    });
  }

  // Слушатели изменений чекбоксов уведомлений
  document.getElementById('soundNotif').addEventListener('change', saveNotificationSettings);
  document.getElementById('desktopNotif').addEventListener('change', saveNotificationSettings);

  function clearChat() {
    if(confirm('Вы уверены, что хотите очистить всю историю чата?')) {
      const messages = document.getElementById('messages');
      while (messages.firstChild) {
        messages.removeChild(messages.firstChild);
      }
      // Здесь можно добавить вызов API для очистки на сервере
      messagesSent = 0;
      updateProfileStats();
    }
  }

  function exportChat() {
    const messages = Array.from(document.getElementById('messages').children)
      .map(msg => {
        const bubble = msg.querySelector('div');
        const text = bubble.querySelector('p')?.textContent || 
                    (bubble.querySelector('img') ? '[Изображение]' : 
                    (bubble.querySelector('a') ? '[Файл]' : ''));
        const time = bubble.querySelector('.text-xs')?.textContent || '';
        return `${time}: ${text}`;
      })
      .join('\\n');
    
    const blob = new Blob([messages], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-export-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ФУНКЦИИ ПРОФИЛЯ
  function openProfile() {
    updateProfileStats();
    document.getElementById('profileModal').classList.add('open');
  }

  function closeProfile() {
    document.getElementById('profileModal').classList.remove('open');
  }

  function updateProfileStats() {
    if (!currentUser) return;
    
    document.getElementById('profileUsername').textContent = currentUser.username;
    document.getElementById('profileId').textContent = currentUser.id;
    document.getElementById('messageCount').textContent = messagesSent;
    
    // Расчет времени в чате
    const minutes = Math.floor((Date.now() - chatStartTime) / 60000);
    const hours = Math.floor(minutes / 60);
    const displayTime = hours > 0 ? 
      \`\${hours}ч \${minutes % 60}м\` : \`\${minutes}м\`;
    document.getElementById('chatTime').textContent = displayTime;
    
    updateAvatarDisplay();
  }

  async function changePassword() {
    const currentPassword = prompt('Введите текущий пароль:');
    if (!currentPassword) return;
    
    const newPassword = prompt('Введите новый пароль:');
    if (!newPassword) return;
    
    const confirmPassword = prompt('Повторите новый пароль:');
    if (newPassword !== confirmPassword) {
      alert('Пароли не совпадают!');
      return;
    }
    
    try {
      const response = await fetch('/api/change-password', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ currentPassword, newPassword })
      });
      
      const result = await response.json();
      if (result.ok) {
        alert('Пароль успешно изменен!');
      } else {
        alert(result.error || 'Ошибка при изменении пароля');
      }
    } catch (error) {
      alert('Ошибка сети');
    }
  }

  // Обработка загрузки аватара
  document.getElementById('avatarInput').addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('avatar', file);
    
    try {
      const response = await fetch('/api/avatar', {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      if (result.ok) {
        currentUser.avatar = result.avatar;
        updateAvatarDisplay();
        alert('Аватар успешно обновлен!');
      } else {
        alert('Ошибка при загрузке аватара');
      }
    } catch (error) {
      alert('Ошибка сети');
    }
  });

  // ОСНОВНАЯ ЛОГИКА ЧАТА
  function connectEvents() {
    const es = new EventSource('/events');
    es.addEventListener('message', e => {
      const msg = JSON.parse(e.data);
      hideTyping();
      addMsg(msg);
    });
    
    es.addEventListener('open', e => {
      console.log('Connected to events');
    });
    
    es.addEventListener('error', e => {
      console.error('EventSource error:', e);
    });
  }

  async function sendMessage() {
    const input = document.getElementById('input');
    const fileInput = document.getElementById('file');
    let text = input.value.trim();
    let fileUrl = null;
    
    if (fileInput.files.length > 0) {
      const formData = new FormData();
      formData.append('file', fileInput.files[0]);
      
      try {
        const response = await fetch('/upload', {
          method: 'POST',
          body: formData
        });
        const result = await response.json();
        fileUrl = result.url;
      } catch (error) {
        alert('Ошибка загрузки файла');
        return;
      }
      fileInput.value = '';
    }
    
    if (!text && !fileUrl) return;
    
    await fetch('/api/message', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ text, fileUrl })
    });
    
    input.value = '';
    messagesSent++;
    updateProfileStats();
  }

  // ОБРАБОТЧИКИ СОБЫТИЙ
  document.getElementById('sendBtn').addEventListener('click', sendMessage);
  
  document.getElementById('input').addEventListener('keypress', e => {
    if (e.key === 'Enter') sendMessage();
  });
  
  document.getElementById('file').addEventListener('change', function() {
    if (this.files.length > 0) {
      sendMessage();
    }
  });

  // ИНИЦИАЛИЗАЦИЯ
  checkAuth();
  </script>
</body>
</html>`;
}

function operatorPage() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    .user-item.active { background: #4F46E5; color: white; }
    .message.user { background: #4F46E5; color: white; margin-left: 20%; }
    .message.assistant { background: #374151; color: white; margin-right: 20%; }
  </style>
</head>
<body class="bg-gray-900 text-white p-4">
  <h1 class="text-2xl mb-4">Операторская панель</h1>
  
  <div class="flex gap-4 h-[80vh]">
    <!-- Список пользователей -->
    <div class="w-1/4 bg-gray-800 rounded-lg p-4 overflow-y-auto">
      <h2 class="text-lg mb-3">Пользователи</h2>
      <div id="userList"></div>
    </div>
    
    <!-- Чат -->
    <div class="flex-1 bg-gray-800 rounded-lg p-4 flex flex-col">
      <h2 class="text-lg mb-3">Чат с <span id="currentUserName">...</span></h2>
      
      <div id="messages" class="flex-1 overflow-y-auto mb-3 space-y-2"></div>
      
      <div class="flex gap-2">
        <input id="input" class="flex-1 p-2 rounded bg-gray-700" placeholder="Сообщение...">
        <button id="sendBtn" class="bg-indigo-600 px-4 py-2 rounded">Отправить</button>
      </div>
    </div>
  </div>

  <script>
  let currentUserId = null;
  let users = {};
  
  const es = new EventSource('/operator/events?token=${OPERATOR_TOKEN}');
  es.addEventListener('snapshot', e => {
    const data = JSON.parse(e.data);
    updateUserList(data.list);
  });
  
  es.addEventListener('new_user_message', e => {
    const data = JSON.parse(e.data);
    if (users[data.userId]) {
      users[data.userId].preview = data.preview;
      updateUserList();
    }
  });
  
  es.addEventListener('assistant_message', e => {
    const data = JSON.parse(e.data);
    if (currentUserId === data.userId) {
      loadHistory();
    }
  });
  
  function updateUserList(list) {
    if (list) {
      list.forEach(item => {
        users[item.id] = { id: item.id, count: item.count, preview: '' };
      });
    }
    
    const userList = document.getElementById('userList');
    userList.innerHTML = '';
    
    Object.values(users).forEach(user => {
      const div = document.createElement('div');
      div.className = 'p-2 border-b border-gray-700 cursor-pointer hover:bg-gray-700 user-item';
      if (user.id === currentUserId) div.className += ' active';
      div.innerHTML = \`User \${user.id} (\${user.count})<br><small>\${user.preview || 'Нет сообщений'}</small>\`;
      div.addEventListener('click', () => selectUser(user.id));
      userList.appendChild(div);
    });
  }
  
  function selectUser(userId) {
    currentUserId = userId;
    document.getElementById('currentUserName').textContent = userId;
    document.querySelectorAll('.user-item').forEach(item => {
      item.classList.remove('active');
    });
    document.querySelectorAll('.user-item').forEach(item => {
      if (item.textContent.includes(userId)) item.classList.add('active');
    });
    loadHistory();
  }
  
  async function loadHistory() {
    if (!currentUserId) return;
    
    const r = await fetch(\`/api/history?userId=\${currentUserId}\`);
    const d = await r.json();
    
    const messages = document.getElementById('messages');
    messages.innerHTML = '';
    
    d.messages.forEach(m => {
      const div = document.createElement('div');
      div.className = \`p-3 rounded-lg message \${m.role}\`;
      div.textContent = m.text || '[file]';
      messages.appendChild(div);
    });
    
    messages.scrollTop = messages.scrollHeight;
  }
  
  async function sendMessage() {
    if (!currentUserId) return alert('Выберите пользователя');
    
    const input = document.getElementById('input');
    const text = input.value.trim();
    if (!text) return;
    
    await fetch(\`/operator/reply?token=${OPERATOR_TOKEN}\`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ userId: currentUserId, text })
    });
    
    input.value = '';
    loadHistory();
  }
  
  document.getElementById('sendBtn').addEventListener('click', sendMessage);
  document.getElementById('input').addEventListener('keypress', e => {
    if (e.key === 'Enter') sendMessage();
  });
  </script>
</body>
</html>`;
}

// Запуск сервера
app.listen(PORT, () => console.log(\`Server running on http://localhost:\${PORT}\`));

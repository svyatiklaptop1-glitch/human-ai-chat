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
      <h2 class="text-lg font-semibold">💬 Чат поддержки</h2>
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
      chatSupport: "💬 Чат поддержки",
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
      chatSupport: "💬 Support Chat",
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
      chatSupport: "💬 Қолдау чаты",
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
    if (currentUser.avatar) {
      document.getElementById('profileAvatar').src = currentUser.avatar;
      document.getElementById('profileAvatar').classList.remove('hidden');
      document.getElementById('profileAvatarPlaceholder').classList.add('hidden');
    }
  }

  function applyTheme(theme) {
    const body = document.body;
    const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    if (isDark) {
      body.classList.add('bg-gray-900', 'text-white');
      body.classList.remove('bg-gray-100', 'text-gray-900');
    } else {
      body.classList.add('bg-gray-100', 'text-gray-900');
      body.classList.remove('bg-gray-900', 'text-white');
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

  function clearChat() {
    if (confirm('Очистить историю чата?')) {
      document.getElementById('messages').innerHTML = '';
      messagesSent = 0;
    }
  }

  function exportChat() {
    const messages = document.getElementById('messages').innerText;
    const blob = new Blob([messages], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chat_export_' + new Date().toISOString().slice(0,10) + '.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ФУНКЦИИ ПРОФИЛЯ
  function openProfile() {
    document.getElementById('profileModal').classList.add('open');
    if(currentUser) {
      document.getElementById('profileUsername').textContent = currentUser.username;
      document.getElementById('profileId').textContent = currentUser.id;
      document.getElementById('messageCount').textContent = messagesSent;
      
      const minutes = Math.floor((Date.now() - chatStartTime) / 60000);
      document.getElementById('chatTime').textContent = minutes + 'м';
      
      if(currentUser.avatar) {
        document.getElementById('profileAvatar').src = currentUser.avatar;
        document.getElementById('profileAvatar').classList.remove('hidden');
        document.getElementById('profileAvatarPlaceholder').classList.add('hidden');
      } else {
        document.getElementById('profileAvatar').classList.add('hidden');
        document.getElementById('profileAvatarPlaceholder').classList.remove('hidden');
      }
    }
  }

  function closeProfile() {
    document.getElementById('profileModal').classList.remove('open');
  }

  async function changeAvatar() {
    const fileInput = document.getElementById('avatarInput');
    if (!fileInput.files.length) return;
    
    const formData = new FormData();
    formData.append('avatar', fileInput.files[0]);
    
    const response = await fetch('/api/avatar', {
      method: 'POST',
      body: formData
    });
    
    if (response.ok) {
      const result = await response.json();
      currentUser.avatar = result.avatar;
      
      document.getElementById('profileAvatar').src = result.avatar;
      document.getElementById('profileAvatar').classList.remove('hidden');
      document.getElementById('profileAvatarPlaceholder').classList.add('hidden');
      
      alert('Аватар успешно обновлен!');
    } else {
      alert('Ошибка при загрузке аватара');
    }
  }

  async function changePassword() {
    const currentPassword = prompt('Введите текущий пароль:');
    if (!currentPassword) return;
    
    const newPassword = prompt('Введите новый пароль:');
    if (!newPassword) return;
    
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
  }

  // ОБРАБОТЧИКИ СОБЫТИЙ
  document.getElementById('avatarInput').addEventListener('change', changeAvatar);
  document.getElementById('soundNotif').addEventListener('change', saveNotificationSettings);
  document.getElementById('desktopNotif').addEventListener('change', saveNotificationSettings);

  function connectEvents() {
    const es = new EventSource('/events');
    es.addEventListener('message', e => {
      const m = JSON.parse(e.data);
      if (m.role === 'assistant') hideTyping();
      addMsg(m);
    });
  }

  async function send() {
    const input = document.getElementById('input');
    const fileInput = document.getElementById('file');
    const text = input.value.trim();
    const file = fileInput.files[0];
    
    if (!text && !file) return;
    
    if (file) {
      const formData = new FormData();
      formData.append('file', file);
      const r = await fetch('/upload', { method: 'POST', body: formData });
      const d = await r.json();
      await fetch('/api/message', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ fileUrl: d.url })
      });
      fileInput.value = '';
    } else {
      await fetch('/api/message', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ text })
      });
      input.value = '';
    }
    messagesSent++;
    showTyping();
  }

  document.getElementById('input').addEventListener('keydown', e => {
    if (e.key === 'Enter') send();
  });
  document.getElementById('sendBtn').addEventListener('click', send);

  // ИНИЦИАЛИЗАЦИЯ
  checkAuth();
  </script>
</body>
</html>`;
}

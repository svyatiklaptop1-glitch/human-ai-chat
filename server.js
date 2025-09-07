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
  <style

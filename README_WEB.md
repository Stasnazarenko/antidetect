# Antidetect Browser Manager - Web UI

Веб-інтерфейс для керування антидетект-профілями на базі Camoufox.

## 🚀 Запуск

### CLI режим (консольний інтерфейс):
```bash
npm start
# або
node index.js
```

### Web UI режим:
```bash
npm run web
# або
node server.js
```
СТОПППП:

pkill -f "node server.js" 2>/dev/null; sleep 1


Відкрийте браузер: **http://localhost:3000**

## 📋 Функціонал

### Основні можливості:
- ✅ **Створення профілів** - швидке створення нових браузер-профілів
- ✅ **Відкриття/Закриття** - запуск та зупинка профілів одним кліком
- ✅ **Налаштування проксі** - HTTP/HTTPS/SOCKS5 підтримка
- ✅ **Fingerprint генерація** - автоматична генерація fingerprints для macOS/Windows
- ✅ **Real-time оновлення** - WebSocket для миттєвого оновлення статусу
- ✅ **Пошук та фільтри** - швидкий пошук та фільтрація профілів
- ✅ **Cleanup** - автоматичне очищення "мертвих" браузерів

### Статистика:
- Загальна кількість профілів
- Відкриті профілі
- Профілі з проксі

### Фільтри:
- Пошук по назві профілю
- Статус (всі / відкриті / закриті)
- Проксі (всі / з проксі / без проксі)

## 🎨 Скріншоти

### Головна сторінка
![Dashboard](docs/dashboard.png)

### Карточка профілю
- 🟢 **Open** - профіль активний
- ⚫ **Closed** - профіль закритий
- ✅ **Proxy Configured** - налаштований проксі
- 🎲 **Random Fingerprint** - випадковий fingerprint

## 🔧 API Endpoints

### Профілі
```
GET    /api/profiles           - Отримати список профілів
POST   /api/profiles           - Створити профіль
POST   /api/profiles/:name/open     - Відкрити профіль
POST   /api/profiles/:name/close    - Закрити профіль
DELETE /api/profiles/:name           - Видалити профіль
```

### Налаштування
```
POST   /api/profiles/:name/proxy          - Налаштувати проксі
DELETE /api/profiles/:name/proxy          - Видалити проксі
POST   /api/profiles/:name/fingerprint    - Згенерувати fingerprint
DELETE /api/profiles/:name/fingerprint    - Видалити fingerprint
POST   /api/profiles/:name/rename         - Перейменувати профіль
```

### Утиліти
```
POST   /api/cleanup            - Очистити мертві браузери
```

## 🌐 WebSocket Events

### Server → Client:
- `profile_created` - новий профіль створено
- `profile_opened` - профіль відкрито
- `profile_closed` - профіль закрито
- `profile_deleted` - профіль видалено
- `profile_updated` - профіль оновлено
- `profile_renamed` - профіль перейменовано

## 🔐 Безпека

- CORS увімкнено для локальної розробки
- Немає автентифікації (для локального використання)
- Для production рекомендується додати:
  - JWT автентифікацію
  - Rate limiting
  - HTTPS
  - CORS обмеження

## 📦 Технології

- **Backend**: Express.js + Socket.IO
- **Frontend**: Vanilla JS + CSS3
- **Browser Engine**: Camoufox (Firefox-based)
- **Fingerprinting**: BrowserForge
- **Database**: JSON-based local storage

## 🐛 Troubleshooting

### Профіль не відкривається:
```bash
# Очистити мертві браузери через UI або:
npm run web
# Натиснути "Cleanup Dead Browsers"
```

### Порт зайнятий:
```bash
# Змінити порт через змінну оточення:
PORT=3001 npm run web
```

### Python bridge не запускається:
```bash
# Перевірити Python та залежності:
python3 --version
pip install camoufox browserforge
```

## 📝 TODO

- [ ] Експорт/Імпорт профілів
- [ ] Групи профілів
- [ ] Автоматизація задач
- [ ] Розширені налаштування fingerprint
- [ ] Логи активності
- [ ] Темна тема
- [ ] Multi-user підтримка

## 📄 Ліцензія

MIT License


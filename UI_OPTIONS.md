# 🚀 Antidetect Browser Manager - UI Версії

## 3️⃣ Варіанти для Використання

### 1️⃣ **Веб-версія (Web UI)** 
**Запуск:**
```bash
npm run web
# або
node server.js
```
**Доступ:** `http://localhost:3000`

**Переваги:**
- ✅ Легко запустити
- ✅ Будь-який браузер
- ✅ Мобіль-сумісна

**Недоліки:**
- ❌ Залежність від браузера
- ❌ Більше ресурсів

---

### 2️⃣ **Нативна macOS GUI (PyQt6)**
**Встановлення:**
```bash
pip3 install PyQt6
```

**Запуск:**
```bash
python3 scr/macos_gui.py
```

**Переваги:**
- ✅ Нативна macOS сторінка
- ✅ Мало ресурсів (~50MB RAM)
- ✅ Швидке завантаження
- ✅ MacOS інтеграція (меню, notifications)

**Недоліки:**
- ❌ Тільки для macOS
- ❌ Потрібен Python

---

### 3️⃣ **Electron (Кросплатформна)**
**Встановлення:**
```bash
npm install electron electron-builder --save-dev
```

**Запуск:**
```bash
npm run dev
```

**Збірка:**
```bash
# Для macOS
npm run build-mac
# Результат: dmg файл в dist/

# Для Windows
npm run build-win

# Для Linux
npm run build-linux
```

**Переваги:**
- ✅ Кросплатформна (macOS, Windows, Linux)
- ✅ Нативний вигляд кожної платформи
- ✅ Auto-update підтримка
- ✅ Вбудований Node.js сервер

**Недоліки:**
- ❌ Більше ресурсів (~250MB на диску)
- ⚠️ Більший package (~150MB)

---

## 🎯 Рекомендації

| Сценарій | Вибір |
|----------|-------|
| Швидкий старт | **Web UI** |
| Тільки macOS, мало ресурсів | **PyQt6 GUI** |
| Багато користувачів | **Electron** |
| Мобіль доступ | **Web UI** |
| Професійна сборка | **Electron** |

---

## 🔧 Порівняння

| Параметр | Web | PyQt6 | Electron |
|----------|-----|-------|----------|
| RAM на старт | 80MB | 50MB | 200MB |
| Розмір дистрибутива | - | - | 150MB |
| Платформи | Всі | macOS | macOS/Win/Linux |
| Запуск | 3s | 1s | 2s |
| Складність | Легка | Середня | Складна |
| Auto-update | ❌ | ❌ | ✅ |

---

## 📦 Структура файлів

```
antidetect/
├── index.html          # Веб-UI
├── app.js              # Фронтенд логіка
├── server.js           # Node.js сервер
├── main.js             # Electron точка входу
├── scr/
│   ├── macos_gui.py    # macOS нативна GUI
│   ├── manage.js       # Керування профілями
│   └── camoufox_bridge.py
└── storage/
    └── profiles.json
```

---

## 🚀 Швидкий Старт

### Для Веб-версії:
```bash
npm install
npm run web
open http://localhost:3000
```

### Для macOS (PyQt6):
```bash
pip3 install PyQt6
python3 scr/macos_gui.py
```

### Для Electron:
```bash
npm install --save-dev electron
npm run dev
# або
npm run build-mac
```

---

## 💡 Мої Рекомендації

### ✅ Для Вас (локальне використання):
1. **PyQt6 GUI** - найкраще для macOS
   - Мало ресурсів
   - Нативна інтеграція
   - Швидкий старт

2. **Electron** - якщо потрібна портативність
   - Один білд для всіх платформ
   - Професійний вигляд
   - Auto-updates

### ⚠️ Спільна Робота:
- **Веб-versify** - дають іншим доступ через URL

---

## 📝 Встановлення PyQt6 (Рекомендується)

```bash
# macOS
brew install python-pyqt6

# або через pip
pip3 install --upgrade pip
pip3 install PyQt6
```

## 🔄 Перехід між Версіями

Всі версії використовують **одну й ту ж БД** (`storage/profiles.json`), тому можеш:
- Запустити Веб-UI для тестування
- Потім перейти на PyQt6 GUI для щоденної роботи
- Electron для розповсюдження

**Дані зберігаються в одному місці - все синхронізовано!**

---

## ❓ FAQ

**Q: Яка версія найбільш стабільна?**
A: Web UI - вона найпростіша

**Q: Яка найшвидша?**
A: PyQt6 GUI - запускається за 1 секунду

**Q: Яка найкраще виглядає?**
A: Electron - найпрофесійніший вигляд

**Q: Чи можна всі запустити разом?**
A: Ні, вони конфліктують на порту 3000. Запускай один за раз.

---

## 🎯 Наступні Кроки

Виберіть версію і запустіть:

```bash
# Виберіть один із трьох:

# 1. Веб-версія
npm run web

# 2. macOS нативна GUI
python3 scr/macos_gui.py

# 3. Electron (після npm install electron)
npm run dev
```

**Все готово до запуску!** 🚀


import sys
import json
import traceback
import asyncio
import random
from camoufox.async_api import AsyncCamoufox
from pathlib import Path


class BrowserManager:
    def __init__(self):
        self.browsers = {}
        self.profiles_dir = Path(__file__).parent.parent / "profiles"
        self.profiles_dir.mkdir(exist_ok=True)
        self.close_lock = asyncio.Lock()  # Забезпечує послідовне закриття
        self.launch_semaphore = asyncio.Semaphore(3)  # Максимум 3 одночасних запусків

    def _get_fingerprint_config(self, os_type: str):
        """Генерує конфігурацію фінгерпринту для вказаної ОС"""
        if os_type == "macos":
            mac_variants = [
                {"cores": 8, "inner_w": 1512, "inner_h": 982, "outer_w": 1512, "outer_h": 982},
            ]
            rm_mac_variants = [
                # 1–2. MacBook Air 13" M1/M2/M3/M4 (роздільна здатність 2560×1600 @2x, масштабування "looks like 1440×900")
                {"cores": 8,  "inner_w": 1512, "inner_h": 982, "outer_w": 1440, "outer_h": 982},   # dock зверху/знизу
                {"cores": 10, "inner_w": 1512, "inner_h": 982, "outer_w": 1440, "outer_h": 982},

                # 3–4. MacBook Air 15" M2/M3/M4 (2880×1864 @2x → looks like 1512×982)
                {"cores": 10, "inner_w": 1512, "inner_h": 982, "outer_w": 1512, "outer_h": 982},
                {"cores": 10, "inner_w": 1512, "inner_h": 982, "outer_w": 1512, "outer_h": 982},

                # 5–8. MacBook Pro 14" M1–M4 Pro/Max (3024×1964 @2x → looks like 1512×982 або 1728×1117)
                {"cores": 10, "inner_w": 1512, "inner_h": 982, "outer_w": 1512, "outer_h": 982},   # default scaling
                {"cores": 12, "inner_w": 1512, "inner_h": 982, "outer_w": 1512, "outer_h": 982},
                {"cores": 12, "inner_w": 1512, "inner_h": 982, "outer_w": 1512, "outer_h": 982},  # "more space"
                {"cores": 14, "inner_w": 1512, "inner_h": 982, "outer_w": 1512, "outer_h": 982},

                # 9–12. MacBook Pro 16" M1–M4 Pro/Max (3456×2234 @2x → looks like 1728×1117 або 1920×1200)
                {"cores": 10, "inner_w": 1512, "inner_h": 982, "outer_w": 1512, "outer_h": 982},
                {"cores": 12, "inner_w": 1512, "inner_h": 982, "outer_w": 1512, "outer_h": 982},
                {"cores": 14, "inner_w": 1512, "inner_h": 982, "outer_w": 1512, "outer_h": 982},   # "more space"
                {"cores": 16, "inner_w": 1512, "inner_h": 982, "outer_w": 1512, "outer_h": 982},
            ]

            variant = random.choice(mac_variants)
            # 'navigator.language': 'en-US',
            # 'navigator.languages': ['en-US', 'en'],
            return {
                'window.outerHeight': variant["outer_h"],
                'window.outerWidth': variant["outer_w"],
                'window.innerHeight': variant["inner_h"],
                'window.innerWidth': variant["inner_w"],
                'window.history.length': random.randint(2, 20),
                'navigator.userAgent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Firefox/146.0',
                'navigator.appCodeName': 'Mozilla',
                'navigator.appName': 'Netscape',
                'navigator.appVersion': '5.0 (Macintosh)',
                'navigator.oscpu': 'Intel Mac OS X 10_15_7',
                'navigator.platform': 'MacIntel',
                'navigator.hardwareConcurrency': variant["cores"],
                'navigator.product': 'Gecko',
                'navigator.productSub': '20100101',
                'navigator.maxTouchPoints': 0,
            }
        else:  # windows
            windows_variants = [
                {"cores": 8, "inner_w": 1512, "inner_h": 982, "outer_w": 1512, "outer_h": 982},
                # Близькі до твого 1512x982 — ти бачиш майже те саме, але fingerprint різний
                {"cores": 10, "outer_w": 1512, "outer_h": 982, "inner_w": 1512, "inner_h": 982},
                {"cores": 8,  "outer_w": 1520, "outer_h": 980, "inner_w": 1504, "inner_h": 966},
                {"cores": 12, "outer_w": 1500, "outer_h": 990, "inner_w": 1484, "inner_h": 976},
                {"cores": 10, "outer_w": 1536, "outer_h": 970, "inner_w": 1520, "inner_h": 956},
                {"cores": 8,  "outer_w": 1490, "outer_h": 1000,"inner_w": 1474, "inner_h": 986},
                {"cores": 12, "outer_w": 1510, "outer_h": 985, "inner_w": 1494, "inner_h": 971},
                {"cores": 10, "outer_w": 1528, "outer_h": 978, "inner_w": 1512, "inner_h": 964},
                {"cores": 14, "outer_w": 1508, "outer_h": 992, "inner_w": 1492, "inner_h": 978}
            ]
            variant = random.choice(windows_variants)
            # 'navigator.language': 'en-US',
            # 'navigator.languages': ['en-US'],
            return {
                'window.outerHeight': variant["outer_h"],
                'window.outerWidth': variant["outer_w"],
                'window.innerHeight': variant["inner_h"],
                'window.innerWidth': variant["inner_w"],
                'window.history.length': random.randint(3, 40),
                'navigator.userAgent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:146.0) Gecko/20100101 Firefox/146.0',
                'navigator.appCodeName': 'Mozilla',
                'navigator.appName': 'Netscape',
                'navigator.appVersion': '5.0 (Windows NT 10.0; Win64; x64)',
                'navigator.oscpu': 'Windows NT 10.0; Win64; x64',
                'navigator.platform': 'Win64',
                'navigator.hardwareConcurrency': variant["cores"],
                'navigator.product': 'Gecko',
                'navigator.productSub': '20030107',
                'navigator.maxTouchPoints': 10,
            }

    async def _cleanup_dead_browsers(self):
        """Очищає закриті браузери з реєстру"""
        dead_profiles = []
        for profile_name in list(self.browsers.keys()):
            try:
                browser = self.browsers[profile_name]["browser"]
                if not browser.is_connected():
                    dead_profiles.append(profile_name)
            except:
                dead_profiles.append(profile_name)

        for profile_name in dead_profiles:
            del self.browsers[profile_name]

        return len(dead_profiles)

    async def launch_profile(self, profile_name: str, config: dict):
        # Обмежуємо кількість одночасних запусків (max 3)
        async with self.launch_semaphore:
            try:
                # Спочатку очищаємо мертві браузери
                await self._cleanup_dead_browsers()

                # Тепер перевіряємо чи профіль відкритий
                if profile_name in self.browsers:
                    print(f"[BRIDGE] Profile {profile_name} already open", file=sys.stderr)
                    return {"success": False, "error": "Profile already open"}

                profile_path = self.profiles_dir / profile_name
                profile_path.mkdir(exist_ok=True)

                os_type_options = ["macos", "windows"]
                os_type = random.choice(os_type_options) # Генеруємо для macOS
                # fingerprint: використовуємо dict якщо є, інакше дефолт
                if "fingerprint" in config and isinstance(config["fingerprint"], dict):
                    fingerprint_config = self._convert_db_fingerprint(config["fingerprint"])
                else:
                    fingerprint_config = self._get_fingerprint_config(os_type)

                launch_config = {
                    "headless": False,
                    "persistent_context": True,
                    "user_data_dir": str(profile_path),
                    "os": os_type,
                    "config": fingerprint_config,
                    "i_know_what_im_doing": True
                }

                # Нормалізація проксі: приймаємо рядок (json або host:port...) або dict
                proxy_raw = config.get("proxy")
                if proxy_raw:
                    proxy_obj = self._normalize_proxy(proxy_raw)
                    if proxy_obj:
                        launch_config["proxy"] = proxy_obj
                    else:
                        print(f"[BRIDGE] Invalid proxy format for profile {profile_name}: {proxy_raw}", file=sys.stderr)
                        return {"success": False, "error": "Invalid proxy format", "proxy": proxy_raw}

                # Логуємо конфіг для дебагу
                try:
                    print(f"[BRIDGE] Launch config for {profile_name}: {json.dumps(launch_config, indent=2)}", file=sys.stderr)
                except Exception:
                    print(f"[BRIDGE] Launch config (non-serializable) for {profile_name}", file=sys.stderr)

                camoufox = None
                browser = None

                # Якщо є проксі — спробувати кілька варіантів формату, поки один не спрацює
                if "proxy" in launch_config:
                    proxy_try = launch_config.get("proxy")
                    attempts = []

                    # 1) як dict (server, username, password, type)
                    attempts.append(proxy_try)

                    # 2) як URL string з авторизацією або без
                    if isinstance(proxy_try, dict):
                        server = proxy_try.get('server')
                        typ = proxy_try.get('type', 'http')
                        user = proxy_try.get('username')
                        pwd = proxy_try.get('password')
                        if user and pwd:
                            attempts.append(f"{typ}://{user}:{pwd}@{server}")
                        attempts.append(f"{typ}://{server}")
                        # також plain host:port
                        attempts.append(server)
                    elif isinstance(proxy_try, str):
                        attempts.append(proxy_try)

                    last_error = None
                    success = False

                    for idx, attempt_proxy in enumerate(attempts):
                        try:
                            trial_config = dict(launch_config)
                            trial_config['proxy'] = attempt_proxy

                            try:
                                print(f"[BRIDGE] Trying proxy format #{idx+1} for {profile_name}: {attempt_proxy}", file=sys.stderr)
                            except Exception:
                                pass

                            camoufox = AsyncCamoufox(**trial_config)
                            try:
                                browser = await camoufox.start()
                            except Exception as e:
                                last_error = str(e)
                                print(f"[BRIDGE] camoufox.start() failed on attempt #{idx+1}: {e}", file=sys.stderr)
                                # attempt to stop camoufox if available
                                try:
                                    if hasattr(camoufox, 'stop'):
                                        await camoufox.stop()
                                except Exception:
                                    pass
                                continue

                            # short settle
                            try:
                                await asyncio.sleep(0.5)
                            except Exception:
                                pass

                            # check by trying to get/create a page instead of is_connected
                            page = None
                            try:
                                pages = getattr(browser, 'pages', None)
                                if pages and len(pages) > 0:
                                    page = pages[0]
                                else:
                                    page = await browser.new_page()
                            except Exception as e:
                                last_error = str(e)
                                print(f"[BRIDGE] Failed to get/create page on attempt #{idx+1}: {e}", file=sys.stderr)
                                # cleanup
                                try:
                                    if hasattr(browser, 'close'):
                                        await browser.close()
                                except Exception:
                                    pass
                                try:
                                    if hasattr(camoufox, 'stop'):
                                        await camoufox.stop()
                                except Exception:
                                    pass
                                continue

                            # If we have a page - success
                            if page:
                                launch_config['proxy'] = attempt_proxy
                                success = True
                                # store browser and page to reuse after loop
                                final_browser = browser
                                final_camoufox = camoufox
                                final_page = page
                                print(f"[BRIDGE] Proxy attempt #{idx+1} worked for {profile_name}", file=sys.stderr)
                                break
                            else:
                                last_error = 'no page available after start'
                                print(f"[BRIDGE] No page available after start on attempt #{idx+1}", file=sys.stderr)
                                # cleanup
                                try:
                                    if hasattr(browser, 'close'):
                                        await browser.close()
                                except Exception:
                                    pass
                                try:
                                    if hasattr(camoufox, 'stop'):
                                        await camoufox.stop()
                                except Exception:
                                    pass
                                continue

                        except Exception as e:
                            last_error = str(e)
                            print(f"[BRIDGE] Exception during proxy attempt #{idx+1}: {e}", file=sys.stderr)
                            try:
                                if camoufox and hasattr(camoufox, 'stop'):
                                    await camoufox.stop()
                            except Exception:
                                pass
                            continue

                    if not success:
                        print(f"[BRIDGE] All proxy attempts failed for {profile_name}, last error: {last_error}", file=sys.stderr)
                        return {"success": False, "error": "Browser failed to start/connect with proxy", "detail": last_error, "proxy_attempts": attempts}

                else:
                    # без проксі — звичайний старт
                    try:
                        camoufox = AsyncCamoufox(**launch_config)
                        browser = await camoufox.start()
                    except Exception as e:
                        print(f"[BRIDGE] Camoufox.start failed for {profile_name}: {e}", file=sys.stderr)
                        return {"success": False, "error": "Failed to start browser", "detail": str(e), "trace": traceback.format_exc()}

                    # Try to get or create a page - treat success if we can create a page
                    try:
                        pages = getattr(browser, 'pages', None)
                        if pages and len(pages) > 0:
                            page = pages[0]
                        else:
                            page = await browser.new_page()
                    except Exception as e:
                        print(f"[BRIDGE] Failed to get/create page for {profile_name}: {e}", file=sys.stderr)
                        try:
                            if hasattr(browser, 'close'):
                                await browser.close()
                        except Exception:
                            pass
                        try:
                            if hasattr(camoufox, 'stop'):
                                await camoufox.stop()
                        except Exception:
                            pass
                        return {"success": False, "error": "Browser failed to initialize page after start", "detail": str(e)}

                    # assign final references for consistency
                    final_browser = browser
                    final_camoufox = camoufox
                    final_page = page

                # після успішного старту browser має бути встановлено
                if not (final_browser and final_page):
                    return {"success": False, "error": "Browser object not created or no page", "proxy_used": launch_config.get('proxy')}

                # Невелика пауза, щоб процес устаканився
                try:
                    await asyncio.sleep(0.5)
                except Exception:
                    pass

                # Отримуємо існуючу сторінку і зберігаємо об'єкти
                browser = final_browser
                page = final_page
                camoufox = final_camoufox

                self.browsers[profile_name] = {
                    "browser": browser,
                    "page": page,
                    "profile_path": profile_path,
                    "camoufox": camoufox
                }

                print(f"[BRIDGE] Profile {profile_name} launched successfully", file=sys.stderr)
                return {"success": True, "profile": profile_name, "os": os_type}

            except Exception as e:
                print(f"[BRIDGE] Exception launching profile {profile_name}: {e}\n{traceback.format_exc()}", file=sys.stderr)
                return {"success": False, "error": str(e), "trace": traceback.format_exc()}

    def _convert_db_fingerprint(self, db_fp: dict):
        """Конвертує fingerprint з БД у простий для Camoufox (window.*, navigator.*)"""
        config = {}
        # Витягуємо тільки window.* та navigator.*
        for key in db_fp:
            if key.startswith('window.') or key.startswith('navigator.'):
                config[key] = db_fp[key]
            # Додаємо підтримку product, productSub, maxTouchPoints (якщо є)
            if key in ["product", "productSub", "maxTouchPoints"]:
                config[f"navigator.{key}"] = db_fp[key]
        return config

    def _normalize_proxy(self, proxy_raw):
        """Normalize proxy input into a dict acceptable for Camoufox or return None if invalid.
        Returns dict with keys: server (host:port), username (optional), password (optional), type (http/socks5)
        """
        if not proxy_raw:
            return None

        proxy_obj = None
        # Якщо отримали вже dict — копіюємо
        if isinstance(proxy_raw, dict):
            proxy_obj = proxy_raw.copy()
        elif isinstance(proxy_raw, str):
            # Спробуємо розпарсити як URL
            try:
                from urllib.parse import urlparse
                p = urlparse(proxy_raw)
                if p.scheme and (p.hostname or p.netloc):
                    scheme = p.scheme
                    host = p.hostname or ''
                    port = p.port
                    username = p.username
                    password = p.password
                    if host and port:
                        proxy_obj = { 'server': f"{host}:{port}", 'type': scheme }
                        if username:
                            proxy_obj['username'] = username
                        if password:
                            proxy_obj['password'] = password
                else:
                    # Не схема — формат user:pass@host:port або host:port
                    import re
                    m = re.match(r'(?:(?P<user>[^:@]+):(?P<pass>[^@]+)@)?(?P<host>[^:]+):(?P<port>\d+)$', proxy_raw)
                    if m:
                        host = m.group('host')
                        port = m.group('port')
                        user = m.group('user')
                        pwd = m.group('pass')
                        proxy_obj = { 'server': f"{host}:{port}", 'type': 'http' }
                        if user:
                            proxy_obj['username'] = user
                        if pwd:
                            proxy_obj['password'] = pwd
                    else:
                        # як останній варіант — якщо просто host без порту, відкидаємо
                        proxy_obj = None
            except Exception:
                proxy_obj = None
        else:
            return None

        if not proxy_obj:
            return None

        # Нормалізація полів: якщо є server у вигляді URL, витягнути host:port
        server = proxy_obj.get('server')
        if server and isinstance(server, str):
            # Якщо випадково має 'http://' чи 'socks5://' — видалимо
            for prefix in ('http://', 'https://', 'socks5://', 'socks4://'):
                if server.startswith(prefix):
                    server = server[len(prefix):]
            proxy_obj['server'] = server

        # Переконаємось, що server виглядає як host:port
        if 'server' in proxy_obj and isinstance(proxy_obj['server'], str) and ':' in proxy_obj['server']:
            # Встановити тип за замовчуванням
            if 'type' not in proxy_obj or not proxy_obj['type']:
                proxy_obj['type'] = 'http'
            # Уникнути лишніх полів
            return {k: proxy_obj[k] for k in ('server', 'username', 'password', 'type') if k in proxy_obj}

        return None

    async def close_profile(self, profile_name: str):
        try:
            if profile_name not in self.browsers:
                return {"success": False, "error": "Profile not open"}

            browser_info = self.browsers[profile_name]

            # Закриваємо браузер і сторінку ПОСЛІДОВНО
            async with self.close_lock:
                try:
                    await asyncio.wait_for(browser_info["page"].close(), timeout=3)
                except Exception as e:
                    print(f"Error closing page: {e}", file=sys.stderr)
                try:
                    await asyncio.wait_for(browser_info["browser"].close(), timeout=3)
                except Exception as e:
                    print(f"Error closing browser: {e}", file=sys.stderr)

            # Тільки після закриття видаляємо з self.browsers
            # capture profile path for possible cleanup
            profile_path = browser_info.get('profile_path')
            del self.browsers[profile_name]

            # Якщо це ефермерний профіль — видаляємо його папку повністю
            try:
                if profile_name.startswith('_ephemeral_') and profile_path:
                    import shutil
                    # profile_path may be a Path object or string
                    pp = profile_path if isinstance(profile_path, str) else str(profile_path)
                    try:
                        shutil.rmtree(pp)
                        print(f"[BRIDGE] Removed ephemeral profile dir: {pp}", file=sys.stderr)
                    except Exception as e:
                        print(f"[BRIDGE] Failed to remove ephemeral profile dir {pp}: {e}", file=sys.stderr)
            except Exception:
                pass

            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def execute_script(self, profile_name: str, script: str):
        """Виконує JavaScript скрипт в профілі (для RPA)"""
        try:
            if profile_name not in self.browsers:
                return {"success": False, "error": "Profile not open"}

            page = self.browsers[profile_name]["page"]
            result = await page.evaluate(script)

            return {"success": True, "result": result}
        except Exception as e:
            return {"success": False, "error": str(e), "trace": traceback.format_exc()}

    async def navigate_profile(self, profile_name: str, url: str):
        """Навігація на URL в профілі"""
        try:
            if profile_name not in self.browsers:
                return {"success": False, "error": "Profile not open"}

            page = self.browsers[profile_name]["page"]
            await page.goto(url, wait_until='networkidle')

            return {"success": True, "url": page.url}
        except Exception as e:
            return {"success": False, "error": str(e), "trace": traceback.format_exc()}

    async def get_profile_status(self, profile_name: str):
        """Отримати статус і поточний URL профілю"""
        try:
            if profile_name not in self.browsers:
                return {"success": False, "error": "Profile not open", "open": False}

            page = self.browsers[profile_name]["page"]

            return {
                "success": True,
                "open": True,
                "url": page.url,
                "title": await page.title()
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def execute_rpa_sequence(self, profile_name: str, sequence: list, options: dict):
        """Execute a simple RPA sequence on an opened profile.
        Supported action types (case-insensitive):
          - open_url: { "type": "open_url", "url": "https://...", "delay": optional_ms }
          - execute_js: { "type": "execute_js", "code": "return 1+1;" }
          - click: { "type": "click", "selector": "#btn" }
          - fill: { "type": "fill", "selector": "#input", "value": "text" }
        The method returns a dict { success: bool, results: [ ... ] } or an error object on failure.
        """
        try:
            if profile_name not in self.browsers:
                return {"success": False, "error": "Profile not open"}

            page = self.browsers[profile_name]["page"]
            results = []

            # Normalize sequence
            if not sequence:
                return {"success": True, "results": []}

            for idx, step in enumerate(sequence):
                try:
                    if not isinstance(step, dict):
                        results.append({"index": idx, "success": False, "error": "Step is not an object"})
                        return {"success": False, "results": results, "error": f"Invalid step at index {idx}"}

                    typ = (step.get('type') or '').lower()

                    if typ in ('open_url', 'navigate', 'goto'):
                        url = step.get('url') or step.get('value')
                        if not url:
                            results.append({"index": idx, "type": typ, "success": False, "error": "missing url"})
                            return {"success": False, "results": results, "error": f"missing url at step {idx}"}
                        await page.goto(url, wait_until='networkidle')
                        results.append({"index": idx, "type": typ, "success": True, "url": url})
                        # optional delay in milliseconds
                        delay = int(step.get('delay') or 0)
                        if delay > 0:
                            await asyncio.sleep(delay/1000.0)

                    elif typ in ('execute_js', 'exec_js', 'evaluate', 'run_js'):
                        code = step.get('code') or step.get('script') or step.get('js')
                        if code is None:
                            results.append({"index": idx, "type": typ, "success": False, "error": "missing code"})
                            return {"success": False, "results": results, "error": f"missing code at step {idx}"}
                        # page.evaluate may expect a function or expression; try as-is
                        try:
                            val = await page.evaluate(code)
                            results.append({"index": idx, "type": typ, "success": True, "result": val})
                        except Exception as e:
                            results.append({"index": idx, "type": typ, "success": False, "error": str(e)})
                            return {"success": False, "results": results, "error": f"js execution failed at step {idx}: {e}"}

                    elif typ in ('click', 'click_selector'):
                        sel = step.get('selector') or step.get('sel')
                        if not sel:
                            results.append({"index": idx, "type": typ, "success": False, "error": "missing selector"})
                            return {"success": False, "results": results, "error": f"missing selector at step {idx}"}
                        try:
                            await page.click(sel)
                            results.append({"index": idx, "type": typ, "success": True, "selector": sel})
                        except Exception as e:
                            results.append({"index": idx, "type": typ, "success": False, "error": str(e)})
                            return {"success": False, "results": results, "error": f"click failed at step {idx}: {e}"}

                    elif typ in ('fill', 'type'):
                        sel = step.get('selector') or step.get('sel')
                        value = step.get('value') or step.get('text') or ''
                        if not sel:
                            results.append({"index": idx, "type": typ, "success": False, "error": "missing selector"})
                            return {"success": False, "results": results, "error": f"missing selector at step {idx}"}
                        try:
                            # try fill first, fallback to type
                            if hasattr(page, 'fill'):
                                await page.fill(sel, value)
                            else:
                                await page.type(sel, value)
                            results.append({"index": idx, "type": typ, "success": True, "selector": sel})
                        except Exception as e:
                            results.append({"index": idx, "type": typ, "success": False, "error": str(e)})
                            return {"success": False, "results": results, "error": f"fill failed at step {idx}: {e}"}

                    else:
                        # Unknown action: return error so caller can see
                        results.append({"index": idx, "type": typ, "success": False, "error": "unknown action type"})
                        return {"success": False, "results": results, "error": f"unknown action type '{typ}' at step {idx}"}

                except Exception as e:
                    # step-level exception
                    tb = traceback.format_exc()
                    results.append({"index": idx, "success": False, "error": str(e), "trace": tb})
                    return {"success": False, "results": results, "error": f"exception at step {idx}: {e}", "trace": tb}

            # Completed all steps
            return {"success": True, "results": results}

        except Exception as e:
            return {"success": False, "error": str(e), "trace": traceback.format_exc()}


async def main():
    manager = BrowserManager()
    sys.stdout.write(json.dumps({
        "success": True,
        "message": "Camoufox Bridge ready"
    }) + "\n")
    sys.stdout.flush()

    for line in sys.stdin:
        try:
            command = json.loads(line.strip())
            action = command.get("action")

            # Нормалізуємо config: іноді отримуємо JSON-рядок всередині поля config
            cfg = command.get("config", {})
            if isinstance(cfg, str):
                try:
                    cfg = json.loads(cfg)
                except Exception:
                    # якщо не вдається розпарсити — замінюємо на пустий dict
                    cfg = {}

            if action == "launch":
                result = await manager.launch_profile(
                    command.get("profile"),
                    cfg
                )
                sys.stdout.write(json.dumps(result) + "\n")
                sys.stdout.flush()
            elif action == "close":
                result = await manager.close_profile(command.get("profile"))
                sys.stdout.write(json.dumps(result) + "\n")
                sys.stdout.flush()
            elif action == "cleanup":
                cleaned = await manager._cleanup_dead_browsers()
                sys.stdout.write(json.dumps({
                    "success": True,
                    "cleaned": cleaned
                }) + "\n")
                sys.stdout.flush()
            elif action == 'rpa':
                # action: rpa, profile: name, sequence: [{type, ...}], options: {}
                seq = command.get('sequence', [])
                opts = command.get('options', {})
                result = await manager.execute_rpa_sequence(command.get('profile'), seq, opts)
                sys.stdout.write(json.dumps(result) + "\n")
                sys.stdout.flush()
            elif action == "shutdown":
                for pname in list(manager.browsers.keys()):
                    await manager.close_profile(pname)
                break
        except Exception as e:
            sys.stdout.write(json.dumps({
                "success": False,
                "error": str(e),
                "trace": traceback.format_exc()
            }) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    asyncio.run(main())

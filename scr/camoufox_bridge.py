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
                {"cores": 8, "inner_w": 1440, "inner_h": 900, "outer_w": 1480, "outer_h": 980},
                {"cores": 8, "inner_w": 1440, "inner_h": 932, "outer_w": 1480, "outer_h": 1012},
                {"cores": 10, "inner_w": 1512, "inner_h": 982, "outer_w": 1560, "outer_h": 1060},
                {"cores": 12, "inner_w": 1512, "inner_h": 982, "outer_w": 1560, "outer_h": 1060},
                {"cores": 14, "inner_w": 1728, "inner_h": 1117, "outer_w": 1780, "outer_h": 1200},
                {"cores": 16, "inner_w": 1728, "inner_h": 1117, "outer_w": 1780, "outer_h": 1200},
                {"cores": 10, "inner_w": 1920, "inner_h": 1080, "outer_w": 1980, "outer_h": 1160},
                {"cores": 12, "inner_w": 1680, "inner_h": 1050, "outer_w": 1740, "outer_h": 1130},
            ]
            variant = random.choice(mac_variants)

            return {
                'window.outerHeight': variant["outer_h"],
                'window.outerWidth': variant["outer_w"],
                'window.innerHeight': variant["inner_h"],
                'window.innerWidth': variant["inner_w"],
                'window.history.length': random.randint(2, 20),
                'navigator.userAgent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:146.0) Gecko/20100101 Firefox/146.0',
                'navigator.appCodeName': 'Mozilla',
                'navigator.appName': 'Netscape',
                'navigator.appVersion': '5.0 (Macintosh)',
                'navigator.oscpu': 'Intel Mac OS X 10.15',
                'navigator.language': 'en-US',
                'navigator.languages': ['en-US', 'en'],
                'navigator.platform': 'MacIntel',
                'navigator.hardwareConcurrency': variant["cores"],
                'navigator.product': 'Gecko',
                'navigator.productSub': '20100101',
                'navigator.maxTouchPoints': 0,
            }
        else:  # windows
            windows_variants = [
                {"cores": 8, "inner_w": 1920, "inner_h": 1080, "outer_w": 1920, "outer_h": 1120},
                {"cores": 12, "inner_w": 1920, "inner_h": 1080, "outer_w": 1920, "outer_h": 1120},
                {"cores": 12, "inner_w": 1920, "inner_h": 1080, "outer_w": 1980, "outer_h": 1160},
                {"cores": 16, "inner_w": 2560, "inner_h": 1440, "outer_w": 2620, "outer_h": 1520},
                {"cores": 10, "inner_w": 1536, "inner_h": 864, "outer_w": 1596, "outer_h": 944},
                {"cores": 16, "inner_w": 2560, "inner_h": 1440, "outer_w": 2620, "outer_h": 1520},
            ]
            variant = random.choice(windows_variants)

            return {
                'window.outerHeight': variant["outer_h"],
                'window.outerWidth': variant["outer_w"],
                'window.innerHeight': variant["inner_h"],
                'window.innerWidth': variant["inner_w"],
                'window.history.length': random.randint(3, 40),
                'navigator.userAgent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
                'navigator.appCodeName': 'Mozilla',
                'navigator.appName': 'Netscape',
                'navigator.appVersion': '5.0 (Windows)',
                'navigator.oscpu': 'Windows NT 10.0; Win64; x64',
                'navigator.language': 'en-US',
                'navigator.languages': ['en-US'],
                'navigator.platform': 'Win32',
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
                    return {"success": False, "error": "Profile already open"}

                profile_path = self.profiles_dir / profile_name
                profile_path.mkdir(exist_ok=True)

                # Використовуємо базовий конфіг для генерації fingerprint
                os_type = "macos"  # Генеруємо для macOS
                fingerprint_config = self._get_fingerprint_config(os_type)

                launch_config = {
                    "headless": False,
                    "persistent_context": True,
                    "user_data_dir": str(profile_path),
                    "os": os_type,
                    "config": fingerprint_config,
                    "i_know_what_im_doing": True
                }

                if "proxy" in config and config["proxy"]:
                    launch_config["proxy"] = config["proxy"]

                camoufox = AsyncCamoufox(**launch_config)
                browser = await camoufox.start()

                # Отримуємо існуючу сторінку
                pages = browser.pages
                page = pages[0] if pages else await browser.new_page()

                self.browsers[profile_name] = {
                    "browser": browser,
                    "page": page,
                    "profile_path": profile_path,
                    "camoufox": camoufox
                }

                return {"success": True, "profile": profile_name, "os": os_type}

            except Exception as e:
                return {"success": False, "error": str(e), "trace": traceback.format_exc()}

    def _convert_db_fingerprint(self, db_fp: dict):
        """Конвертує складний fingerprint з БД в простий для Camoufox"""
        config = {}

        # OS Version - беремо перший preferred або середнє між min/max
        if "osVersion" in db_fp:
            os_version = db_fp["osVersion"]
            if isinstance(os_version, dict):
                if "preferred" in os_version and os_version["preferred"]:
                    config["osVersion"] = os_version["preferred"][0]
                elif "min" in os_version:
                    config["osVersion"] = os_version["min"]
            else:
                config["osVersion"] = os_version

        # Screen - беремо перший preferred або середні значення
        if "screen" in db_fp:
            screen = db_fp["screen"]
            if isinstance(screen, dict):
                if "preferred" in screen and screen["preferred"] and len(screen["preferred"]) > 0:
                    # Беремо перший preferred екран
                    preferred = screen["preferred"][0]
                    config["screen"] = {
                        "minWidth": preferred[0],
                        "maxWidth": preferred[0],
                        "minHeight": preferred[1],
                        "maxHeight": preferred[1]
                    }
                elif "minWidth" in screen:
                    config["screen"] = {
                        "minWidth": screen["minWidth"],
                        "maxWidth": screen.get("maxWidth", screen["minWidth"]),
                        "minHeight": screen["minHeight"],
                        "maxHeight": screen.get("maxHeight", screen["minHeight"])
                    }

        # Hardware Concurrency - беремо preferred або середнє
        if "hardwareConcurrency" in db_fp:
            hw = db_fp["hardwareConcurrency"]
            if isinstance(hw, dict):
                if "preferred" in hw and hw["preferred"]:
                    config["hardwareConcurrency"] = hw["preferred"][0]
                elif "min" in hw and "max" in hw:
                    config["hardwareConcurrency"] = (hw["min"] + hw["max"]) // 2
            else:
                config["hardwareConcurrency"] = hw

        # Device Memory - беремо preferred або середнє
        if "deviceMemory" in db_fp:
            mem = db_fp["deviceMemory"]
            if isinstance(mem, dict):
                if "preferred" in mem and mem["preferred"]:
                    config["deviceMemory"] = mem["preferred"][0]
                elif "min" in mem and "max" in mem:
                    config["deviceMemory"] = (mem["min"] + mem["max"]) // 2
            else:
                config["deviceMemory"] = mem

        # Прості поля
        for key in ["geoip", "humanize", "headless", "block_images", "block_media"]:
            if key in db_fp:
                config[key] = db_fp[key]

        return config

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
            del self.browsers[profile_name]

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

            if action == "launch":
                result = await manager.launch_profile(
                    command.get("profile"),
                    command.get("config", {})
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

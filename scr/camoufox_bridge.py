import sys
import json
import traceback
import asyncio
from camoufox.async_api import AsyncCamoufox
from browserforge.fingerprints import Screen
from playwright.async_api import async_playwright
import aiohttp
from aiohttp import web


class BrowserManager:
    def __init__(self):
        self.browsers = {}  # {profile_name: browser_instance}
        self.contexts = {}  # {profile_name: context}
        self.playwright = None

    async def start(self):
        """Запускаємо Playwright"""
        self.playwright = await async_playwright().start()

    async def launch_profile(self, profile_name: str, config: dict):
        """Запускаємо профіль з конфігом"""
        try:
            # Обробляємо fingerprint
            fingerprint_config = config.pop("fingerprint", {})
            profile_dir = config.pop("profileDir", None)

            # Базові налаштування
            launch_config = {
                "headless": config.get("headless", False),
                "timeout": config.get("timeout", 120000)
            }

            # Fingerprint параметри
            if fingerprint_config:
                if "screen" in fingerprint_config:
                    screen_data = fingerprint_config["screen"]
                    if all(k in screen_data for k in ["minWidth", "maxWidth", "minHeight", "maxHeight"]):
                        launch_config["screen"] = Screen(
                            min_width=screen_data["minWidth"],
                            max_width=screen_data["maxWidth"],
                            min_height=screen_data["minHeight"],
                            max_height=screen_data["maxHeight"]
                        )
                if "os" in fingerprint_config:
                    launch_config["os"] = fingerprint_config["os"]
                if "geoip" in fingerprint_config:
                    launch_config["geoip"] = fingerprint_config["geoip"]

            # Proxy
            if "proxy" in config:
                launch_config["proxy"] = config["proxy"]

            # Запускаємо браузер
            browser = await AsyncCamoufox(**launch_config).start()

            # Отримуємо контекст
            context = browser.contexts[0] if browser.contexts else await browser.new_context()

            # Створюємо сторінку
            page = await context.new_page()

            # Зберігаємо
            self.browsers[profile_name] = browser
            self.contexts[profile_name] = context

            return {
                "success": True,
                "profile": profile_name,
                "page_count": len(context.pages)
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "trace": traceback.format_exc()
            }

    async def close_profile(self, profile_name: str):
        """Закриваємо профіль"""
        try:
            if profile_name in self.browsers:
                browser = self.browsers[profile_name]
                await browser.close()
                del self.browsers[profile_name]
                del self.contexts[profile_name]
                return {"success": True}
            return {"success": False, "error": "Profile not found"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def get_profiles(self):
        """Список активних профілів"""
        return {
            "success": True,
            "profiles": list(self.browsers.keys())
        }


manager = BrowserManager()


async def handle_launch(request):
    """HTTP endpoint для запуску профілю"""
    try:
        data = await request.json()
        profile_name = data.get("profile_name")
        config = data.get("config", {})

        result = await manager.launch_profile(profile_name, config)
        return web.json_response(result)
    except Exception as e:
        return web.json_response({
            "success": False,
            "error": str(e)
        }, status=500)


async def handle_close(request):
    """HTTP endpoint для закриття профілю"""
    try:
        data = await request.json()
        profile_name = data.get("profile_name")

        result = await manager.close_profile(profile_name)
        return web.json_response(result)
    except Exception as e:
        return web.json_response({
            "success": False,
            "error": str(e)
        }, status=500)


async def handle_list(request):
    """HTTP endpoint для списку профілів"""
    try:
        result = await manager.get_profiles()
        return web.json_response(result)
    except Exception as e:
        return web.json_response({
            "success": False,
            "error": str(e)
        }, status=500)


async def init_app():
    """Ініціалізуємо web додаток"""
    await manager.start()

    app = web.Application()
    app.router.add_post('/launch', handle_launch)
    app.router.add_post('/close', handle_close)
    app.router.add_get('/list', handle_list)

    return app


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9222

    print(f"Starting Camoufox Manager on port {port}...")
    web.run_app(init_app(), host='127.0.0.1', port=port)

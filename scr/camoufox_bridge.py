import sys
import json
import traceback
import asyncio
from camoufox.async_api import AsyncCamoufox
from browserforge.fingerprints import Screen
from pathlib import Path


class BrowserManager:
    def __init__(self):
        self.browsers = {}
        self.profiles_dir = Path(__file__).parent.parent / "profiles"
        self.profiles_dir.mkdir(exist_ok=True)

    async def launch_profile(self, profile_name: str, config: dict):
        try:
            fingerprint_config = config.pop("fingerprint", {})
            profile_path = self.profiles_dir / profile_name
            profile_path.mkdir(exist_ok=True)

            launch_config = {
                "headless": config.get("headless", False),
                "timeout": config.get("timeout", 120000)
            }

            if fingerprint_config:
                if "screen" in fingerprint_config:
                    screen_data = fingerprint_config["screen"]
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

            if "proxy" in config:
                launch_config["proxy"] = config["proxy"]

            # Запуск браузера
            browser = await AsyncCamoufox(**launch_config).start()

            # Створення persistent context
            context = await browser.new_persistent_context(str(profile_path))
            page = await context.new_page()

            self.browsers[profile_name] = browser

            return {"success": True, "profile": profile_name}

        except Exception as e:
            return {"success": False, "error": str(e), "trace": traceback.format_exc()}

    async def close_profile(self, profile_name: str):
        try:
            if profile_name in self.browsers:
                await self.browsers[profile_name].close()
                del self.browsers[profile_name]
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}


async def main():
    manager = BrowserManager()
    print("Bridge ready", flush=True)

    for line in sys.stdin:
        try:
            command = json.loads(line.strip())
            action = command.get("action")

            if action == "launch":
                result = await manager.launch_profile(
                    command["profile"],
                    command["config"]
                )
                print(json.dumps(result), flush=True)

            elif action == "close":
                result = await manager.close_profile(command["profile"])
                print(json.dumps(result), flush=True)

            elif action == "shutdown":
                break

        except Exception as e:
            print(json.dumps({"success": False, "error": str(e)}), flush=True)


if __name__ == "__main__":
    asyncio.run(main())

import sys
import json
import traceback
import asyncio
import os
from camoufox.async_api import AsyncCamoufox
from browserforge.fingerprints import Screen


def safe_print_json(obj: dict) -> None:
    """Безпечний вивід JSON у stdout"""
    try:
        sys.stdout.write(json.dumps(obj) + "\n")
        sys.stdout.flush()
    except Exception:
        pass


async def launch_browser(launch_config: dict) -> dict:
    """Запускає браузер з конфігурацією"""
    camoufox_manager = None

    try:
        # Витягуємо fingerprint з конфігу
        fingerprint_config = launch_config.pop("fingerprint", None)

        # Витягуємо profile path (якщо є)
        profile_path = None
        if "user_data_dir" in launch_config:
            profile_path = launch_config.pop("user_data_dir")
        elif "profileDir" in launch_config:
            profile_path = launch_config.pop("profileDir")

        # Встановлюємо дефолтні значення
        if "headless" not in launch_config:
            launch_config["headless"] = False

        if "timeout" not in launch_config:
            launch_config["timeout"] = 120000

        # Обробляємо fingerprint параметри - додаємо безпосередньо до launch_config
        if fingerprint_config:
            # Screen - створюємо Screen об'єкт
            if "screen" in fingerprint_config:
                screen_data = fingerprint_config["screen"]
                if "minWidth" in screen_data and "maxWidth" in screen_data:
                    launch_config["screen"] = Screen(
                        min_width=screen_data["minWidth"],
                        max_width=screen_data["maxWidth"],
                        min_height=screen_data["minHeight"],
                        max_height=screen_data["maxHeight"]
                    )

            # OS
            if "os" in fingerprint_config:
                launch_config["os"] = fingerprint_config["os"]

            # GeoIP
            if "geoip" in fingerprint_config:
                launch_config["geoip"] = fingerprint_config["geoip"]

        safe_print_json({
            "debug": True,
            "message": "Starting browser launch...",
            "config": {k: str(v) if not isinstance(v, (str, int, bool, list, dict, type(None))) else v
                       for k, v in launch_config.items()},
            "profile_path": profile_path
        })

        camoufox_manager = AsyncCamoufox(**launch_config)
        browser = await asyncio.wait_for(
            camoufox_manager.__aenter__(),
            timeout=150.0
        )

        safe_print_json({
            "success": True,
            "message": "Browser launched successfully"
        })

        await asyncio.Event().wait()

    except asyncio.TimeoutError:
        safe_print_json({
            "success": False,
            "error": "Browser launch timeout"
        })
        sys.exit(1)
    except Exception as e:
        safe_print_json({
            "success": False,
            "error": str(e),
            "trace": traceback.format_exc()
        })
        sys.exit(1)
    finally:
        try:
            if camoufox_manager:
                await camoufox_manager.__aexit__(None, None, None)
        except:
            pass


async def main_async() -> None:
    """Головна асинхронна функція"""
    if len(sys.argv) < 2:
        safe_print_json({
            "success": False,
            "error": "Missing launch config argument"
        })
        sys.exit(1)

    try:
        launch_config = json.loads(sys.argv[1])
        await launch_browser(launch_config)
    except json.JSONDecodeError as e:
        safe_print_json({
            "success": False,
            "error": f"Invalid JSON config: {e}"
        })
        sys.exit(1)
    except KeyboardInterrupt:
        pass
    except Exception as e:
        safe_print_json({
            "success": False,
            "error": str(e),
            "trace": traceback.format_exc()
        })
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main_async())

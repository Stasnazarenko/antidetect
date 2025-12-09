# scr/camoufox_bridge.py
import sys
import json
import traceback
import asyncio
import os
from camoufox.async_api import AsyncCamoufox  # type: ignore


def safe_print_json(obj: dict) -> None:
    """Безпечний вивід JSON у stdout"""
    try:
        sys.stdout.write(json.dumps(obj) + "\n")
        sys.stdout.flush()
    except Exception:
        pass


async def launch_browser(launch_config: dict) -> dict:
    """Запускає браузер з конфігурацією"""
    try:
        # Витягуємо fingerprint з конфігу
        fingerprint_config = launch_config.pop("fingerprint", None)

        # Встановлюємо дефолтні значення
        if "headless" not in launch_config:
            launch_config["headless"] = False

        if "timeout" not in launch_config:
            launch_config["timeout"] = 120000

        safe_print_json({
            "debug": True,
            "message": "Starting browser launch...",
            "config": launch_config,
            "fingerprint": fingerprint_config
        })

        # Якщо є fingerprint, передаємо його параметри окремо
        if fingerprint_config:
            if "screen" in fingerprint_config:
                launch_config.update(fingerprint_config["screen"])
            if "os" in fingerprint_config:
                launch_config["os"] = fingerprint_config["os"]
            if "geoip" in fingerprint_config:
                launch_config["geoip"] = fingerprint_config["geoip"]
            if "hardwareConcurrency" in fingerprint_config:
                launch_config["hardware_concurrency"] = fingerprint_config["hardwareConcurrency"]

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

import subprocess
import sys
from pathlib import Path

PYTHON = sys.executable

# -------------------------
# Test selectie
# -------------------------

# Kern-tests: hoge waarde, lage flakiness
CORE_TESTS = [
    "ws_create_and_join_test.py",
    "ws_start_test.py",
    "ws_start_and_reveal_test.py",
    "ws_turn_test.py",
    "ws_round_scoring_test.py",
    "ws_force_column_test.py",
    "ws_round2_setup_then_turns_test.py",
    "ws_game_over_threshold_test.py",
]

# Tests die we expliciet NIET draaien
EXCLUDED_PREFIXES = [
    "ws_debug_",   # debug-only tests
]


# -------------------------
# Runner helpers
# -------------------------
def should_skip(test_name: str) -> bool:
    return any(test_name.startswith(p) for p in EXCLUDED_PREFIXES)


def run_test(test_path: Path) -> bool:
    print("\n" + "=" * 70)
    print(f"▶ RUNNING {test_path.name}")
    print("=" * 70)

    result = subprocess.run(
        [PYTHON, str(test_path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    print(result.stdout)

    if result.returncode != 0:
        print(f"❌ TEST FAILED: {test_path.name}")
        return False

    print(f"✅ TEST PASSED: {test_path.name}")
    return True


# -------------------------
# Main
# -------------------------
def main():
    base_dir = Path(__file__).parent

    # Sanity check: bestaan alle core tests?
    for name in CORE_TESTS:
        path = base_dir / name
        if not path.exists():
            print(f"❌ Core test missing: {name}")
            sys.exit(1)

    # Run core tests
    for name in CORE_TESTS:
        if should_skip(name):
            print(f"⚠️  Skipping debug test: {name}")
            continue

        ok = run_test(base_dir / name)
        if not ok:
            print("\n🛑 STOPPING: at least one core test failed.")
            sys.exit(1)

    print("\n🎉 ALL CORE WEBSOCKET TESTS PASSED 🎉")
    sys.exit(0)


if __name__ == "__main__":
    main()

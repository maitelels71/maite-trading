"""Architecture dependency-rule tests."""

from __future__ import annotations

from pathlib import Path

APP_ROOT = Path(__file__).resolve().parents[1]


def _py_files(package: str) -> list[Path]:
    root = APP_ROOT / package
    return [p for p in root.rglob("*.py") if p.name != "__init__.py"]


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_domain_has_no_framework_imports():
    forbidden = ("fastapi", "sqlalchemy", "alembic", "httpx", "app.api", "app.models", "app.providers")
    for path in _py_files("domain"):
        text = _read(path)
        for token in forbidden:
            assert token not in text, f"{path} imports/references {token}"


def test_ports_have_no_provider_or_api_imports():
    forbidden = ("app.providers", "app.api", "app.services", "fastapi")
    for path in _py_files("ports"):
        text = _read(path)
        for token in forbidden:
            assert token not in text, f"{path} imports/references {token}"


def test_strategies_do_not_import_api_or_models():
    forbidden = ("app.api", "app.models", "fastapi", "sqlalchemy")
    for path in _py_files("strategies"):
        text = _read(path)
        for token in forbidden:
            assert token not in text, f"{path} imports/references {token}"


def test_expected_packages_exist():
    expected = [
        "core",
        "domain",
        "ports",
        "providers",
        "strategies",
        "services",
        "models",
        "database",
        "schemas",
        "api",
    ]
    for name in expected:
        assert (APP_ROOT / name).is_dir()

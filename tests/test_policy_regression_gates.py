from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
LOGIN_SCREEN = REPO_ROOT / "frontend" / "app" / "(auth)" / "login.tsx"
PROFILE_SCREEN = REPO_ROOT / "frontend" / "app" / "(tabs)" / "profile.tsx"
PRIVACY_SCREEN = REPO_ROOT / "frontend" / "app" / "privacy-policy.tsx"
TERMS_SCREEN = REPO_ROOT / "frontend" / "app" / "terms.tsx"
MASVS_CADENCE_DOC = REPO_ROOT / "test_reports" / "security" / "masvs-cadence.md"


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_policy_screens_exist() -> None:
    assert PRIVACY_SCREEN.exists(), "privacy-policy.tsx must exist"
    assert TERMS_SCREEN.exists(), "terms.tsx must exist"


def test_login_keeps_policy_links() -> None:
    content = _read_text(LOGIN_SCREEN)
    assert "router.push('/privacy-policy'" in content
    assert "router.push('/terms'" in content


def test_profile_keeps_policy_links() -> None:
    content = _read_text(PROFILE_SCREEN)
    assert "router.push('/privacy-policy'" in content
    assert "router.push('/terms'" in content


def test_masvs_cadence_artifact_exists_and_covers_required_domains() -> None:
    assert MASVS_CADENCE_DOC.exists(), "MASVS cadence artifact must exist"
    content = _read_text(MASVS_CADENCE_DOC).lower()
    for category in ("storage", "authentication", "network", "privacy"):
        assert category in content, f"missing MASVS category mapping: {category}"

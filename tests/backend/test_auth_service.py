import pytest

from app.models import User
from app.services import auth_service


class _Query:
    def __init__(self, db):
        self.db = db

    def filter(self, *args, **kwargs):
        return self

    def one_or_none(self):
        return self.db.user


class _Db:
    def __init__(self, user=None):
        self.user = user
        self.commits = 0
        self.refreshes = []

    def query(self, model):
        return _Query(self)

    def add(self, obj):
        if isinstance(obj, User):
            obj.id = obj.id or 1
            self.user = obj

    def commit(self):
        self.commits += 1

    def refresh(self, obj):
        self.refreshes.append(obj)


def test_validate_email_normalizes_valid_email():
    assert auth_service.validate_email("  USER.Name+test@Example.COM  ") == "user.name+test@example.com"


def test_validate_email_rejects_invalid_email():
    with pytest.raises(ValueError):
        auth_service.validate_email("invalid-email")


def test_validate_name_trims_extra_spaces():
    assert auth_service.validate_name("  Roman   Kindrat  ") == "Roman Kindrat"


@pytest.mark.parametrize(
    "password",
    [
        "Short1!",
        "lowercase1!",
        "UPPERCASE1!",
        "NoDigits!",
        "NoSpecial1",
    ],
)
def test_validate_password_strength_requires_required_character_groups(password):
    with pytest.raises(ValueError):
        auth_service.validate_password_strength(password)


def test_password_hash_verification():
    password_hash = auth_service.hash_password("StrongPass1!", salt="fixed-salt", iterations=10_000)

    assert auth_service.verify_password("StrongPass1!", password_hash)
    assert not auth_service.verify_password("WrongPass1!", password_hash)


def test_access_token_roundtrip_and_tamper_detection():
    token = auth_service.create_access_token(user_id=7, email="user@example.com", auth_version=3)
    payload = auth_service.decode_access_token(token)

    assert payload["sub"] == "7"
    assert payload["email"] == "user@example.com"
    assert payload["ver"] == 3

    tampered_token = token[:-1] + ("a" if token[-1] != "a" else "b")
    with pytest.raises(ValueError):
        auth_service.decode_access_token(tampered_token)


def test_register_user_creates_unverified_user_and_confirmation_code(monkeypatch):
    sent = []
    db = _Db()

    monkeypatch.setattr(auth_service, "generate_email_code", lambda: "123456")
    monkeypatch.setattr(auth_service, "_send_code_email", lambda email, code: sent.append((email, code)))

    result = auth_service.register_user(db, " Roman  ", " ROMAN@example.com ", "StrongPass1!")

    assert db.user.email == "roman@example.com"
    assert db.user.name == "Roman"
    assert db.user.is_verified is False
    assert db.user.email_code_hash == auth_service.hash_email_code("roman@example.com", "123456")
    assert result.dev_code == "123456"
    assert sent == [("roman@example.com", "123456")]
    assert db.commits == 1


def test_register_user_rejects_existing_verified_email():
    user = User(name="Roman", email="roman@example.com", password_hash="hash", is_verified=True)
    db = _Db(user)

    with pytest.raises(ValueError, match="Email already registered"):
        auth_service.register_user(db, "Roman", "roman@example.com", "StrongPass1!")


def test_resend_verification_code_rejects_verified_user():
    user = User(name="Roman", email="roman@example.com", password_hash="hash", is_verified=True)
    db = _Db(user)

    with pytest.raises(ValueError, match="Email already registered"):
        auth_service.resend_verification_code(db, "roman@example.com")


def test_verify_email_code_marks_user_as_verified():
    user = User(name="Roman", email="roman@example.com", password_hash="hash", is_verified=False)
    user.email_code_hash = auth_service.hash_email_code("roman@example.com", "123456")
    user.email_code_expires_at = auth_service._now_utc() + auth_service.timedelta(minutes=5)
    user.email_code_sent_at = auth_service._now_utc()
    db = _Db(user)

    auth_service.verify_email_code(db, "roman@example.com", "123456")

    assert user.is_verified is True
    assert user.email_code_hash is None
    assert user.email_code_expires_at is None
    assert db.commits == 1


def test_verify_email_code_rejects_invalid_code():
    user = User(name="Roman", email="roman@example.com", password_hash="hash", is_verified=False)
    user.email_code_hash = auth_service.hash_email_code("roman@example.com", "123456")
    user.email_code_expires_at = auth_service._now_utc() + auth_service.timedelta(minutes=5)
    db = _Db(user)

    with pytest.raises(ValueError, match="Invalid code"):
        auth_service.verify_email_code(db, "roman@example.com", "000000")


def test_login_user_returns_token_for_verified_active_user():
    user = User(
        id=9,
        name="Roman",
        email="roman@example.com",
        password_hash=auth_service.hash_password("StrongPass1!", salt="fixed", iterations=10_000),
        is_verified=True,
        is_active=True,
        auth_version=2,
        login_failed_attempts=1,
    )
    db = _Db(user)

    result = auth_service.login_user(db, "roman@example.com", "StrongPass1!")

    assert result.token_type == "bearer"
    assert result.redirect_to == "/"
    assert auth_service.decode_access_token(result.access_token)["sub"] == "9"
    assert user.login_failed_attempts == 0
    assert db.commits == 1


def test_login_user_increments_failed_attempts_for_wrong_password():
    user = User(
        id=9,
        name="Roman",
        email="roman@example.com",
        password_hash=auth_service.hash_password("StrongPass1!", salt="fixed", iterations=10_000),
        is_verified=True,
        is_active=True,
        login_failed_attempts=0,
    )
    db = _Db(user)

    with pytest.raises(ValueError, match="Invalid email or password"):
        auth_service.login_user(db, "roman@example.com", "WrongPass1!")

    assert user.login_failed_attempts == 1
    assert db.commits == 1


def test_logout_user_increments_auth_version():
    user = User(name="Roman", email="roman@example.com", password_hash="hash", auth_version=4)
    db = _Db(user)

    auth_service.logout_user(db, user)

    assert user.auth_version == 5
    assert db.commits == 1


def test_update_user_name_validates_and_refreshes_user():
    user = User(name="Old", email="roman@example.com", password_hash="hash")
    db = _Db(user)

    updated = auth_service.update_user_name(db, user, name=" New  Name ")

    assert updated.name == "New Name"
    assert db.refreshes == [user]


def test_change_user_password_updates_hash_and_invalidates_tokens():
    user = User(
        name="Roman",
        email="roman@example.com",
        password_hash=auth_service.hash_password("OldPass1!", salt="fixed", iterations=10_000),
        auth_version=1,
        login_failed_attempts=3,
    )
    db = _Db(user)

    auth_service.change_user_password(db, user, current_password="OldPass1!", new_password="NewPass1!")

    assert auth_service.verify_password("NewPass1!", user.password_hash)
    assert user.auth_version == 2
    assert user.login_failed_attempts == 0

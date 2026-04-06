from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import smtplib
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import User

EMAIL_REGEX = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def normalize_email(email: str) -> str:
    return " ".join(email.strip().split()).lower()


def validate_email(email: str) -> str:
    email_norm = normalize_email(email)
    if not EMAIL_REGEX.fullmatch(email_norm):
        raise ValueError("Invalid email format")
    return email_norm


def validate_name(name: str) -> str:
    normalized = " ".join(name.strip().split())
    if len(normalized) < 2:
        raise ValueError("Name must be at least 2 characters")
    return normalized


def validate_password_strength(password: str) -> None:
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters")
    if not re.search(r"[A-Z]", password):
        raise ValueError("Password must include at least one uppercase letter")
    if not re.search(r"[a-z]", password):
        raise ValueError("Password must include at least one lowercase letter")
    if not re.search(r"[0-9]", password):
        raise ValueError("Password must include at least one digit")
    if not re.search(r"[^A-Za-z0-9]", password):
        raise ValueError("Password should include at least one special symbol")


def hash_password(password: str, *, salt: str | None = None, iterations: int = 150_000) -> str:
    raw_salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        raw_salt.encode("utf-8"),
        iterations,
    )
    return f"pbkdf2_sha256${iterations}${raw_salt}${digest.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        scheme, iter_s, salt, _stored = password_hash.split("$", 3)
        if scheme != "pbkdf2_sha256":
            return False
        expected = hash_password(password, salt=salt, iterations=int(iter_s))
        return hmac.compare_digest(expected, password_hash)
    except Exception:
        return False


def generate_email_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_email_code(email: str, code: str) -> str:
    payload = f"{normalize_email(email)}:{code}:{settings.APP_SECRET}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def create_access_token(user_id: int, email: str, auth_version: int) -> str:
    exp = int((_now_utc() + timedelta(minutes=settings.ACCESS_TOKEN_TTL_MINUTES)).timestamp())
    payload = {"sub": str(user_id), "email": email, "exp": exp, "ver": int(auth_version)}
    payload_bytes = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    payload_part = _b64url(payload_bytes)
    sig = hmac.new(settings.APP_SECRET.encode("utf-8"), payload_part.encode("utf-8"), hashlib.sha256).digest()
    return f"{payload_part}.{_b64url(sig)}"


def decode_access_token(token: str) -> dict:
    try:
        payload_part, sig_part = token.split(".", 1)
    except ValueError as exc:
        raise ValueError("Invalid token format") from exc

    expected_sig = hmac.new(
        settings.APP_SECRET.encode("utf-8"),
        payload_part.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    received_sig = _b64url_decode(sig_part)
    if not hmac.compare_digest(expected_sig, received_sig):
        raise ValueError("Invalid token signature")

    payload = json.loads(_b64url_decode(payload_part).decode("utf-8"))
    exp = int(payload.get("exp", 0))
    if exp <= int(_now_utc().timestamp()):
        raise ValueError("Token expired")
    return payload


def _send_code_email(recipient: str, code: str) -> None:
    subject = "Підтвердження email"
    body = (
        "Ваш код підтвердження:\n\n"
        f"{code}\n\n"
        f"Код діє {settings.EMAIL_CODE_TTL_MINUTES} хвилин."
    )

    host = settings.SMTP_HOST or os.getenv("SMTP_SERVER") or os.getenv("MAIL_SERVER")
    username = settings.SMTP_USERNAME or os.getenv("SMTP_USER") or os.getenv("MAIL_USERNAME")
    password = settings.SMTP_PASSWORD or os.getenv("SMTP_PASS") or os.getenv("MAIL_PASSWORD")
    from_addr = settings.SMTP_FROM or username or "no-reply@sports.local"

    if not host and username and username.endswith("@gmail.com"):
        host = "smtp.gmail.com"

    if not host:
        if settings.AUTH_DEV_EXPOSE_CODE:
            print(f"[AUTH DEV] confirmation code for {recipient}: {code}")
            return
        raise RuntimeError("SMTP is not configured. Set SMTP_HOST/SMTP_USERNAME/SMTP_PASSWORD in backend/.env")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = recipient
    msg.set_content(body)

    try:
        if settings.SMTP_PORT == 465 and not settings.SMTP_USE_TLS:
            with smtplib.SMTP_SSL(host, settings.SMTP_PORT, timeout=20) as smtp:
                if username and password:
                    smtp.login(username, password)
                smtp.send_message(msg)
            return

        with smtplib.SMTP(host, settings.SMTP_PORT, timeout=20) as smtp:
            if settings.SMTP_USE_TLS:
                smtp.starttls()
            if username and password:
                smtp.login(username, password)
            smtp.send_message(msg)
    except smtplib.SMTPAuthenticationError as exc:
        raise RuntimeError(
            "SMTP auth failed. Для Gmail використайте App Password (16 символів), "
            "увімкніть 2FA і перевірте SMTP_USERNAME/SMTP_PASSWORD."
        ) from exc
    except Exception as exc:
        raise RuntimeError(f"SMTP send failed: {exc}") from exc


def _issue_code(user: User) -> tuple[str, datetime]:
    code = generate_email_code()
    expires_at = _now_utc() + timedelta(minutes=settings.EMAIL_CODE_TTL_MINUTES)
    user.email_code_hash = hash_email_code(user.email, code)
    user.email_code_expires_at = expires_at
    user.email_code_sent_at = _now_utc()
    return code, expires_at


@dataclass
class RegisterResult:
    message: str
    expires_at: datetime
    dev_code: str | None


@dataclass
class LoginResult:
    access_token: str
    token_type: str
    redirect_to: str


def register_user(db: Session, name: str, email: str, password: str) -> RegisterResult:
    name_norm = validate_name(name)
    email_norm = validate_email(email)
    validate_password_strength(password)

    user = db.query(User).filter(User.email == email_norm).one_or_none()
    if user and user.is_verified:
        raise ValueError("Email already registered")

    if not user:
        user = User(
            name=name_norm,
            email=email_norm,
            password_hash=hash_password(password),
            is_active=True,
            is_superuser=False,
            is_verified=False,
            login_failed_attempts=0,
            auth_version=0,
        )
        db.add(user)
    else:
        user.name = name_norm
        user.password_hash = hash_password(password)
        user.is_active = True
        user.is_verified = False
        user.login_failed_attempts = 0
        user.login_locked_until = None

    code, expires_at = _issue_code(user)
    db.commit()
    _send_code_email(user.email, code)

    dev_code = code if settings.AUTH_DEV_EXPOSE_CODE and not settings.SMTP_HOST else None
    return RegisterResult(
        message="Confirmation code sent to email",
        expires_at=expires_at,
        dev_code=dev_code,
    )


def resend_verification_code(db: Session, email: str) -> RegisterResult:
    email_norm = validate_email(email)
    user = db.query(User).filter(User.email == email_norm).one_or_none()
    if not user:
        raise ValueError("User not found")
    if user.is_verified:
        raise ValueError("Email already registered")

    if user.email_code_sent_at is not None:
        seconds_since = (_now_utc() - user.email_code_sent_at).total_seconds()
        if seconds_since < settings.EMAIL_RESEND_COOLDOWN_SECONDS:
            retry_after = int(settings.EMAIL_RESEND_COOLDOWN_SECONDS - seconds_since)
            raise ValueError(f"Please wait {retry_after}s before resend")

    code, expires_at = _issue_code(user)
    db.commit()
    _send_code_email(user.email, code)

    dev_code = code if settings.AUTH_DEV_EXPOSE_CODE and not settings.SMTP_HOST else None
    return RegisterResult(
        message="Confirmation code resent",
        expires_at=expires_at,
        dev_code=dev_code,
    )


def verify_email_code(db: Session, email: str, code: str) -> None:
    email_norm = validate_email(email)
    user = db.query(User).filter(User.email == email_norm).one_or_none()
    if not user:
        raise ValueError("User not found")

    if not user.email_code_hash or not user.email_code_expires_at:
        raise ValueError("No active confirmation code")
    if user.email_code_expires_at < _now_utc():
        raise ValueError("Expired code")
    if not hmac.compare_digest(user.email_code_hash, hash_email_code(email_norm, code)):
        raise ValueError("Invalid code")

    user.is_verified = True
    user.email_code_hash = None
    user.email_code_expires_at = None
    user.email_code_sent_at = None
    user.login_failed_attempts = 0
    user.login_locked_until = None
    db.commit()


def login_user(db: Session, email: str, password: str) -> LoginResult:
    email_norm = validate_email(email)
    user = db.query(User).filter(User.email == email_norm).one_or_none()
    if not user:
        raise ValueError("Invalid email or password")

    now = _now_utc()
    if user.login_locked_until and user.login_locked_until > now:
        seconds = int((user.login_locked_until - now).total_seconds())
        raise ValueError(f"Too many attempts. Try again in {seconds}s")

    if not verify_password(password, user.password_hash):
        user.login_failed_attempts += 1
        if user.login_failed_attempts >= settings.LOGIN_MAX_ATTEMPTS:
            user.login_locked_until = now + timedelta(minutes=settings.LOGIN_LOCK_MINUTES)
            user.login_failed_attempts = 0
        db.commit()
        raise ValueError("Invalid email or password")

    if not user.is_verified:
        raise ValueError("Email is not verified. Please verify registration first.")
    if not user.is_active:
        raise ValueError("User is inactive")

    user.login_failed_attempts = 0
    user.login_locked_until = None
    db.commit()

    token = create_access_token(user_id=user.id, email=user.email, auth_version=user.auth_version)
    return LoginResult(access_token=token, token_type="bearer", redirect_to="/")


def logout_user(db: Session, user: User) -> None:
    user.auth_version += 1
    db.commit()


def update_user_name(db: Session, user: User, *, name: str) -> User:
    user.name = validate_name(name)
    db.commit()
    db.refresh(user)
    return user


def change_user_password(db: Session, user: User, *, current_password: str, new_password: str) -> None:
    if not verify_password(current_password, user.password_hash):
        raise ValueError("Current password is incorrect")

    validate_password_strength(new_password)

    if verify_password(new_password, user.password_hash):
        raise ValueError("New password must be different from current password")

    user.password_hash = hash_password(new_password)
    user.login_failed_attempts = 0
    user.login_locked_until = None
    user.auth_version += 1
    db.commit()

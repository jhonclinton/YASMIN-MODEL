import hmac
import hashlib
import base64
import json
import time

SECRET_KEY = "PRORRIDRE_GORE_PUNO_SECURITY_TOKEN_2026_SECRET"

def create_access_token(data: dict, expires_in: int = 86400) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    payload = data.copy()
    payload["exp"] = int(time.time()) + expires_in
    payload["iss"] = "prorridre-backend"

    def b64_encode(obj):
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")

    h_str = b64_encode(header)
    p_str = b64_encode(payload)
    signature = hmac.new(
        SECRET_KEY.encode(),
        f"{h_str}.{p_str}".encode(),
        hashlib.sha256
    ).digest()
    s_str = base64.urlsafe_b64encode(signature).decode().rstrip("=")

    return f"{h_str}.{p_str}.{s_str}"

def verify_token(token: str) -> dict | None:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        h_str, p_str, s_str = parts

        # Verify signature
        expected_sig = hmac.new(
            SECRET_KEY.encode(),
            f"{h_str}.{p_str}".encode(),
            hashlib.sha256
        ).digest()
        actual_sig = base64.urlsafe_b64decode(s_str + "=" * (-len(s_str) % 4))
        if not hmac.compare_digest(expected_sig, actual_sig):
            return None

        # Parse payload
        payload_json = base64.urlsafe_b64decode(p_str + "=" * (-len(p_str) % 4)).decode()
        payload = json.loads(payload_json)

        # Check expiration
        if payload.get("exp", 0) < time.time():
            return None

        return payload
    except Exception:
        return None

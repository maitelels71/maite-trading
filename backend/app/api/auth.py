"""Hub login for Trading Like a Boss."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.desk_auth import login, require_desk_session

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=200)


class LoginResponse(BaseModel):
    token: str
    user: str


class MeResponse(BaseModel):
    user: str


@router.post("/login", response_model=LoginResponse)
def auth_login(body: LoginRequest) -> LoginResponse:
    token = login(body.username, body.password)
    return LoginResponse(token=token, user=body.username.strip())


@router.get("/me", response_model=MeResponse)
def auth_me(session: dict = Depends(require_desk_session)) -> MeResponse:
    return MeResponse(user=str(session["user"]))

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserRegister, UserLogin, Token, UserOut
from app.services.auth_service import hash_password, verify_password, create_token, get_current_user

router = APIRouter(tags=["Auth"])

@router.post("/register", response_model=Token)
def register(body: UserRegister, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email đã tồn tại")
    
    user = User(
        name=body.name,
        email=body.email,
        password=hash_password(body.password),
        grade=body.grade,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    return Token(
        access_token=create_token(user.id),
        user=UserOut.model_validate(user)
    )

@router.post("/login", response_model=Token)
def login(body: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.password):
        raise HTTPException(status_code=401, detail="Email hoặc mật khẩu sai")
    return Token(access_token=create_token(user.id), user=UserOut.model_validate(user))

# FIX: bỏ __import__ hacky, import trực tiếp get_current_user từ trên
@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user
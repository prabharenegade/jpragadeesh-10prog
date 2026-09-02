import os
import re
import uuid
import json
import asyncio
import hashlib
import logging
import requests
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import httpx
import emoji as emoji_lib
import jwt
import bcrypt
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone
from emergentintegrations.llm.openai import OpenAITextToSpeech, OpenAISpeechToText

from subjects_data import SUBJECT_CATALOG, ALL_SUBJECTS, LANGUAGES, TEACHERS

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
JWT_SECRET = os.environ.get("JWT_SECRET", "dev_secret")
JWT_ALG = "HS256"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("learnverse")

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def now_utc():
    return datetime.now(timezone.utc)


def make_token(user_id: str) -> str:
    payload = {"user_id": user_id, "exp": now_utc() + timedelta(days=7)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def clean_for_tts(text: str) -> str:
    text = emoji_lib.replace_emoji(text, replace="")
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"`{1,3}[^`]*`{1,3}", "", text)
    text = re.sub(r"[*_#>~|]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:4000]


async def get_current_user(request: Request) -> dict:
    """Auth via session_token cookie (Google) OR Bearer token (JWT / session)."""
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Try JWT (email/password users)
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user = await db.users.find_one({"user_id": payload["user_id"]}, {"_id": 0})
        if user:
            return user
    except jwt.PyJWTError:
        pass

    # Try session token (Google users)
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if session:
        expires_at = session["expires_at"]
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < now_utc():
            raise HTTPException(status_code=401, detail="Session expired")
        user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
        if user:
            return user
    raise HTTPException(status_code=401, detail="Invalid session")


async def ensure_dna(user_id: str):
    doc = await db.learning_dna.find_one({"user_id": user_id}, {"_id": 0})
    if not doc:
        doc = {"user_id": user_id, "subjects": {}, "activity": {}, "total_xp": 0,
               "created_at": now_utc().isoformat()}
        await db.learning_dna.insert_one(dict(doc))
    return doc


async def record_activity(user_id: str, subject: str, xp: int = 10, mistake: bool = False):
    """Grow the Learning DNA for a subject. Starts at 0, grows day by day."""
    today = now_utc().strftime("%Y-%m-%d")
    dna = await ensure_dna(user_id)
    subjects = dna.get("subjects", {})
    s = subjects.get(subject, {"xp": 0, "interactions": 0, "mistakes": 0,
                               "history": [], "last_active": None})
    s["xp"] = s.get("xp", 0) + xp
    s["interactions"] = s.get("interactions", 0) + 1
    if mistake:
        s["mistakes"] = s.get("mistakes", 0) + 1
    s["last_active"] = today
    s["history"] = (s.get("history", []) + [{"date": today, "xp": s["xp"]}])[-30:]
    subjects[subject] = s

    activity = dna.get("activity", {})
    activity[today] = activity.get(today, 0) + 1

    await db.learning_dna.update_one(
        {"user_id": user_id},
        {"$set": {"subjects": subjects, "activity": activity},
         "$inc": {"total_xp": xp}},
    )


def clean_user(u: dict) -> dict:
    return {"user_id": u["user_id"], "email": u["email"], "name": u["name"],
            "picture": u.get("picture", ""), "mobile": u.get("mobile", ""),
            "provider": u.get("provider", "email")}


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class RegisterIn(BaseModel):
    name: str
    email: str
    password: str
    mobile: Optional[str] = ""


class LoginIn(BaseModel):
    email: str
    password: str


class ChatIn(BaseModel):
    message: str
    session_id: str
    subject: Optional[str] = "General"
    language: Optional[str] = "en"
    teacher: Optional[str] = "prof"
    mode: Optional[str] = "solve"  # solve | explain_back | blind_spot


class CompileIn(BaseModel):
    language: str
    code: str
    stdin: Optional[str] = ""


class QuizIn(BaseModel):
    subject: str
    difficulty: Optional[str] = "medium"


class QuizSubmitIn(BaseModel):
    quiz_id: str
    answers: List[int]


class TTSIn(BaseModel):
    text: str
    voice: Optional[str] = "nova"


class MistakeIn(BaseModel):
    subject: str
    topic: str
    detail: str


class FriendSearchIn(BaseModel):
    query: str


class FriendActionIn(BaseModel):
    target_user_id: str


class InterviewStartIn(BaseModel):
    role: str


class InterviewAnswerIn(BaseModel):
    session_id: str
    answer: str


# ---------------------------------------------------------------------------
# LLM system prompt
# ---------------------------------------------------------------------------
def build_system_prompt(subject, language, teacher_id, mode):
    teacher = next((t for t in TEACHERS if t["id"] == teacher_id), TEACHERS[1])
    lang_map = {t["code"]: t["label"] for t in LANGUAGES}
    lang_label = lang_map.get(language, "English")

    persona = f"You are {teacher['name']}. Persona: {teacher['style']}"
    base = (
        f"{persona}\n\n"
        "You are Edu-Crack AI, an expert tutor with deep, accurate knowledge across ALL subjects: "
        "Computer Science (DSA, OS, DBMS, Networks, AI/ML, Cyber Security, Cloud, Web/Mobile Dev, "
        "Compiler Design, Distributed Systems, Blockchain, IoT), Engineering (Maths, Physics, Chemistry, "
        "Mechanical, Electrical, Civil, Robotics, Thermodynamics, Fluid Mechanics), high-level Mathematics "
        "(integration, differentiation, logic & truth tables, algebra, linear algebra, probability), "
        "Science, Business, Humanities, Medical, Law, Arts & Design and Emerging Tech.\n"
        "Give correct, clear, step-by-step solutions. For maths show each step. For code use fenced code blocks. "
        "Be concise but complete. Never refuse a valid academic doubt."
    )
    if language == "tanglish":
        base += "\n\nRespond in Tanglish (casual mix of Tamil written in English letters + English). Friendly tone."
    elif language != "en":
        base += f"\n\nRespond in {lang_label}. Keep technical terms in English where standard."

    if mode == "explain_back":
        base += ("\n\nMODE: EXPLAIN-IT-BACK. The student is explaining a concept back to you in their own words. "
                 "Assess their explanation: point out exactly what they understood correctly and what is confused or missing. "
                 "Be encouraging. End with one tiny follow-up question.")
    elif mode == "blind_spot":
        base += ("\n\nMODE: BLIND-SPOT DETECTOR. Before giving a final answer, first check if the student left out "
                 "critical info (budget, scale, constraints, requirements, context). If so, ask 2-4 sharp clarifying "
                 "questions FIRST. Only give a final recommendation once you have enough info.")
    base += f"\n\nCurrent subject focus: {subject}."
    return base


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
@api_router.post("/auth/register")
async def register(body: RegisterIn):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    pw_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    user = {"user_id": user_id, "email": body.email.lower(), "name": body.name,
            "password": pw_hash, "mobile": body.mobile or "", "picture": "",
            "provider": "email", "created_at": now_utc().isoformat()}
    await db.users.insert_one(user)
    await ensure_dna(user_id)
    return {"token": make_token(user_id), "user": clean_user(user)}


@api_router.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not user.get("password"):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not bcrypt.checkpw(body.password.encode(), user["password"].encode()):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"token": make_token(user["user_id"]), "user": clean_user(user)}


@api_router.post("/auth/session")
async def google_session(request: Request, response: Response):
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="Missing session_id")
    async with httpx.AsyncClient() as hc:
        r = await hc.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session")
    data = r.json()
    email = data["email"].lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user = {"user_id": user_id, "email": email, "name": data.get("name", email),
                "picture": data.get("picture", ""), "mobile": "", "provider": "google",
                "created_at": now_utc().isoformat()}
        await db.users.insert_one(dict(user))
        await ensure_dna(user_id)
    else:
        await db.users.update_one({"email": email},
                                  {"$set": {"picture": data.get("picture", user.get("picture", ""))}})

    session_token = data["session_token"]
    await db.user_sessions.insert_one({
        "user_id": user["user_id"], "session_token": session_token,
        "expires_at": (now_utc() + timedelta(days=7)).isoformat(),
        "created_at": now_utc().isoformat(),
    })
    response.set_cookie("session_token", session_token, httponly=True, secure=True,
                        samesite="none", path="/", max_age=7 * 24 * 3600)
    return {"user": clean_user(user), "session_token": session_token}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return clean_user(user)


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------
@api_router.get("/catalog")
async def catalog():
    return {"catalog": SUBJECT_CATALOG, "subjects": ALL_SUBJECTS,
            "languages": LANGUAGES, "teachers": TEACHERS}


# ---------------------------------------------------------------------------
# AI chat (streaming)
# ---------------------------------------------------------------------------
@api_router.post("/chat/stream")
async def chat_stream(body: ChatIn, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    sys = build_system_prompt(body.subject, body.language, body.teacher, body.mode)
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"{uid}_{body.session_id}",
                   system_message=sys).with_model("openai", "gpt-5.4")

    # rehydrate short history from db so multi-turn works across requests
    prior = await db.chat_messages.find(
        {"user_id": uid, "session_id": body.session_id}, {"_id": 0}
    ).sort("ts", 1).to_list(20)

    await db.chat_messages.insert_one({
        "user_id": uid, "session_id": body.session_id, "role": "user",
        "content": body.message, "subject": body.subject, "ts": now_utc().isoformat(),
    })
    await db.chat_sessions.update_one(
        {"user_id": uid, "session_id": body.session_id},
        {"$set": {"user_id": uid, "session_id": body.session_id,
                  "title": body.message[:50], "subject": body.subject,
                  "updated_at": now_utc().isoformat()}}, upsert=True)

    context = ""
    if prior:
        context = "Conversation so far:\n" + "\n".join(
            f"{m['role']}: {m['content'][:400]}" for m in prior) + "\n\nNow answer:\n"
    full_msg = context + body.message

    async def gen():
        collected = []
        try:
            async for ev in chat.stream_message(UserMessage(text=full_msg)):
                if isinstance(ev, TextDelta):
                    collected.append(ev.content)
                    yield f"data: {json.dumps({'delta': ev.content})}\n\n"
                elif isinstance(ev, StreamDone):
                    break
        except Exception as e:
            logger.exception("chat error")
            yield f"data: {json.dumps({'delta': f'[error: {e}]'})}\n\n"
        answer = "".join(collected)
        await db.chat_messages.insert_one({
            "user_id": uid, "session_id": body.session_id, "role": "assistant",
            "content": answer, "subject": body.subject, "ts": now_utc().isoformat(),
        })
        subj = body.subject if body.subject in ALL_SUBJECTS else (
            body.subject if body.subject != "General" else "Algorithms")
        await record_activity(uid, subj, xp=8)
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@api_router.get("/chat/sessions")
async def chat_sessions(user: dict = Depends(get_current_user)):
    rows = await db.chat_sessions.find({"user_id": user["user_id"]}, {"_id": 0}) \
        .sort("updated_at", -1).to_list(50)
    return rows


@api_router.get("/chat/history/{session_id}")
async def chat_history(session_id: str, user: dict = Depends(get_current_user)):
    rows = await db.chat_messages.find(
        {"user_id": user["user_id"], "session_id": session_id}, {"_id": 0}
    ).sort("ts", 1).to_list(200)
    return rows


# ---------------------------------------------------------------------------
# TTS
# ---------------------------------------------------------------------------
@api_router.post("/tts")
async def tts_generate(body: TTSIn, user: dict = Depends(get_current_user)):
    text = clean_for_tts(body.text)
    if not text:
        raise HTTPException(status_code=400, detail="Nothing to speak")
    key = hashlib.sha256(f"{text}|{body.voice}|1.0|tts-1|mp3".encode()).hexdigest()[:24]
    existing = await db.tts_cache.find_one({"key": key})
    if not existing:
        tts = OpenAITextToSpeech(api_key=EMERGENT_LLM_KEY)
        audio = await tts.generate_speech(text=text, model="tts-1", voice=body.voice)
        await db.tts_cache.insert_one({"key": key, "audio": audio,
                                       "created_at": now_utc().isoformat()})
    return {"url": f"/api/tts/{key}.mp3"}


@api_router.get("/tts/{key}.mp3")
async def tts_get(key: str):
    doc = await db.tts_cache.find_one({"key": key})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return Response(content=doc["audio"], media_type="audio/mpeg",
                    headers={"Cache-Control": "public, max-age=31536000"})


# ---------------------------------------------------------------------------
# Learning DNA / Time Machine / Blind spots
# ---------------------------------------------------------------------------
@api_router.get("/dna")
async def get_dna(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    dna = await ensure_dna(uid)
    subjects = dna.get("subjects", {})
    strong, improving, needs_revision, repeated = [], [], [], []
    breakdown = []
    for name, s in subjects.items():
        xp = s.get("xp", 0)
        level = min(100, int(xp / 5))  # 0..100 mastery
        mistakes = s.get("mistakes", 0)
        breakdown.append({"subject": name, "xp": xp, "level": level,
                          "mistakes": mistakes, "interactions": s.get("interactions", 0)})
        if mistakes >= 3:
            repeated.append(name)
        if level >= 70:
            strong.append(name)
        elif mistakes >= 2 or level < 30:
            needs_revision.append(name)
        else:
            improving.append(name)
    breakdown.sort(key=lambda x: x["xp"], reverse=True)

    # activity streak
    activity = dna.get("activity", {})
    streak = 0
    d = now_utc()
    while activity.get(d.strftime("%Y-%m-%d"), 0) > 0:
        streak += 1
        d -= timedelta(days=1)

    return {
        "total_xp": dna.get("total_xp", 0),
        "subjects": breakdown,
        "activity": activity,
        "streak": streak,
        "time_machine": {"strong": strong, "improving": improving,
                         "needs_revision": needs_revision, "repeated_mistakes": repeated},
    }


# ---------------------------------------------------------------------------
# Mistake tracking
# ---------------------------------------------------------------------------
@api_router.post("/mistakes")
async def add_mistake(body: MistakeIn, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    doc = {"id": uuid.uuid4().hex, "user_id": uid, "subject": body.subject,
           "topic": body.topic, "detail": body.detail, "ts": now_utc().isoformat()}
    await db.mistakes.insert_one(dict(doc))
    await record_activity(uid, body.subject if body.subject in ALL_SUBJECTS else "Algorithms",
                          xp=2, mistake=True)
    doc.pop("_id", None)
    return doc


@api_router.get("/mistakes")
async def list_mistakes(user: dict = Depends(get_current_user)):
    rows = await db.mistakes.find({"user_id": user["user_id"]}, {"_id": 0}) \
        .sort("ts", -1).to_list(100)
    return rows


# ---------------------------------------------------------------------------
# Quiz (AI generated)
# ---------------------------------------------------------------------------
@api_router.post("/quiz/generate")
async def quiz_generate(body: QuizIn, user: dict = Depends(get_current_user)):
    sys = ("You are a quiz generator. Return ONLY valid JSON, no markdown fences. "
           "Format: {\"questions\":[{\"q\":\"...\",\"options\":[\"a\",\"b\",\"c\",\"d\"],"
           "\"answer\":0,\"explain\":\"...\"}]}. Exactly 5 questions.")
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"quiz_{uuid.uuid4().hex}",
                   system_message=sys).with_model("openai", "gpt-5.4")
    prompt = f"Create a 5-question multiple-choice quiz on '{body.subject}' at {body.difficulty} difficulty."

    async def _gen():
        resp = await chat.send_message(UserMessage(text=prompt))
        raw = resp.strip()
        raw = re.sub(r"^```(json)?", "", raw).strip()
        raw = re.sub(r"```$", "", raw).strip()
        return json.loads(raw)["questions"][:5]

    try:
        questions = await _gen()
    except Exception:
        try:
            questions = await _gen()  # one retry
        except Exception:
            raise HTTPException(status_code=500, detail="Quiz generation failed, try again")
    quiz_id = uuid.uuid4().hex
    await db.quizzes.insert_one({
        "quiz_id": quiz_id, "user_id": user["user_id"], "subject": body.subject,
        "difficulty": body.difficulty, "questions": questions,
        "created_at": now_utc().isoformat(),
    })
    # strip answers for client
    client_q = [{"q": q["q"], "options": q["options"]} for q in questions]
    return {"quiz_id": quiz_id, "subject": body.subject, "questions": client_q}


BADGE_RULES = [
    ("first_quiz", "First Steps", "Completed your first quiz"),
    ("perfect", "Perfectionist", "Scored 100% on a quiz"),
    ("scholar", "Scholar", "Earned 200+ total XP"),
    ("streak3", "On Fire", "3-day learning streak"),
    ("streak7", "Unstoppable", "7-day daily streak (+100 bonus XP)"),
    ("polymath", "Polymath", "Practised 5+ subjects"),
]


async def evaluate_badges(uid: str):
    dna = await ensure_dna(uid)
    quiz_count = await db.quiz_results.count_documents({"user_id": uid})
    perfect = await db.quiz_results.count_documents({"user_id": uid, "score": 5})
    existing = {b["code"] for b in await db.badges.find({"user_id": uid}, {"_id": 0}).to_list(100)}
    subjects = dna.get("subjects", {})
    # streak
    activity = dna.get("activity", {})
    streak = 0
    d = now_utc()
    while activity.get(d.strftime("%Y-%m-%d"), 0) > 0:
        streak += 1
        d -= timedelta(days=1)
    earned = []
    checks = {
        "first_quiz": quiz_count >= 1,
        "perfect": perfect >= 1,
        "scholar": dna.get("total_xp", 0) >= 200,
        "streak3": streak >= 3,
        "streak7": streak >= 7,
        "polymath": len(subjects) >= 5,
    }
    for code, title, desc in BADGE_RULES:
        if checks.get(code) and code not in existing:
            await db.badges.insert_one({"user_id": uid, "code": code, "title": title,
                                        "desc": desc, "ts": now_utc().isoformat()})
            # Streak-7 reward: one-time bonus XP
            if code == "streak7":
                await db.learning_dna.update_one({"user_id": uid}, {"$inc": {"total_xp": 100}})
            earned.append({"code": code, "title": title, "desc": desc})
    return earned


@api_router.post("/quiz/submit")
async def quiz_submit(body: QuizSubmitIn, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    quiz = await db.quizzes.find_one({"quiz_id": body.quiz_id}, {"_id": 0})
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    questions = quiz["questions"]
    score = 0
    review = []
    for i, q in enumerate(questions):
        chosen = body.answers[i] if i < len(body.answers) else -1
        correct = chosen == q["answer"]
        if correct:
            score += 1
        else:
            await db.mistakes.insert_one({
                "id": uuid.uuid4().hex, "user_id": uid, "subject": quiz["subject"],
                "topic": q["q"][:60], "detail": f"Correct: {q['options'][q['answer']]}",
                "ts": now_utc().isoformat()})
        review.append({"q": q["q"], "options": q["options"], "answer": q["answer"],
                       "chosen": chosen, "explain": q.get("explain", "")})
    await db.quiz_results.insert_one({
        "user_id": uid, "quiz_id": body.quiz_id, "subject": quiz["subject"],
        "score": score, "total": len(questions), "ts": now_utc().isoformat()})
    subj = quiz["subject"] if quiz["subject"] in ALL_SUBJECTS else "Algorithms"
    await record_activity(uid, subj, xp=score * 15, mistake=(score < len(questions)))
    new_badges = await evaluate_badges(uid)
    return {"score": score, "total": len(questions), "review": review, "new_badges": new_badges}


@api_router.get("/badges")
async def get_badges(user: dict = Depends(get_current_user)):
    earned = await db.badges.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(100)
    earned_codes = {b["code"] for b in earned}
    all_badges = [{"code": c, "title": t, "desc": d, "earned": c in earned_codes}
                  for c, t, d in BADGE_RULES]
    return all_badges


@api_router.get("/leaderboard")
async def leaderboard(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    # friends + me
    me_doc = await db.friends.find_one({"user_id": uid}, {"_id": 0})
    friend_ids = (me_doc or {}).get("friends", [])
    ids = list(set(friend_ids + [uid]))
    rows = []
    for fid in ids:
        u = await db.users.find_one({"user_id": fid}, {"_id": 0})
        dna = await db.learning_dna.find_one({"user_id": fid}, {"_id": 0}) or {}
        if u:
            rows.append({"user_id": fid, "name": u["name"], "picture": u.get("picture", ""),
                         "xp": dna.get("total_xp", 0), "is_me": fid == uid})
    rows.sort(key=lambda x: x["xp"], reverse=True)
    return rows


# ---------------------------------------------------------------------------
# Friends
# ---------------------------------------------------------------------------
@api_router.post("/friends/search")
async def friends_search(body: FriendSearchIn, user: dict = Depends(get_current_user)):
    q = body.query.strip().lower()
    found = await db.users.find(
        {"$or": [{"email": q}, {"mobile": body.query.strip()},
                 {"name": {"$regex": re.escape(body.query.strip()), "$options": "i"}}]},
        {"_id": 0, "password": 0}
    ).limit(10).to_list(10)
    return [{"user_id": u["user_id"], "name": u["name"], "email": u["email"],
             "picture": u.get("picture", "")} for u in found if u["user_id"] != user["user_id"]]


@api_router.post("/friends/request")
async def friend_request(body: FriendActionIn, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    await db.friend_requests.update_one(
        {"from": uid, "to": body.target_user_id},
        {"$set": {"from": uid, "to": body.target_user_id, "status": "pending",
                  "ts": now_utc().isoformat()}}, upsert=True)
    return {"ok": True}


@api_router.get("/friends/requests")
async def friend_reqs(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    incoming = await db.friend_requests.find({"to": uid, "status": "pending"}, {"_id": 0}).to_list(50)
    out = []
    for r in incoming:
        u = await db.users.find_one({"user_id": r["from"]}, {"_id": 0})
        if u:
            out.append({"from": r["from"], "name": u["name"], "picture": u.get("picture", "")})
    return out


@api_router.post("/friends/accept")
async def friend_accept(body: FriendActionIn, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    fid = body.target_user_id
    await db.friend_requests.update_one({"from": fid, "to": uid}, {"$set": {"status": "accepted"}})
    for a, b in [(uid, fid), (fid, uid)]:
        await db.friends.update_one({"user_id": a}, {"$addToSet": {"friends": b}}, upsert=True)
    return {"ok": True}


@api_router.get("/friends")
async def friends_list(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    doc = await db.friends.find_one({"user_id": uid}, {"_id": 0})
    ids = (doc or {}).get("friends", [])
    out = []
    for fid in ids:
        u = await db.users.find_one({"user_id": fid}, {"_id": 0})
        dna = await db.learning_dna.find_one({"user_id": fid}, {"_id": 0}) or {}
        if u:
            out.append({"user_id": fid, "name": u["name"], "email": u["email"],
                        "picture": u.get("picture", ""), "xp": dna.get("total_xp", 0)})
    return out


# ---------------------------------------------------------------------------
# Code compiler (secure local execution)
# ---------------------------------------------------------------------------
import subprocess, tempfile, shutil


def _run_local(language: str, code: str, stdin: str) -> dict:
    workdir = tempfile.mkdtemp(prefix="lv_run_")
    try:
        if language == "python":
            src = os.path.join(workdir, "main.py")
            with open(src, "w") as f:
                f.write(code)
            cmd = ["python3", src]
            compile_err = None
        elif language == "javascript":
            src = os.path.join(workdir, "main.js")
            with open(src, "w") as f:
                f.write(code)
            cmd = ["node", src]
            compile_err = None
        elif language in ("c", "cpp"):
            ext = "c" if language == "c" else "cpp"
            src = os.path.join(workdir, f"main.{ext}")
            binp = os.path.join(workdir, "a.out")
            with open(src, "w") as f:
                f.write(code)
            compiler = "gcc" if language == "c" else "g++"
            cp = subprocess.run([compiler, src, "-o", binp, "-lm"],
                                capture_output=True, text=True, timeout=20)
            if cp.returncode != 0:
                return {"output": cp.stderr, "code": cp.returncode}
            cmd = [binp]
            compile_err = None
        elif language == "java":
            src = os.path.join(workdir, "Main.java")
            with open(src, "w") as f:
                f.write(code)
            cp = subprocess.run(["javac", src], capture_output=True, text=True,
                                timeout=25, cwd=workdir)
            if cp.returncode != 0:
                return {"output": cp.stderr, "code": cp.returncode}
            cmd = ["java", "-cp", workdir, "Main"]
            compile_err = None
        else:
            return {"output": "Unsupported language", "code": 1}

        proc = subprocess.run(cmd, input=stdin or "", capture_output=True,
                              text=True, timeout=12, cwd=workdir)
        out = (proc.stdout or "") + (proc.stderr or "")
        return {"output": out, "code": proc.returncode}
    except subprocess.TimeoutExpired:
        return {"output": "Error: Execution timed out (limit exceeded).", "code": 124}
    except Exception as e:
        return {"output": f"Error: {e}", "code": 1}
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


SUPPORTED_LANGS = {"python", "javascript", "c", "cpp", "java"}


@api_router.post("/compile")
async def compile_code(body: CompileIn, user: dict = Depends(get_current_user)):
    if body.language not in SUPPORTED_LANGS:
        raise HTTPException(status_code=400, detail="Unsupported language")
    if len(body.code) > 50000:
        raise HTTPException(status_code=400, detail="Code too long")
    import asyncio
    result = await asyncio.to_thread(_run_local, body.language, body.code, body.stdin or "")
    await record_activity(user["user_id"], "Algorithms", xp=5)
    return {"output": result["output"] or "(no output)", "code": result["code"]}


@api_router.get("/compile/problems")
async def problems(user: dict = Depends(get_current_user)):
    return [
        {"id": "two-sum", "title": "Two Sum", "difficulty": "Easy",
         "desc": "Given an array of integers nums and an integer target, return indices of the two numbers that add up to target.",
         "starter": {"python": "def two_sum(nums, target):\n    # your code\n    pass\n\nprint(two_sum([2,7,11,15], 9))"}},
        {"id": "reverse-string", "title": "Reverse String", "difficulty": "Easy",
         "desc": "Write a function that reverses a string.",
         "starter": {"python": "def reverse(s):\n    return s[::-1]\n\nprint(reverse('hello'))"}},
        {"id": "fibonacci", "title": "Fibonacci", "difficulty": "Medium",
         "desc": "Return the nth Fibonacci number.",
         "starter": {"python": "def fib(n):\n    a,b=0,1\n    for _ in range(n): a,b=b,a+b\n    return a\n\nprint(fib(10))"}},
    ]


# ---------------------------------------------------------------------------
# Mock interview (AI)
# ---------------------------------------------------------------------------
@api_router.post("/interview/start")
async def interview_start(body: InterviewStartIn, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    sid = uuid.uuid4().hex
    sys = (f"You are a professional 1-on-1 technical interviewer for a '{body.role}' role. "
           "Ask ONE question at a time. Keep questions realistic and progressively harder. "
           "Return ONLY the question text, no preamble.")
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"intv_{sid}", system_message=sys) \
        .with_model("anthropic", "claude-sonnet-5")
    q = await chat.send_message(UserMessage(text=f"Start the interview for {body.role}. Ask question 1."))
    await db.interviews.insert_one({
        "session_id": sid, "user_id": uid, "role": body.role, "qa": [],
        "current_q": q.strip(), "count": 1, "created_at": now_utc().isoformat()})
    return {"session_id": sid, "question": q.strip(), "number": 1}


@api_router.post("/interview/answer")
async def interview_answer(body: InterviewAnswerIn, user: dict = Depends(get_current_user)):
    intv = await db.interviews.find_one({"session_id": body.session_id}, {"_id": 0})
    if not intv:
        raise HTTPException(status_code=404, detail="Interview not found")
    sys = (f"You are a professional interviewer for a '{intv['role']}' role. "
           "The candidate answered your question. Give brief constructive feedback (2-3 lines) with a score /10, "
           "then ask the NEXT harder question. "
           "Return JSON only: {\"feedback\":\"...\",\"score\":7,\"next_question\":\"...\",\"done\":false}. "
           "Set done=true after 5 questions.")
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"intvfb_{body.session_id}_{intv['count']}",
                   system_message=sys).with_model("anthropic", "claude-sonnet-5")
    prompt = (f"Question was: {intv['current_q']}\nCandidate answer: {body.answer}\n"
              f"This is question number {intv['count']} of 5.")
    resp = await chat.send_message(UserMessage(text=prompt))
    raw = re.sub(r"^```(json)?|```$", "", resp.strip()).strip()
    try:
        data = json.loads(raw)
    except Exception:
        data = {"feedback": resp.strip()[:300], "score": 6,
                "next_question": "Tell me about a challenging bug you fixed.",
                "done": intv["count"] >= 5}
    done = data.get("done") or intv["count"] >= 5
    qa = intv["qa"] + [{"q": intv["current_q"], "a": body.answer,
                        "feedback": data.get("feedback", ""), "score": data.get("score", 0)}]
    await db.interviews.update_one(
        {"session_id": body.session_id},
        {"$set": {"qa": qa, "current_q": data.get("next_question", ""),
                  "count": intv["count"] + 1, "done": done}})
    await record_activity(user["user_id"], "Software Engineering", xp=12)
    avg = round(sum(x["score"] for x in qa) / len(qa), 1) if qa else 0
    return {"feedback": data.get("feedback", ""), "score": data.get("score", 0),
            "next_question": None if done else data.get("next_question", ""),
            "number": intv["count"] + 1, "done": done, "avg_score": avg, "qa": qa}


@api_router.get("/")
async def root():
    return {"message": "Edu-Crack API"}


# ---------------------------------------------------------------------------
# Speech-to-text (Whisper) — voice answers
# ---------------------------------------------------------------------------
@api_router.post("/stt")
async def speech_to_text(file: UploadFile = File(...), language: str = Form("en"),
                         user: dict = Depends(get_current_user)):
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Audio too large (max 25MB)")
    suffix = ".webm"
    name = file.filename or ""
    for ext in (".mp3", ".wav", ".m4a", ".mp4", ".webm", ".mpeg", ".mpga"):
        if name.lower().endswith(ext):
            suffix = ext
            break
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        tmp.write(data)
        tmp.flush()
        tmp.close()
        stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
        lang = None if language in ("tanglish", "auto", "") else language
        with open(tmp.name, "rb") as af:
            kwargs = {"model": "whisper-1", "response_format": "json"}
            if lang:
                kwargs["language"] = lang
            resp = await stt.transcribe(file=af, **kwargs)
        text = getattr(resp, "text", "") or ""
        return {"text": text.strip()}
    except Exception as e:
        logger.exception("stt error")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {e}")
    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Daily Challenge — 30-second spark quiz
# ---------------------------------------------------------------------------
DAILY_SUBJECTS = ["Data Structures", "Algorithms", "Operating Systems", "DBMS",
                  "Computer Networks", "Mathematics", "Physics", "AI & Machine Learning"]


async def _get_or_build_daily():
    today = now_utc().strftime("%Y-%m-%d")
    doc = await db.daily_challenges.find_one({"date": today}, {"_id": 0})
    if doc:
        return doc
    subject = DAILY_SUBJECTS[now_utc().timetuple().tm_yday % len(DAILY_SUBJECTS)]
    sys = ("Return ONLY valid JSON, no fences: "
           "{\"q\":\"...\",\"options\":[\"a\",\"b\",\"c\",\"d\"],\"answer\":0,\"explain\":\"...\"}. "
           "One crisp multiple-choice question answerable in 30 seconds.")
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"daily_{today}",
                   system_message=sys).with_model("openai", "gpt-5.4")
    try:
        resp = await chat.send_message(UserMessage(text=f"Quick daily quiz question about {subject}."))
        raw = re.sub(r"^```(json)?|```$", "", resp.strip()).strip()
        q = json.loads(raw)
    except Exception:
        q = {"q": f"Quick warm-up: which is a linear data structure?",
             "options": ["Tree", "Graph", "Array", "Heap"], "answer": 2,
             "explain": "An array stores elements linearly in contiguous memory."}
    doc = {"date": today, "subject": subject, "q": q["q"], "options": q["options"],
           "answer": q["answer"], "explain": q.get("explain", "")}
    await db.daily_challenges.insert_one(dict(doc))
    return doc


@api_router.get("/daily")
async def get_daily(user: dict = Depends(get_current_user)):
    today = now_utc().strftime("%Y-%m-%d")
    doc = await _get_or_build_daily()
    result = await db.daily_results.find_one(
        {"user_id": user["user_id"], "date": today}, {"_id": 0})
    return {"date": today, "subject": doc["subject"], "q": doc["q"],
            "options": doc["options"], "done": bool(result),
            "last_result": result}


@api_router.post("/daily/submit")
async def submit_daily(body: dict, user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    today = now_utc().strftime("%Y-%m-%d")
    existing = await db.daily_results.find_one({"user_id": uid, "date": today}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Already completed today's challenge")
    doc = await _get_or_build_daily()
    chosen = body.get("answer", -1)
    time_taken = body.get("time_taken", 30)
    correct = chosen == doc["answer"]
    xp = (25 if time_taken <= 15 else 15) if correct else 3
    await db.daily_results.insert_one({
        "user_id": uid, "date": today, "correct": correct, "xp": xp,
        "ts": now_utc().isoformat()})
    await record_activity(uid, doc["subject"], xp=xp, mistake=(not correct))
    if not correct:
        await db.mistakes.insert_one({
            "id": uuid.uuid4().hex, "user_id": uid, "subject": doc["subject"],
            "topic": "Daily Challenge: " + doc["q"][:50],
            "detail": f"Correct: {doc['options'][doc['answer']]}", "ts": now_utc().isoformat()})
    dna = await ensure_dna(uid)
    activity = dna.get("activity", {})
    streak = 0
    d = now_utc()
    while activity.get(d.strftime("%Y-%m-%d"), 0) > 0:
        streak += 1
        d -= timedelta(days=1)
    new_badges = await evaluate_badges(uid)
    bonus = 100 if any(b["code"] == "streak7" for b in new_badges) else 0
    return {"correct": correct, "answer": doc["answer"], "explain": doc["explain"],
            "xp": xp, "streak": streak, "new_badges": new_badges, "bonus_xp": bonus}


# ---------------------------------------------------------------------------
# Object storage (mock interview video recordings)
# ---------------------------------------------------------------------------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "learnverse"
_storage_key = None


def init_storage(force: bool = False):
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key, "Content-Type": content_type},
                        data=data, timeout=120)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": key, "Content-Type": content_type},
                            data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.get(f"{STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "video/webm")


@api_router.post("/interview/save")
async def interview_save(session_id: str = Form(...), video: UploadFile = File(None),
                         user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    intv = await db.interviews.find_one({"session_id": session_id}, {"_id": 0})
    if not intv or intv["user_id"] != uid:
        raise HTTPException(status_code=404, detail="Interview not found")
    qa = intv.get("qa", [])
    avg = round(sum(x["score"] for x in qa) / len(qa), 1) if qa else 0
    video_path = None
    if video is not None:
        data = await video.read()
        if len(data) > 200 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Recording too large (max 200MB)")
        if data:
            path = f"{APP_NAME}/interviews/{uid}/{uuid.uuid4().hex}.webm"
            try:
                result = await asyncio.to_thread(put_object, path, data, "video/webm")
                video_path = result["path"]
            except Exception as e:
                logger.error(f"video upload failed: {e}")
    rec_id = uuid.uuid4().hex
    await db.interview_records.insert_one({
        "id": rec_id, "user_id": uid, "role": intv["role"], "qa": qa, "avg_score": avg,
        "video_path": video_path, "is_deleted": False, "created_at": now_utc().isoformat()})
    return {"id": rec_id, "avg_score": avg, "has_video": bool(video_path)}


@api_router.get("/interview/records")
async def interview_records(user: dict = Depends(get_current_user)):
    rows = await db.interview_records.find(
        {"user_id": user["user_id"], "is_deleted": False}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return [{"id": r["id"], "role": r["role"], "avg_score": r["avg_score"],
             "qa": r["qa"], "has_video": bool(r.get("video_path")),
             "created_at": r["created_at"]} for r in rows]


@api_router.get("/interview/video/{record_id}")
async def interview_video(record_id: str, auth: str = None):
    # auth via query param since <video src> cannot send headers
    if not auth:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(auth, JWT_SECRET, algorithms=[JWT_ALG])
        uid = payload["user_id"]
    except jwt.PyJWTError:
        session = await db.user_sessions.find_one({"session_token": auth}, {"_id": 0})
        if not session:
            raise HTTPException(status_code=401, detail="Invalid session")
        uid = session["user_id"]
    rec = await db.interview_records.find_one(
        {"id": record_id, "user_id": uid, "is_deleted": False}, {"_id": 0})
    if not rec or not rec.get("video_path"):
        raise HTTPException(status_code=404, detail="Video not found")
    data, ctype = await asyncio.to_thread(get_object, rec["video_path"])
    return Response(content=data, media_type=ctype)


# ---------------------------------------------------------------------------
# Group Battle — live head-to-head quiz race
# ---------------------------------------------------------------------------
async def gen_questions(subject: str, difficulty: str):
    sys = ("Return ONLY valid JSON, no fences: "
           "{\"questions\":[{\"q\":\"...\",\"options\":[\"a\",\"b\",\"c\",\"d\"],\"answer\":0}]}. "
           "Exactly 5 crisp multiple-choice questions, each answerable in ~15 seconds.")
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"battle_{uuid.uuid4().hex}",
                   system_message=sys).with_model("openai", "gpt-5.4")
    prompt = f"5-question quiz on '{subject}' at {difficulty} difficulty."

    async def _g():
        resp = await chat.send_message(UserMessage(text=prompt))
        raw = re.sub(r"^```(json)?|```$", "", resp.strip()).strip()
        return json.loads(raw)["questions"][:5]
    try:
        return await _g()
    except Exception:
        return await _g()


def _player_view(p):
    return {"user_id": p["user_id"], "name": p["name"], "picture": p.get("picture", ""),
            "score": p.get("score", 0), "answered": len(p.get("answers", [])),
            "total_ms": p.get("total_ms", 0), "finished": p.get("finished", False)}


class BattleCreateIn(BaseModel):
    subject: str
    difficulty: Optional[str] = "medium"


class BattleCodeIn(BaseModel):
    code: str


class BattleAnswerIn(BaseModel):
    code: str
    q_index: int
    answer: int
    time_ms: int


@api_router.post("/battle/create")
async def battle_create(body: BattleCreateIn, user: dict = Depends(get_current_user)):
    questions = await gen_questions(body.subject, body.difficulty)
    if not questions:
        raise HTTPException(status_code=500, detail="Could not create battle, try again")
    code = uuid.uuid4().hex[:6].upper()
    battle = {"id": uuid.uuid4().hex, "code": code, "host_id": user["user_id"],
              "subject": body.subject, "difficulty": body.difficulty,
              "questions": questions, "status": "waiting",
              "created_at": now_utc().isoformat(), "started_at": None}
    await db.battles.insert_one(dict(battle))
    await db.battle_players.insert_one({
        "code": code, "user_id": user["user_id"], "name": user["name"],
        "picture": user.get("picture", ""), "answers": [], "score": 0,
        "total_ms": 0, "finished": False, "joined_at": now_utc().isoformat()})
    return {"code": code, "subject": body.subject}


@api_router.post("/battle/join")
async def battle_join(body: BattleCodeIn, user: dict = Depends(get_current_user)):
    code = body.code.strip().upper()
    battle = await db.battles.find_one({"code": code}, {"_id": 0})
    if not battle:
        raise HTTPException(status_code=404, detail="Battle not found")
    if battle["status"] != "waiting":
        raise HTTPException(status_code=400, detail="Battle already started")
    exists = await db.battle_players.find_one({"code": code, "user_id": user["user_id"]}, {"_id": 0})
    if not exists:
        await db.battle_players.insert_one({
            "code": code, "user_id": user["user_id"], "name": user["name"],
            "picture": user.get("picture", ""), "answers": [], "score": 0,
            "total_ms": 0, "finished": False, "joined_at": now_utc().isoformat()})
    return {"code": code, "subject": battle["subject"]}


@api_router.post("/battle/start")
async def battle_start(body: BattleCodeIn, user: dict = Depends(get_current_user)):
    code = body.code.strip().upper()
    battle = await db.battles.find_one({"code": code}, {"_id": 0})
    if not battle:
        raise HTTPException(status_code=404, detail="Battle not found")
    if battle["host_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Only the host can start")
    await db.battles.update_one({"code": code},
                                {"$set": {"status": "active", "started_at": now_utc().isoformat()}})
    return {"ok": True}


@api_router.get("/battle/{code}")
async def battle_state(code: str, user: dict = Depends(get_current_user)):
    code = code.strip().upper()
    battle = await db.battles.find_one({"code": code}, {"_id": 0})
    if not battle:
        raise HTTPException(status_code=404, detail="Battle not found")
    players = await db.battle_players.find({"code": code}, {"_id": 0}).to_list(20)
    ranked = sorted([_player_view(p) for p in players],
                    key=lambda x: (-x["score"], x["total_ms"] if x["finished"] else 10**12))
    all_done = len(players) > 0 and all(p.get("finished") for p in players)
    if all_done and battle["status"] != "finished":
        await db.battles.update_one({"code": code}, {"$set": {"status": "finished"}})
        battle["status"] = "finished"
    return {"code": code, "subject": battle["subject"], "status": battle["status"],
            "host_id": battle["host_id"], "is_host": battle["host_id"] == user["user_id"],
            "num_questions": len(battle["questions"]), "players": ranked}


@api_router.get("/battle/{code}/questions")
async def battle_questions(code: str, user: dict = Depends(get_current_user)):
    code = code.strip().upper()
    battle = await db.battles.find_one({"code": code}, {"_id": 0})
    if not battle:
        raise HTTPException(status_code=404, detail="Battle not found")
    if battle["status"] == "waiting":
        raise HTTPException(status_code=400, detail="Battle not started")
    return {"questions": [{"q": q["q"], "options": q["options"]} for q in battle["questions"]]}


@api_router.post("/battle/answer")
async def battle_answer(body: BattleAnswerIn, user: dict = Depends(get_current_user)):
    code = body.code.strip().upper()
    battle = await db.battles.find_one({"code": code}, {"_id": 0})
    if not battle:
        raise HTTPException(status_code=404, detail="Battle not found")
    player = await db.battle_players.find_one({"code": code, "user_id": user["user_id"]}, {"_id": 0})
    if not player:
        raise HTTPException(status_code=404, detail="Not in this battle")
    answers = player.get("answers", [])
    if any(a["q"] == body.q_index for a in answers):
        return {"ok": True, "score": player.get("score", 0)}  # ignore duplicates
    correct = body.answer == battle["questions"][body.q_index]["answer"]
    answers.append({"q": body.q_index, "chosen": body.answer, "correct": correct, "time_ms": body.time_ms})
    score = sum(1 for a in answers if a["correct"])
    total_ms = sum(a["time_ms"] for a in answers)
    finished = len(answers) >= len(battle["questions"])
    await db.battle_players.update_one(
        {"code": code, "user_id": user["user_id"]},
        {"$set": {"answers": answers, "score": score, "total_ms": total_ms, "finished": finished}})
    if finished:
        subj = battle["subject"] if battle["subject"] in ALL_SUBJECTS else "Algorithms"
        await record_activity(user["user_id"], subj, xp=score * 12)
    return {"ok": True, "correct": correct, "score": score, "finished": finished}


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    try:
        await asyncio.to_thread(init_storage)
        logger.info("Object storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed (non-fatal): {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()

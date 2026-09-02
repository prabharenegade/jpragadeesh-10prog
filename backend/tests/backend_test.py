"""LearnVerse backend API tests."""
import os
import time
import uuid
import json
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://genius-gateway-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

SEED_EMAIL = "ravi_test@example.com"
SEED_PASS = "pass1234"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def seed_token(session):
    """Login seed user; if missing, register."""
    r = session.post(f"{API}/auth/login", json={"email": SEED_EMAIL, "password": SEED_PASS})
    if r.status_code != 200:
        r = session.post(f"{API}/auth/register", json={
            "name": "Ravi Kumar", "email": SEED_EMAIL,
            "password": SEED_PASS, "mobile": "9876500011",
        })
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def auth(seed_token):
    return {"Authorization": f"Bearer {seed_token}"}


# -------- Auth --------
class TestAuth:
    def test_register_new_user(self, session):
        email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        r = session.post(f"{API}/auth/register", json={
            "name": "TEST User", "email": email, "password": "pw12345", "mobile": "9000000000"
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and data["user"]["email"] == email

    def test_login_seed(self, session):
        r = session.post(f"{API}/auth/login", json={"email": SEED_EMAIL, "password": SEED_PASS})
        assert r.status_code == 200
        assert "token" in r.json()

    def test_login_invalid(self, session):
        r = session.post(f"{API}/auth/login", json={"email": SEED_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me(self, session, auth):
        r = session.get(f"{API}/auth/me", headers=auth)
        assert r.status_code == 200
        assert r.json()["email"] == SEED_EMAIL

    def test_me_unauth(self, session):
        r = session.get(f"{API}/auth/me")
        assert r.status_code == 401


# -------- Catalog --------
class TestCatalog:
    def test_catalog(self, session):
        r = session.get(f"{API}/catalog")
        assert r.status_code == 200
        d = r.json()
        assert "catalog" in d and "languages" in d and "teachers" in d
        assert len(d["subjects"]) > 0


# -------- DNA --------
class TestDNA:
    def test_get_dna(self, session, auth):
        r = session.get(f"{API}/dna", headers=auth)
        assert r.status_code == 200
        d = r.json()
        assert "total_xp" in d and "time_machine" in d and "streak" in d


# -------- Mistakes --------
class TestMistakes:
    def test_add_and_list_mistake(self, session, auth):
        r = session.post(f"{API}/mistakes", headers=auth,
                         json={"subject": "Algorithms", "topic": "TEST_bfs",
                               "detail": "confused with dfs"})
        assert r.status_code == 200
        assert r.json()["topic"] == "TEST_bfs"
        r2 = session.get(f"{API}/mistakes", headers=auth)
        assert r2.status_code == 200
        assert any(m["topic"] == "TEST_bfs" for m in r2.json())


# -------- Compiler (all 5 languages) --------
class TestCompiler:
    def test_python(self, session, auth):
        r = session.post(f"{API}/compile", headers=auth,
                         json={"language": "python", "code": "print(2+3)"})
        assert r.status_code == 200
        assert "5" in r.json()["output"]

    def test_javascript(self, session, auth):
        r = session.post(f"{API}/compile", headers=auth,
                         json={"language": "javascript", "code": "console.log(2+3)"})
        assert r.status_code == 200
        assert "5" in r.json()["output"]

    def test_c(self, session, auth):
        code = '#include <stdio.h>\nint main(){printf("hi=%d\\n",7);return 0;}'
        r = session.post(f"{API}/compile", headers=auth,
                         json={"language": "c", "code": code})
        assert r.status_code == 200
        assert "hi=7" in r.json()["output"]

    def test_cpp(self, session, auth):
        code = '#include <iostream>\nint main(){std::cout<<"cpp"<<9;return 0;}'
        r = session.post(f"{API}/compile", headers=auth,
                         json={"language": "cpp", "code": code})
        assert r.status_code == 200
        assert "cpp9" in r.json()["output"]

    def test_java(self, session, auth):
        code = 'public class Main { public static void main(String[] a){ System.out.println("java-ok"); } }'
        r = session.post(f"{API}/compile", headers=auth,
                         json={"language": "java", "code": code})
        assert r.status_code == 200
        assert "java-ok" in r.json()["output"]

    def test_stdin(self, session, auth):
        code = 'x=input()\nprint("got:"+x)'
        r = session.post(f"{API}/compile", headers=auth,
                         json={"language": "python", "code": code, "stdin": "hello\n"})
        assert r.status_code == 200
        assert "got:hello" in r.json()["output"]

    def test_unsupported(self, session, auth):
        r = session.post(f"{API}/compile", headers=auth,
                         json={"language": "ruby", "code": "puts 1"})
        assert r.status_code == 400

    def test_problems(self, session, auth):
        r = session.get(f"{API}/compile/problems", headers=auth)
        assert r.status_code == 200 and len(r.json()) >= 3


# -------- Chat streaming --------
class TestChat:
    def test_chat_stream(self, session, auth):
        payload = {"message": "What is 2+2? one word", "session_id": f"test_{uuid.uuid4().hex[:8]}",
                   "subject": "Mathematics", "language": "en", "teacher": "prof", "mode": "solve"}
        r = requests.post(f"{API}/chat/stream", json=payload, headers=auth, stream=True, timeout=60)
        assert r.status_code == 200
        text = ""
        got_delta = False
        done = False
        start = time.time()
        for line in r.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data:"):
                continue
            data = json.loads(line[5:].strip())
            if "delta" in data:
                text += data["delta"]
                got_delta = True
            if data.get("done"):
                done = True
                break
            if time.time() - start > 60:
                break
        assert got_delta, "no streamed tokens"
        assert done
        assert len(text) > 0


# -------- TTS --------
class TestTTS:
    def test_tts(self, session, auth):
        r = session.post(f"{API}/tts", headers=auth,
                         json={"text": "Hello student", "voice": "nova"})
        assert r.status_code == 200, r.text
        url = r.json()["url"]
        assert url.startswith("/api/tts/") and url.endswith(".mp3")
        r2 = requests.get(f"{BASE_URL}{url}", timeout=30)
        assert r2.status_code == 200
        assert r2.headers.get("content-type", "").startswith("audio")


# -------- Quiz --------
_quiz_state = {}


class TestQuiz:
    def test_generate(self, session, auth):
        r = session.post(f"{API}/quiz/generate", headers=auth,
                         json={"subject": "Algorithms", "difficulty": "easy"}, timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        assert len(d["questions"]) == 5
        assert all("options" in q and len(q["options"]) == 4 for q in d["questions"])
        _quiz_state["quiz_id"] = d["quiz_id"]

    def test_submit(self, session, auth):
        qid = _quiz_state.get("quiz_id")
        if not qid:
            pytest.skip("no quiz generated")
        r = session.post(f"{API}/quiz/submit", headers=auth,
                         json={"quiz_id": qid, "answers": [0, 1, 2, 3, 0]})
        assert r.status_code == 200
        d = r.json()
        assert "score" in d and d["total"] == 5 and len(d["review"]) == 5

    def test_badges(self, session, auth):
        r = session.get(f"{API}/badges", headers=auth)
        assert r.status_code == 200
        assert len(r.json()) >= 5

    def test_leaderboard(self, session, auth):
        r = session.get(f"{API}/leaderboard", headers=auth)
        assert r.status_code == 200
        assert any(row["is_me"] for row in r.json())


# -------- Friends --------
class TestFriends:
    def test_search(self, session, auth):
        r = session.post(f"{API}/friends/search", headers=auth, json={"query": "ravi_test"})
        assert r.status_code == 200
        # seed user searches self -> excluded, but shouldn't error
        assert isinstance(r.json(), list)

    def test_flow(self, session, auth):
        # create another user, send request, accept
        other_email = f"friend_{uuid.uuid4().hex[:6]}@example.com"
        r = requests.post(f"{API}/auth/register", json={
            "name": "TEST Friend", "email": other_email, "password": "pw12345", "mobile": "9111111111"
        })
        assert r.status_code == 200
        other_token = r.json()["token"]
        other_uid = r.json()["user"]["user_id"]
        other_auth = {"Authorization": f"Bearer {other_token}"}

        # seed sends request to other
        r = session.post(f"{API}/friends/request", headers=auth,
                         json={"target_user_id": other_uid})
        assert r.status_code == 200

        # other sees incoming
        r = requests.get(f"{API}/friends/requests", headers=other_auth)
        assert r.status_code == 200
        seed_me = requests.get(f"{API}/auth/me", headers=auth).json()
        assert any(x["from"] == seed_me["user_id"] for x in r.json())

        # other accepts
        r = requests.post(f"{API}/friends/accept", headers=other_auth,
                          json={"target_user_id": seed_me["user_id"]})
        assert r.status_code == 200

        # seed friends list contains other
        r = session.get(f"{API}/friends", headers=auth)
        assert r.status_code == 200
        assert any(f["user_id"] == other_uid for f in r.json())


# -------- Interview --------
_intv = {}


class TestInterview:
    def test_start(self, session, auth):
        r = session.post(f"{API}/interview/start", headers=auth,
                         json={"role": "Backend Engineer"}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["question"] and d["number"] == 1
        _intv["sid"] = d["session_id"]

    def test_answer(self, session, auth):
        sid = _intv.get("sid")
        if not sid:
            pytest.skip("no session")
        r = session.post(f"{API}/interview/answer", headers=auth,
                         json={"session_id": sid,
                               "answer": "I would use indexing and query optimization."},
                         timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert "score" in d and "feedback" in d


# -------- STT (Whisper) — voice answers --------
class TestSTT:
    """Round-trip: TTS produces mp3, STT should transcribe (or at least return 200)."""

    def test_stt_roundtrip(self, session, auth):
        # produce speech
        r = session.post(f"{API}/tts", headers=auth,
                         json={"text": "hello learn verse", "voice": "nova"})
        assert r.status_code == 200
        url = r.json()["url"]
        audio_r = requests.get(f"{BASE_URL}{url}", timeout=30)
        assert audio_r.status_code == 200
        files = {"file": ("speech.mp3", audio_r.content, "audio/mpeg")}
        data = {"language": "en"}
        headers = {"Authorization": auth["Authorization"]}
        r2 = requests.post(f"{API}/stt", headers=headers, files=files, data=data, timeout=90)
        assert r2.status_code == 200, r2.text
        assert "text" in r2.json()

    def test_stt_unauth(self):
        files = {"file": ("x.wav", b"RIFF0000WAVE", "audio/wav")}
        r = requests.post(f"{API}/stt", files=files, timeout=30)
        assert r.status_code == 401


# -------- Daily Challenge --------
class TestDaily:
    def test_daily_flow(self, session):
        # Use fresh user so we can submit
        email = f"daily_{uuid.uuid4().hex[:8]}@example.com"
        rr = requests.post(f"{API}/auth/register", json={
            "name": "TEST Daily", "email": email, "password": "pw12345", "mobile": "9222222222"
        })
        assert rr.status_code == 200
        token = rr.json()["token"]
        h = {"Authorization": f"Bearer {token}"}

        # GET /daily
        r = requests.get(f"{API}/daily", headers=h, timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert "q" in d and "options" in d and len(d["options"]) >= 2
        assert d["done"] is False

        # submit
        r2 = requests.post(f"{API}/daily/submit", headers=h,
                           json={"answer": 0, "time_taken": 10})
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        assert "correct" in d2 and "xp" in d2 and "streak" in d2

        # duplicate submit
        r3 = requests.post(f"{API}/daily/submit", headers=h,
                           json={"answer": 0, "time_taken": 10})
        assert r3.status_code == 400
        assert "Already" in r3.json().get("detail", "")

        # done state
        r4 = requests.get(f"{API}/daily", headers=h)
        assert r4.status_code == 200
        assert r4.json()["done"] is True



# -------- Streak Rewards (7-day streak -> Unstoppable + 100 bonus XP) --------
from datetime import datetime, timedelta, timezone  # noqa: E402
from pymongo import MongoClient  # noqa: E402


def _mongo():
    url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    dbn = os.environ.get("DB_NAME", "test_database")
    return MongoClient(url)[dbn]


class TestStreakRewards:
    def test_streak7_bonus_and_badge(self):
        # fresh user
        email = f"streak_{uuid.uuid4().hex[:8]}@example.com"
        rr = requests.post(f"{API}/auth/register", json={
            "name": "TEST Streak", "email": email, "password": "pw12345", "mobile": "9333333333"
        })
        assert rr.status_code == 200
        token = rr.json()["token"]
        user_id = rr.json()["user"]["user_id"]
        h = {"Authorization": f"Bearer {token}"}

        # Seed 6 previous days of activity via mongo
        db = _mongo()
        today = datetime.now(timezone.utc)
        activity = {}
        for i in range(1, 7):  # yesterday..6 days ago
            d = (today - timedelta(days=i)).strftime("%Y-%m-%d")
            activity[d] = 2
        db.learning_dna.update_one(
            {"user_id": user_id},
            {"$set": {"activity": activity}},
            upsert=True,
        )

        # Get baseline XP
        r0 = requests.get(f"{API}/dna", headers=h)
        assert r0.status_code == 200
        xp_before = r0.json().get("total_xp", 0)

        # Ensure daily challenge exists
        rd = requests.get(f"{API}/daily", headers=h, timeout=60)
        assert rd.status_code == 200

        # Submit daily -> should trigger streak=7, bonus_xp=100, Unstoppable
        r = requests.post(f"{API}/daily/submit", headers=h,
                         json={"answer": 0, "time_taken": 10})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["streak"] == 7, f"expected streak=7 got {d['streak']}"
        assert d["bonus_xp"] == 100, f"expected bonus_xp=100 got {d['bonus_xp']}"
        codes = [b["code"] for b in d["new_badges"]]
        assert "streak7" in codes, f"Unstoppable badge missing: {codes}"

        # Verify XP includes the +100
        r2 = requests.get(f"{API}/dna", headers=h)
        xp_after = r2.json().get("total_xp", 0)
        assert xp_after >= xp_before + 100, f"xp not incremented by bonus: {xp_before}->{xp_after}"

        # Badges endpoint reflects Unstoppable earned
        rb = requests.get(f"{API}/badges", headers=h)
        assert rb.status_code == 200
        unstop = [b for b in rb.json() if b["code"] == "streak7"]
        assert unstop and unstop[0]["earned"] is True

    def test_no_bonus_below_7(self):
        # fresh user with no prior activity -> streak=1, bonus=0
        email = f"nostreak_{uuid.uuid4().hex[:8]}@example.com"
        rr = requests.post(f"{API}/auth/register", json={
            "name": "TEST NoStreak", "email": email, "password": "pw12345", "mobile": "9444444444"
        })
        token = rr.json()["token"]
        h = {"Authorization": f"Bearer {token}"}
        requests.get(f"{API}/daily", headers=h, timeout=60)
        r = requests.post(f"{API}/daily/submit", headers=h,
                         json={"answer": 0, "time_taken": 10})
        assert r.status_code == 200
        d = r.json()
        assert d["bonus_xp"] == 0
        assert d["streak"] < 7
        codes = [b["code"] for b in d["new_badges"]]
        assert "streak7" not in codes


# -------- Interview Recording (save/records/video) --------
class TestInterviewRecording:
    def test_save_records_and_video(self, session, auth, seed_token):
        # start + answer twice to get a session with qa
        r = session.post(f"{API}/interview/start", headers=auth,
                         json={"role": "Backend Engineer"}, timeout=60)
        assert r.status_code == 200
        sid = r.json()["session_id"]
        r = session.post(f"{API}/interview/answer", headers=auth,
                         json={"session_id": sid, "answer": "Use B-tree indexes to speed lookups."},
                         timeout=60)
        assert r.status_code == 200

        # tiny fake webm bytes; server just uploads whatever we send
        fake_video = b"\x1a\x45\xdf\xa3" + os.urandom(2048)  # EBML header + noise
        files = {"video": ("interview.webm", fake_video, "video/webm")}
        data = {"session_id": sid}
        headers = {"Authorization": auth["Authorization"]}
        rs = requests.post(f"{API}/interview/save", headers=headers,
                          files=files, data=data, timeout=120)
        assert rs.status_code == 200, rs.text
        js = rs.json()
        assert "id" in js and "avg_score" in js and "has_video" in js
        rec_id = js["id"]
        assert js["has_video"] is True

        # Records list contains it with qa + avg_score
        rl = requests.get(f"{API}/interview/records", headers=headers, timeout=30)
        assert rl.status_code == 200
        rows = rl.json()
        found = [x for x in rows if x["id"] == rec_id]
        assert found, "saved record not in list"
        rec = found[0]
        assert rec["has_video"] is True
        assert isinstance(rec["qa"], list) and len(rec["qa"]) >= 1
        assert "avg_score" in rec

        # Video fetch with auth query param -> 200 with bytes
        rv = requests.get(f"{API}/interview/video/{rec_id}", params={"auth": seed_token}, timeout=60)
        assert rv.status_code == 200
        assert len(rv.content) > 0

        # Unauthenticated -> 401
        ru = requests.get(f"{API}/interview/video/{rec_id}", timeout=30)
        assert ru.status_code == 401

    def test_save_without_video(self, session, auth):
        r = session.post(f"{API}/interview/start", headers=auth,
                         json={"role": "Data Scientist"}, timeout=60)
        sid = r.json()["session_id"]
        session.post(f"{API}/interview/answer", headers=auth,
                    json={"session_id": sid, "answer": "Cross-validation avoids overfitting."},
                    timeout=60)
        headers = {"Authorization": auth["Authorization"]}
        rs = requests.post(f"{API}/interview/save", headers=headers,
                          data={"session_id": sid}, timeout=60)
        assert rs.status_code == 200
        assert rs.json()["has_video"] is False


# -------- Rename to Edu-Crack --------
class TestRename:
    def test_root_message(self, session):
        r = session.get(f"{API}/")
        assert r.status_code == 200
        assert r.json().get("message") == "Edu-Crack API", r.json()


# -------- Group Battle --------
class TestBattle:
    def test_full_flow_two_players(self):
        # host = seed user
        rh = requests.post(f"{API}/auth/login", json={"email": SEED_EMAIL, "password": SEED_PASS})
        if rh.status_code != 200:
            rh = requests.post(f"{API}/auth/register", json={
                "name": "Ravi Kumar", "email": SEED_EMAIL,
                "password": SEED_PASS, "mobile": "9876500011",
            })
        assert rh.status_code == 200
        host_h = {"Authorization": f"Bearer {rh.json()['token']}"}
        host_uid = rh.json()["user"]["user_id"]

        # guest fresh
        gemail = f"battle_{uuid.uuid4().hex[:6]}@example.com"
        rg = requests.post(f"{API}/auth/register", json={
            "name": "TEST Battle Guest", "email": gemail,
            "password": "pw12345", "mobile": "9555555555"
        })
        assert rg.status_code == 200
        guest_h = {"Authorization": f"Bearer {rg.json()['token']}"}
        guest_uid = rg.json()["user"]["user_id"]

        # create
        rc = requests.post(f"{API}/battle/create", headers=host_h,
                           json={"subject": "Algorithms", "difficulty": "easy"}, timeout=90)
        assert rc.status_code == 200, rc.text
        code = rc.json()["code"]
        assert isinstance(code, str) and len(code) == 6

        # guest joins
        rj = requests.post(f"{API}/battle/join", headers=guest_h, json={"code": code})
        assert rj.status_code == 200

        # non-host cannot start
        rns = requests.post(f"{API}/battle/start", headers=guest_h, json={"code": code})
        assert rns.status_code == 403

        # host starts
        rs = requests.post(f"{API}/battle/start", headers=host_h, json={"code": code})
        assert rs.status_code == 200

        # state active + 2 players
        rst = requests.get(f"{API}/battle/{code}", headers=host_h)
        assert rst.status_code == 200
        st = rst.json()
        assert st["status"] == "active"
        assert st["num_questions"] == 5
        assert st["is_host"] is True
        assert len(st["players"]) == 2

        # questions no answers exposed
        rq = requests.get(f"{API}/battle/{code}/questions", headers=host_h)
        assert rq.status_code == 200
        qs = rq.json()["questions"]
        assert len(qs) == 5
        for q in qs:
            assert "answer" not in q
            assert "options" in q and len(q["options"]) >= 2

        # Fetch actual correct answers via mongo for scoring test
        db = _mongo()
        battle = db.battles.find_one({"code": code})
        correct = [q["answer"] for q in battle["questions"]]

        # Host answers ALL WRONG; Guest answers ALL CORRECT -> Guest wins ranking
        for i in range(5):
            wrong = (correct[i] + 1) % 4
            r1 = requests.post(f"{API}/battle/answer", headers=host_h,
                               json={"code": code, "q_index": i,
                                     "answer": wrong, "time_ms": 3000})
            assert r1.status_code == 200
            r2 = requests.post(f"{API}/battle/answer", headers=guest_h,
                               json={"code": code, "q_index": i,
                                     "answer": correct[i], "time_ms": 2000})
            assert r2.status_code == 200

        # final state
        rst2 = requests.get(f"{API}/battle/{code}", headers=host_h)
        assert rst2.status_code == 200
        final = rst2.json()
        assert final["status"] == "finished"
        players = final["players"]
        # guest should be first
        assert players[0]["user_id"] == guest_uid
        assert players[0]["score"] == 5
        assert players[1]["user_id"] == host_uid
        assert players[1]["score"] == 0

    def test_join_invalid_code(self, session, auth):
        r = requests.post(f"{API}/battle/join", headers=auth, json={"code": "ZZZZZZ"})
        assert r.status_code == 404


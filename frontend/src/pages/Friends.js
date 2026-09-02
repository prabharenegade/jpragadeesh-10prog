import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Users, Search, UserPlus, Check, Mail } from "lucide-react";

export default function Friends() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [searching, setSearching] = useState(false);

  const load = async () => {
    const [f, r] = await Promise.all([api.get("/friends"), api.get("/friends/requests")]);
    setFriends(f.data); setRequests(r.data);
  };
  useEffect(() => { load(); }, []);

  const search = async () => {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const res = await api.post("/friends/search", { query: q });
      setResults(res.data);
      if (res.data.length === 0) toast.info("No users found");
    } catch (e) { toast.error("Search failed"); }
    finally { setSearching(false); }
  };

  const sendReq = async (id) => {
    await api.post("/friends/request", { target_user_id: id });
    toast.success("Friend request sent");
  };

  const accept = async (id) => {
    await api.post("/friends/accept", { target_user_id: id });
    toast.success("Friend added!");
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Users className="w-7 h-7 text-cyan-400" />
        <h1 className="font-display text-2xl lg:text-3xl font-bold">Friends</h1>
      </div>

      {/* search */}
      <div className="glass rounded-2xl p-6">
        <h3 className="font-display text-lg font-semibold mb-4">Find friends by email, mobile or name</h3>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              data-testid="friend-search-input"
              placeholder="e.g. 9876543210 or name@email.com"
              className="w-full bg-slate-900/70 border border-slate-700 rounded-xl pl-11 pr-4 py-3 text-sm outline-none focus:border-indigo-500 text-slate-200" />
          </div>
          <button onClick={search} disabled={searching} data-testid="friend-search-btn"
            className="bg-indigo-500 hover:bg-indigo-600 px-6 rounded-xl font-semibold transition-colors active:scale-95 disabled:opacity-50">
            Search
          </button>
        </div>
        {results.length > 0 && (
          <div className="mt-4 space-y-2" data-testid="search-results">
            {results.map((u) => (
              <div key={u.user_id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                {u.picture ? <img src={u.picture} className="w-9 h-9 rounded-full object-cover" alt="" />
                  : <div className="w-9 h-9 rounded-full bg-indigo-500/30 flex items-center justify-center font-bold">{u.name[0]}</div>}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{u.name}</p>
                  <p className="text-xs text-slate-500 truncate">{u.email}</p>
                </div>
                <button onClick={() => sendReq(u.user_id)} data-testid={`add-friend-${u.user_id}`}
                  className="flex items-center gap-1.5 text-sm bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 px-3 py-2 rounded-lg transition-colors">
                  <UserPlus className="w-4 h-4" /> Add
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* requests */}
        <div className="glass rounded-2xl p-6" data-testid="friend-requests">
          <h3 className="font-display text-lg font-semibold mb-4">Requests</h3>
          {requests.length === 0 ? <p className="text-sm text-slate-500">No pending requests.</p> : (
            <div className="space-y-2">
              {requests.map((r) => (
                <div key={r.from} className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                  {r.picture ? <img src={r.picture} className="w-9 h-9 rounded-full object-cover" alt="" />
                    : <div className="w-9 h-9 rounded-full bg-indigo-500/30 flex items-center justify-center font-bold">{r.name[0]}</div>}
                  <span className="text-sm flex-1 truncate">{r.name}</span>
                  <button onClick={() => accept(r.from)} data-testid={`accept-friend-${r.from}`}
                    className="flex items-center gap-1.5 text-sm bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 px-3 py-2 rounded-lg transition-colors">
                    <Check className="w-4 h-4" /> Accept
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* friends */}
        <div className="glass rounded-2xl p-6" data-testid="friends-list">
          <h3 className="font-display text-lg font-semibold mb-4">My Friends ({friends.length})</h3>
          {friends.length === 0 ? <p className="text-sm text-slate-500">No friends yet. Search and add some!</p> : (
            <div className="space-y-2">
              {friends.map((f) => (
                <div key={f.user_id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                  {f.picture ? <img src={f.picture} className="w-9 h-9 rounded-full object-cover" alt="" />
                    : <div className="w-9 h-9 rounded-full bg-cyan-500/30 flex items-center justify-center font-bold">{f.name[0]}</div>}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{f.name}</p>
                    <p className="text-xs text-slate-500 flex items-center gap-1 truncate"><Mail className="w-3 h-3" />{f.email}</p>
                  </div>
                  <span className="text-sm font-bold text-amber-400">{f.xp} XP</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

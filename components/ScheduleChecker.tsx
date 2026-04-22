"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import styles from "./ScheduleChecker.module.css";

const CLIENT_ID = "258100577056-aqs0c8aopdse7o1fd67ds1f64hmqr3to.apps.googleusercontent.com";
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/directory.readonly",
].join(" ");

type BusyPeriod = { start: Date; end: Date };
type BusyMap = Record<string, BusyPeriod[]>;
type FreeSlot = { start: Date; end: Date };
type Contact = { name: string; email: string };

declare global {
  interface Window {
    google: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: (opts: { prompt: string }) => void };
          revoke: (token: string, callback: () => void) => void;
        };
      };
    };
  }
}

function formatDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function calcFreeSlots(
  busyMap: BusyMap,
  startDate: string,
  endDate: string,
  workStart: string,
  workEnd: string,
  minDuration: number
): FreeSlot[] {
  const [wsH, wsM] = workStart.split(":").map(Number);
  const [weH, weM] = workEnd.split(":").map(Number);
  const minMs = minDuration * 60 * 1000;
  const freeSlots: FreeSlot[] = [];

  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dayStart = new Date(d);
    dayStart.setHours(wsH, wsM, 0, 0);
    const dayEnd = new Date(d);
    dayEnd.setHours(weH, weM, 0, 0);
    if (dayStart >= dayEnd) continue;

    const allBusy: BusyPeriod[] = [];
    for (const busy of Object.values(busyMap)) {
      for (const b of busy) {
        if (b.end > dayStart && b.start < dayEnd) {
          allBusy.push({
            start: b.start < dayStart ? dayStart : b.start,
            end: b.end > dayEnd ? dayEnd : b.end,
          });
        }
      }
    }

    allBusy.sort((a, b) => a.start.getTime() - b.start.getTime());
    const merged: BusyPeriod[] = [];
    for (const b of allBusy) {
      if (merged.length === 0 || b.start > merged[merged.length - 1].end) {
        merged.push({ start: new Date(b.start), end: new Date(b.end) });
      } else {
        const last = merged[merged.length - 1];
        last.end = new Date(Math.max(last.end.getTime(), b.end.getTime()));
      }
    }

    let cursor = new Date(dayStart);
    for (const b of merged) {
      if (b.start > cursor) {
        if (b.start.getTime() - cursor.getTime() >= minMs) {
          freeSlots.push({ start: new Date(cursor), end: new Date(b.start) });
        }
      }
      cursor = new Date(Math.max(cursor.getTime(), b.end.getTime()));
    }
    if (cursor < dayEnd && dayEnd.getTime() - cursor.getTime() >= minMs) {
      freeSlots.push({ start: new Date(cursor), end: new Date(dayEnd) });
    }
  }

  return freeSlots;
}

function formatDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}時間${m}分` : `${h}時間`;
  }
  return `${min}分`;
}

// ============================================================
// ContactPicker コンポーネント
// ============================================================
function ContactPicker({
  contacts,
  selected,
  onChange,
}: {
  contacts: Contact[];
  selected: Contact[];
  onChange: (contacts: Contact[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = contacts.filter((c) => {
    if (selected.some((s) => s.email === c.email)) return false;
    const q = query.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
  });

  function select(c: Contact) {
    onChange([...selected, c]);
    setQuery("");
  }

  function remove(email: string) {
    onChange(selected.filter((c) => c.email !== email));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && isValidEmail(query) && !selected.some((s) => s.email === query)) {
      onChange([...selected, { name: query, email: query }]);
      setQuery("");
      setOpen(false);
    }
  }

  return (
    <div ref={wrapperRef} className={styles.pickerWrapper}>
      {selected.length > 0 && (
        <div className={styles.chips}>
          {selected.map((c) => (
            <span key={c.email} className={styles.chip}>
              {c.name !== c.email ? c.name : c.email}
              <button className={styles.chipRemove} onClick={() => remove(c.email)} aria-label="削除">×</button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        className={styles.input}
        placeholder="名前またはメールアドレスで検索..."
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {open && (filtered.length > 0 || (query && isValidEmail(query))) && (
        <div className={styles.dropdown}>
          {filtered.slice(0, 8).map((c) => (
            <button key={c.email} className={styles.dropdownItem} onMouseDown={() => select(c)}>
              <span className={styles.dropdownName}>{c.name}</span>
              <span className={styles.dropdownEmail}>{c.email}</span>
            </button>
          ))}
          {query && isValidEmail(query) && !contacts.some((c) => c.email === query) && (
            <button
              className={styles.dropdownItem}
              onMouseDown={() => { onChange([...selected, { name: query, email: query }]); setQuery(""); setOpen(false); }}
            >
              <span className={styles.dropdownName}>追加</span>
              <span className={styles.dropdownEmail}>{query}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// EventModal コンポーネント
// ============================================================
function EventModal({
  slot,
  attendees,
  accessToken,
  onClose,
}: {
  slot: FreeSlot;
  attendees: string[];
  accessToken: string;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const dateOpts: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric", weekday: "short" };
  const timeOpts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };

  async function create() {
    if (!title.trim()) { setErr("タイトルを入力してください。"); return; }
    setErr("");
    setCreating(true);
    try {
      const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: title.trim(),
          start: { dateTime: slot.start.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
          end: { dateTime: slot.end.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
          attendees: attendees.map((email) => ({ email })),
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e?.error?.message || `HTTPエラー ${res.status}`);
      }
      setDone(true);
    } catch (e) {
      setErr("作成失敗: " + (e instanceof Error ? e.message : "不明なエラー"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>予定を作成</span>
          <button className={styles.modalClose} onClick={onClose}>×</button>
        </div>

        {done ? (
          <div className={styles.modalDone}>
            <div className={styles.modalDoneIcon}>✓</div>
            <div>Googleカレンダーに追加しました</div>
            <button className={styles.btnSearch} onClick={onClose} style={{ marginTop: 16 }}>閉じる</button>
          </div>
        ) : (
          <>
            <div className={styles.modalSlotInfo}>
              <div>{slot.start.toLocaleDateString("ja-JP", dateOpts)}</div>
              <div className={styles.slotTime}>
                {slot.start.toLocaleTimeString("ja-JP", timeOpts)} 〜 {slot.end.toLocaleTimeString("ja-JP", timeOpts)}
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label}>タイトル</label>
              <input
                type="text"
                className={styles.input}
                placeholder="例: 定例ミーティング"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && create()}
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label}>参加者</label>
              <div className={styles.attendeeList}>
                {attendees.map((a) => (
                  <span key={a} className={styles.chip}>{a}</span>
                ))}
              </div>
            </div>

            {err && <div className={styles.errorMsg}>{err}</div>}

            <button className={styles.btnSearch} onClick={create} disabled={creating}>
              {creating ? "作成中..." : "カレンダーに追加"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// メインコンポーネント
// ============================================================
export default function ScheduleChecker() {
  const tokenClientRef = useRef<{ requestAccessToken: (opts: { prompt: string }) => void } | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [includeSelf, setIncludeSelf] = useState(true);
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [workStart, setWorkStart] = useState("09:00");
  const [workEnd, setWorkEnd] = useState("18:00");
  const [minDuration, setMinDuration] = useState("60");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [freeSlots, setFreeSlots] = useState<FreeSlot[] | null>(null);
  const [eventModal, setEventModal] = useState<FreeSlot | null>(null);

  useEffect(() => {
    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);
    setStartDate(formatDateInput(today));
    setEndDate(formatDateInput(nextWeek));

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: onTokenReceived,
      });
    };
    document.body.appendChild(script);
  }, []);

  const fetchContacts = useCallback(async (token: string) => {
    const results: Contact[] = [];

    // 個人の連絡先
    try {
      const res = await fetch(
        "https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses&pageSize=1000",
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        for (const p of data.connections || []) {
          const email = p.emailAddresses?.[0]?.value;
          const name = p.names?.[0]?.displayName || email;
          if (email) results.push({ name, email });
        }
      }
    } catch { /* 無視 */ }

    // 組織ディレクトリ（Google Workspace）
    try {
      const res = await fetch(
        "https://people.googleapis.com/v1/people:listDirectoryPeople?readMask=names,emailAddresses&sources=DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE&pageSize=1000",
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        for (const p of data.people || []) {
          const email = p.emailAddresses?.[0]?.value;
          const name = p.names?.[0]?.displayName || email;
          if (email && !results.some((r) => r.email === email)) {
            results.push({ name, email });
          }
        }
      }
    } catch { /* 無視 */ }

    results.sort((a, b) => a.name.localeCompare(b.name, "ja"));
    setContacts(results);
  }, []);

  function onTokenReceived(response: { access_token?: string; error?: string }) {
    if (response.error || !response.access_token) {
      setError("認証に失敗しました: " + response.error);
      return;
    }
    const token = response.access_token;
    setAccessToken(token);

    fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((info) => setUserEmail(info.email || ""));

    fetchContacts(token);
  }

  function signIn() {
    tokenClientRef.current?.requestAccessToken({ prompt: "consent" });
  }

  function signOut() {
    if (accessToken) window.google.accounts.oauth2.revoke(accessToken, () => {});
    setAccessToken(null);
    setUserEmail("");
    setContacts([]);
    setSelectedContacts([]);
    setFreeSlots(null);
    setError("");
  }

  async function searchFreeSlots() {
    setError("");
    setFreeSlots(null);

    const targetEmails = [
      ...(includeSelf && userEmail ? [userEmail] : []),
      ...selectedContacts.map((c) => c.email),
    ];

    if (targetEmails.length === 0) {
      setError("少なくとも1人を選択してください。");
      return;
    }
    if (!startDate || !endDate) { setError("検索期間を入力してください。"); return; }
    if (startDate > endDate) { setError("終了日は開始日以降の日付を指定してください。"); return; }

    setLoading(true);
    try {
      const timeMin = new Date(startDate + "T00:00:00").toISOString();
      const endDt = new Date(endDate);
      endDt.setDate(endDt.getDate() + 1);
      const timeMax = endDt.toISOString();

      const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          timeMin,
          timeMax,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          items: targetEmails.map((id) => ({ id })),
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err?.error?.message || `HTTPエラー ${response.status}`);
      }

      const data = await response.json();
      const busyMap: BusyMap = {};
      for (const [email, calData] of Object.entries(data.calendars as Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }>)) {
        busyMap[email] = ((calData.busy || []) as { start: string; end: string }[]).map((b) => ({
          start: new Date(b.start),
          end: new Date(b.end),
        }));
      }

      setFreeSlots(calcFreeSlots(busyMap, startDate, endDate, workStart, workEnd, parseInt(minDuration, 10)));
    } catch (err) {
      setError("APIエラー: " + (err instanceof Error ? err.message : "不明なエラー"));
    } finally {
      setLoading(false);
    }
  }

  const dateOpts: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric", weekday: "short" };
  const timeOpts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };

  const attendees = [
    ...(includeSelf && userEmail ? [userEmail] : []),
    ...selectedContacts.map((c) => c.email),
  ];

  if (!accessToken) {
    return (
      <div className={styles.authWrapper}>
        <div className={styles.authCard}>
          <div className={styles.authTitle}>空き時間チェッカー</div>
          <p className={styles.authDesc}>
            複数人のGoogleカレンダーを参照し、<br />
            共通の空き時間を自動で見つけます。
          </p>
          <button className={styles.btnGoogle} onClick={signIn}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" />
              <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z" />
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
            </svg>
            Googleでサインイン
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <span className={styles.headerTitle}>空き時間チェッカー</span>
        <div className={styles.userBar}>
          <span className={styles.userEmail}>{userEmail}</span>
          <button className={styles.btnSignout} onClick={signOut}>サインアウト</button>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>検索条件</h2>

          <div className={styles.fieldGroup}>
            <label className={styles.label}>自分のカレンダー</label>
            <div className={styles.radioGroup}>
              <label className={styles.radioLabel}>
                <input type="radio" name="includeSelf" className={styles.radio} checked={includeSelf} onChange={() => setIncludeSelf(true)} />
                含める（{userEmail}）
              </label>
              <label className={styles.radioLabel}>
                <input type="radio" name="includeSelf" className={styles.radio} checked={!includeSelf} onChange={() => setIncludeSelf(false)} />
                含めない
              </label>
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label}>対象者</label>
            <ContactPicker
              contacts={contacts}
              selected={selectedContacts}
              onChange={setSelectedContacts}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label}>検索期間</label>
            <div className={styles.dateRange}>
              <input type="date" className={styles.input} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <input type="date" className={styles.input} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className={styles.inlineFields}>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>稼働時間帯</label>
              <div className={styles.timeRange}>
                <select className={styles.select} value={workStart} onChange={(e) => setWorkStart(e.target.value)}>
                  <option value="08:00">08:00</option>
                  <option value="09:00">09:00</option>
                  <option value="10:00">10:00</option>
                  <option value="11:00">11:00</option>
                </select>
                <select className={styles.select} value={workEnd} onChange={(e) => setWorkEnd(e.target.value)}>
                  <option value="17:00">17:00</option>
                  <option value="18:00">18:00</option>
                  <option value="19:00">19:00</option>
                  <option value="20:00">20:00</option>
                  <option value="21:00">21:00</option>
                </select>
              </div>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>最低空き時間</label>
              <select className={styles.select} value={minDuration} onChange={(e) => setMinDuration(e.target.value)}>
                <option value="30">30分以上</option>
                <option value="60">1時間以上</option>
                <option value="90">1.5時間以上</option>
                <option value="120">2時間以上</option>
              </select>
            </div>
          </div>

          {error && <div className={styles.errorMsg}>{error}</div>}

          <button className={styles.btnSearch} onClick={searchFreeSlots} disabled={loading}>
            {loading ? "検索中..." : "空き時間を検索"}
          </button>
        </section>

        {(loading || freeSlots !== null) && (
          <section className={styles.card}>
            <div className={styles.resultsHeader}>
              <h2 className={styles.cardTitle} style={{ marginBottom: 0 }}>共通の空き時間</h2>
              {!loading && freeSlots !== null && (
                <span className={styles.badge}>{freeSlots.length}件</span>
              )}
            </div>

            {loading && (
              <div className={styles.loadingState}>
                <div className={styles.spinner} />
                <span>空き時間を検索中...</span>
              </div>
            )}

            {!loading && freeSlots !== null && freeSlots.length === 0 && (
              <div className={styles.emptyState}>
                指定期間内に共通の空き時間が見つかりませんでした。<br />
                期間や稼働時間を変えて試してみてください。
              </div>
            )}

            {!loading && freeSlots !== null && freeSlots.length > 0 && (
              <div className={styles.slotList}>
                {freeSlots.map((slot, i) => (
                  <div key={i} className={styles.slotItem}>
                    <span className={styles.slotNumber}>{i + 1}</span>
                    <div className={styles.slotInfo}>
                      <div className={styles.slotDate}>{slot.start.toLocaleDateString("ja-JP", dateOpts)}</div>
                      <div className={styles.slotTime}>
                        {slot.start.toLocaleTimeString("ja-JP", timeOpts)} 〜 {slot.end.toLocaleTimeString("ja-JP", timeOpts)}
                      </div>
                    </div>
                    <span className={styles.slotDuration}>{formatDuration(slot.end.getTime() - slot.start.getTime())}</span>
                    <button className={styles.btnCreateEvent} onClick={() => setEventModal(slot)}>
                      予定を作成
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {eventModal && (
        <EventModal
          slot={eventModal}
          attendees={attendees}
          accessToken={accessToken}
          onClose={() => setEventModal(null)}
        />
      )}
    </div>
  );
}

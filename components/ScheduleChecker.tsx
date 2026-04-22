"use client";

import { useEffect, useState, useRef } from "react";
import styles from "./ScheduleChecker.module.css";

const CLIENT_ID = "258100577056-aqs0c8aopdse7o1fd67ds1f64hmqr3to.apps.googleusercontent.com";
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

const MEMBERS_KEY = "schedule_checker_members";
const ORG_DOMAIN = "mediaaid.co.jp";

type BusyPeriod = { start: Date; end: Date };
type BusyMap = Record<string, BusyPeriod[]>;
type FreeSlot = { start: Date; end: Date };
type Member = { id: string; email: string };

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

// ============================================================
// ユーティリティ
// ============================================================
function toTimeInput(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function applyTime(base: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
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

function formatDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}時間${m}分` : `${h}時間`;
  }
  return `${min}分`;
}

function calcFreeSlots(
  busyMap: BusyMap,
  startDate: string,
  endDate: string,
  workStart: string,
  workEnd: string,
  minDuration: number,
  excludeWeekends: boolean
): FreeSlot[] {
  const [wsH, wsM] = workStart.split(":").map(Number);
  const [weH, weM] = workEnd.split(":").map(Number);
  const minMs = minDuration * 60 * 1000;
  const freeSlots: FreeSlot[] = [];

  for (let d = new Date(startDate); d <= new Date(endDate); d.setDate(d.getDate() + 1)) {
    if (excludeWeekends && (d.getDay() === 0 || d.getDay() === 6)) continue;
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
        merged[merged.length - 1].end = new Date(Math.max(merged[merged.length - 1].end.getTime(), b.end.getTime()));
      }
    }

    let cursor = new Date(dayStart);
    for (const b of merged) {
      if (b.start > cursor && b.start.getTime() - cursor.getTime() >= minMs) {
        freeSlots.push({ start: new Date(cursor), end: new Date(b.start) });
      }
      cursor = new Date(Math.max(cursor.getTime(), b.end.getTime()));
    }
    if (cursor < dayEnd && dayEnd.getTime() - cursor.getTime() >= minMs) {
      freeSlots.push({ start: new Date(cursor), end: new Date(dayEnd) });
    }
  }
  return freeSlots;
}

// ============================================================
// useMembers — localStorageでメンバー管理
// ============================================================
function useMembers() {
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(MEMBERS_KEY);
      if (saved) setMembers(JSON.parse(saved));
    } catch { /* 無視 */ }
  }, []);

  function save(updated: Member[]) {
    setMembers(updated);
    localStorage.setItem(MEMBERS_KEY, JSON.stringify(updated));
  }

  function addMember(email: string) {
    save([...members, { id: crypto.randomUUID(), email }]);
  }

  function removeMember(id: string) {
    save(members.filter((m) => m.id !== id));
  }

  return { members, addMember, removeMember };
}

// ============================================================
// MemberManager — メンバー管理モーダル
// ============================================================
function MemberManager({
  members,
  onAdd,
  onRemove,
  onClose,
}: {
  members: Member[];
  onAdd: (email: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const [orgMode, setOrgMode] = useState<"internal" | "external">("internal");
  const [input, setInput] = useState("");
  const [err, setErr] = useState("");
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resolveEmail(raw: string): string {
    if (orgMode === "internal") return `${raw}@${ORG_DOMAIN}`;
    return raw;
  }

  function handleAdd() {
    const email = resolveEmail(input.trim());
    if (!isValidEmail(email)) { setErr("メールアドレスの形式が正しくありません。"); return; }
    if (members.some((m) => m.email === email)) { setErr("すでに登録されています。"); return; }
    onAdd(email);
    setInput("");
    setErr("");
    setImportResult(null);
  }

  function handleCSV(text: string) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let added = 0;
    let skipped = 0;
    for (const line of lines) {
      const email = resolveEmail(line);
      if (!isValidEmail(email) || members.some((m) => m.email === email)) {
        skipped++;
        continue;
      }
      onAdd(email);
      added++;
    }
    setImportResult(`${added}件追加${skipped > 0 ? `、${skipped}件スキップ` : ""}`);
    setErr("");
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => handleCSV((ev.target?.result as string) ?? "");
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div className={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>メンバー管理</span>
          <button className={styles.modalClose} onClick={onClose}>×</button>
        </div>

        {/* 組織トグル */}
        <div className={styles.modalModeToggle}>
          <button
            className={`${styles.modeBtn} ${orgMode === "internal" ? styles.modeBtnActive : ""}`}
            onClick={() => { setOrgMode("internal"); setInput(""); setErr(""); setImportResult(null); }}
          >組織内（{ORG_DOMAIN}）</button>
          <button
            className={`${styles.modeBtn} ${orgMode === "external" ? styles.modeBtnActive : ""}`}
            onClick={() => { setOrgMode("external"); setInput(""); setErr(""); setImportResult(null); }}
          >組織外</button>
        </div>

        {/* 追加フォーム */}
        <div className={styles.memberForm}>
          {orgMode === "internal" ? (
            <div className={styles.memberInputInline}>
              <input
                type="text"
                className={styles.input}
                placeholder="yuki.kusama"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
              <span className={styles.orgDomainSuffix}>@{ORG_DOMAIN}</span>
            </div>
          ) : (
            <input
              type="email"
              className={styles.input}
              placeholder="メールアドレス"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
          )}
          <button className={styles.btnAddMember} onClick={handleAdd}>追加</button>
        </div>
        {err && <div className={styles.errorMsg}>{err}</div>}

        {/* CSVインポート */}
        <div className={styles.csvImport}>
          <input ref={fileInputRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={handleFileChange} />
          <button className={styles.btnCsvImport} onClick={() => fileInputRef.current?.click()}>
            CSVから一括インポート
          </button>
          <span className={styles.csvHint}>
            {orgMode === "internal" ? "1行1username（@なし）" : "1行1メールアドレス"}
          </span>
          {importResult && <span className={styles.importResult}>{importResult}</span>}
        </div>

        {/* メンバー一覧 */}
        <div className={styles.memberList}>
          {members.length === 0 && (
            <div className={styles.dropdownEmpty}>まだメンバーが登録されていません</div>
          )}
          {members.map((m) => (
            <div key={m.id} className={styles.memberItem}>
              <div className={styles.memberInfo}>
                <span className={styles.memberEmail}>{m.email}</span>
              </div>
              <button className={styles.btnRemove} onClick={() => onRemove(m.id)} aria-label="削除">×</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ContactPicker — メンバーから選択するプルダウン
// ============================================================
function ContactPicker({
  members,
  selected,
  onChange,
  onOpenMemberManager,
}: {
  members: Member[];
  selected: Member[];
  onChange: (members: Member[]) => void;
  onOpenMemberManager: () => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = members.filter((m) => {
    if (selected.some((s) => s.id === m.id)) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return m.email.toLowerCase().includes(q);
  });

  function toggleOpen() {
    if (!open) setTimeout(() => searchRef.current?.focus(), 0);
    setOpen((prev) => !prev);
    setQuery("");
  }

  function select(m: Member) {
    onChange([...selected, m]);
    setQuery("");
    searchRef.current?.focus();
  }

  function remove(id: string) {
    onChange(selected.filter((m) => m.id !== id));
  }

  return (
    <div ref={wrapperRef} className={styles.pickerWrapper}>
      <button type="button" className={styles.pickerTrigger} onClick={toggleOpen}>
        <span className={styles.pickerTriggerLabel}>
          {selected.length === 0 ? "対象者を選択..." : `${selected.length}人選択中`}
        </span>
        <svg className={`${styles.pickerChevron} ${open ? styles.pickerChevronOpen : ""}`} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path fill="currentColor" d="M6 8L1 3h10z" />
        </svg>
      </button>

      {selected.length > 0 && (
        <div className={styles.chips}>
          {selected.map((m) => (
            <span key={m.id} className={styles.chip}>
              {m.email}
              <button className={styles.chipRemove} onClick={() => remove(m.id)} aria-label="削除">×</button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownSearch}>
            <input
              ref={searchRef}
              type="text"
              className={styles.dropdownSearchInput}
              placeholder="検索..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className={styles.dropdownList}>
            {members.length === 0 && (
              <div className={styles.dropdownEmptyWithAction}>
                <span>まだメンバーが登録されていません</span>
                <button
                  className={styles.btnAddMemberInline}
                  onMouseDown={(e) => { e.preventDefault(); setOpen(false); onOpenMemberManager(); }}
                >＋ メンバーを追加</button>
              </div>
            )}
            {members.length > 0 && filtered.length === 0 && query && (
              <div className={styles.dropdownEmpty}>一致するメンバーがいません</div>
            )}
            {filtered.map((m) => (
              <button key={m.id} className={styles.dropdownItem} onMouseDown={() => select(m)}>
                <span className={styles.dropdownEmail}>{m.email}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// EventModal — 予定作成モーダル（一括・個別タイトル対応）
// ============================================================
function EventModal({
  slots,
  attendees,
  accessToken,
  minDuration,
  organizerEmail,
  onClose,
}: {
  slots: FreeSlot[];
  attendees: string[];
  accessToken: string;
  minDuration: number;
  organizerEmail: string;
  onClose: () => void;
}) {
  const isSingle = slots.length === 1;
  const [mode, setMode] = useState<"common" | "individual">("common");
  const [commonTitle, setCommonTitle] = useState("");
  const [commonDuration, setCommonDuration] = useState(String(minDuration));
  const [individualTitles, setIndividualTitles] = useState<string[]>(() => slots.map(() => ""));
  const [individualStartTimes, setIndividualStartTimes] = useState<string[]>(() =>
    slots.map((slot) => toTimeInput(slot.start))
  );
  const [individualEndTimes, setIndividualEndTimes] = useState<string[]>(() =>
    slots.map((slot) => {
      const defaultEnd = new Date(slot.start.getTime() + minDuration * 60 * 1000);
      return toTimeInput(defaultEnd > slot.end ? slot.end : defaultEnd);
    })
  );
  const [creating, setCreating] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const dateOpts: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric", weekday: "short" };
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const minMs = minDuration * 60 * 1000;

  const effectiveMode = isSingle ? "individual" : mode;

  function computeEvents(): { start: Date; end: Date }[] {
    if (effectiveMode === "common") {
      return slots.map((slot) => ({
        start: slot.start,
        end: new Date(slot.start.getTime() + Number(commonDuration) * 60 * 1000),
      }));
    }
    return slots.map((slot, i) => ({
      start: applyTime(slot.start, individualStartTimes[i]),
      end: applyTime(slot.start, individualEndTimes[i]),
    }));
  }

  async function create() {
    const titles = effectiveMode === "common"
      ? slots.map(() => commonTitle.trim())
      : individualTitles.map((t) => t.trim());

    if (titles.some((t) => !t)) { setErr("すべてのタイトルを入力してください。"); return; }

    const events = computeEvents();

    for (let i = 0; i < events.length; i++) {
      const { start, end } = events[i];
      const slot = slots[i];
      if (end <= start) { setErr("終了時刻は開始時刻より後にしてください。"); return; }
      if (end.getTime() - start.getTime() > slot.end.getTime() - slot.start.getTime()) {
        setErr("予定の時間が空き枠を超えています。"); return;
      }
    }

    setErr("");
    setCreating(true);
    try {
      await Promise.all(events.map(({ start, end }, i) =>
        fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            summary: titles[i],
            start: { dateTime: start.toISOString(), timeZone: tz },
            end: { dateTime: end.toISOString(), timeZone: tz },
            attendees: attendees.map((email) =>
              email === organizerEmail
                ? { email, responseStatus: "accepted" }
                : { email }
            ),
          }),
        }).then(async (res) => {
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data?.error?.message || `HTTPエラー ${res.status}`);
          }
          console.log("[EventCreate] attendees in response:", data.attendees);
        })
      ));
      setDone(true);
    } catch (e) {
      setErr("作成失敗: " + (e instanceof Error ? e.message : "不明なエラー"));
    } finally {
      setCreating(false);
    }
  }

  function renderIndividualItem(slot: FreeSlot, i: number) {
    const canEditStart = slot.end.getTime() - slot.start.getTime() > minMs;
    return (
      <div key={i} className={styles.individualItem}>
        <div className={styles.individualSlotInfo}>
          <span>{slot.start.toLocaleDateString("ja-JP", dateOpts)}</span>
          <span className={styles.slotTime}>
            {canEditStart ? (
              <input
                type="time"
                className={styles.timeInput}
                value={individualStartTimes[i]}
                min={toTimeInput(slot.start)}
                max={individualEndTimes[i]}
                onChange={(e) => {
                  const updated = [...individualStartTimes];
                  updated[i] = e.target.value;
                  setIndividualStartTimes(updated);
                }}
              />
            ) : (
              toTimeInput(slot.start)
            )}
            {" 〜 "}
            <input
              type="time"
              className={styles.timeInput}
              value={individualEndTimes[i]}
              min={toTimeInput(new Date(slot.start.getTime() + 15 * 60 * 1000))}
              max={toTimeInput(slot.end)}
              onChange={(e) => {
                const updated = [...individualEndTimes];
                updated[i] = e.target.value;
                setIndividualEndTimes(updated);
              }}
            />
          </span>
        </div>
        <input
          type="text"
          className={styles.input}
          placeholder="タイトル"
          value={individualTitles[i]}
          autoFocus={i === 0}
          onChange={(e) => {
            const updated = [...individualTitles];
            updated[i] = e.target.value;
            setIndividualTitles(updated);
          }}
          onKeyDown={(e) => e.key === "Enter" && create()}
        />
      </div>
    );
  }

  return (
    <div className={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>予定を作成{!isSingle && `（${slots.length}件）`}</span>
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
            {!isSingle && (
              <div className={styles.modalModeToggle}>
                <button
                  className={`${styles.modeBtn} ${mode === "common" ? styles.modeBtnActive : ""}`}
                  onClick={() => setMode("common")}
                >共通タイトル</button>
                <button
                  className={`${styles.modeBtn} ${mode === "individual" ? styles.modeBtnActive : ""}`}
                  onClick={() => setMode("individual")}
                >個別タイトル</button>
              </div>
            )}

            {effectiveMode === "common" ? (
              <>
                <div className={styles.fieldGroup}>
                  <label className={styles.label}>タイトル（全件共通）</label>
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="例: 定例ミーティング"
                    value={commonTitle}
                    onChange={(e) => setCommonTitle(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && create()}
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.label}>所要時間（全件共通）</label>
                  <select className={styles.select} value={commonDuration} onChange={(e) => setCommonDuration(e.target.value)}>
                    <option value="30">30分</option>
                    <option value="60">1時間</option>
                    <option value="90">1時間30分</option>
                    <option value="120">2時間</option>
                  </select>
                </div>
              </>
            ) : (
              <div className={styles.individualList}>
                {slots.map((slot, i) => renderIndividualItem(slot, i))}
              </div>
            )}

            <div className={styles.fieldGroup}>
              <label className={styles.label}>参加者</label>
              <div className={styles.attendeeList}>
                {attendees.map((a) => <span key={a} className={styles.chip}>{a}</span>)}
              </div>
            </div>
            {err && <div className={styles.errorMsg}>{err}</div>}
            <button className={styles.btnSearch} onClick={create} disabled={creating}>
              {creating ? "作成中..." : isSingle ? "カレンダーに追加" : `${slots.length}件をカレンダーに追加`}
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
  const [autoLoginPending, setAutoLoginPending] = useState(true);
  const { members, addMember, removeMember } = useMembers();
  const [showMemberManager, setShowMemberManager] = useState(false);
  const [includeSelf, setIncludeSelf] = useState(true);
  const [selectedMembers, setSelectedMembers] = useState<Member[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [workStart, setWorkStart] = useState("09:00");
  const [workEnd, setWorkEnd] = useState("18:00");
  const [minDuration, setMinDuration] = useState("60");
  const [excludeWeekends, setExcludeWeekends] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [freeSlots, setFreeSlots] = useState<FreeSlot[] | null>(null);
  const [checkedSlots, setCheckedSlots] = useState<number[]>([]);
  const [showEventModal, setShowEventModal] = useState(false);

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
        callback: (response) => {
          onTokenReceived(response);
          setAutoLoginPending(false);
        },
      });
      // 一度ログインしたことがあれば自動でトークンを取得（ポップアップなし）
      tokenClientRef.current.requestAccessToken({ prompt: "" });
    };
    document.body.appendChild(script);
  }, []);

  function onTokenReceived(response: { access_token?: string; error?: string }) {
    if (response.error || !response.access_token) {
      // サイレントログイン失敗は無視（手動ログインへフォールバック）
      return;
    }
    const token = response.access_token;
    setAccessToken(token);
    fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((info) => setUserEmail(info.email || ""));
  }

  function signIn() {
    tokenClientRef.current?.requestAccessToken({ prompt: "select_account" });
  }

  function signOut() {
    if (accessToken) window.google.accounts.oauth2.revoke(accessToken, () => {});
    setAccessToken(null);
    setUserEmail("");
    setSelectedMembers([]);
    setFreeSlots(null);
    setError("");
  }

  async function searchFreeSlots() {
    setError("");
    setFreeSlots(null);
    setCheckedSlots([]);

    // 自分のカレンダーは "primary" で問い合わせる（メールアドレス指定より確実）
    const freeBusyItems: { id: string }[] = [
      ...(includeSelf ? [{ id: "primary" }] : []),
      ...selectedMembers.map((m) => ({ id: m.email })),
    ];
    if (freeBusyItems.length === 0) { setError("少なくとも1人を選択してください。"); return; }
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
          items: freeBusyItems,
        }),
      });

      if (!response.ok) {
        const e = await response.json();
        throw new Error(e?.error?.message || `HTTPエラー ${response.status}`);
      }

      const data = await response.json();
      const busyMap: BusyMap = {};
      for (const [email, calData] of Object.entries(data.calendars as Record<string, { busy?: { start: string; end: string }[] }>)) {
        busyMap[email] = ((calData.busy || []) as { start: string; end: string }[]).map((b) => ({
          start: new Date(b.start),
          end: new Date(b.end),
        }));
      }

      setFreeSlots(calcFreeSlots(busyMap, startDate, endDate, workStart, workEnd, parseInt(minDuration, 10), excludeWeekends));
    } catch (e) {
      setError("APIエラー: " + (e instanceof Error ? e.message : "不明なエラー"));
    } finally {
      setLoading(false);
    }
  }

  const dateOpts: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric", weekday: "short" };
  const timeOpts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  // FreeBusy検索対象（includeSelfの設定に従う）
  const attendees = [
    ...(includeSelf && userEmail ? [userEmail] : []),
    ...selectedMembers.map((m) => m.email),
  ];

  // イベント参加者（自分は常に主催者として含める）
  const eventAttendees = [
    ...(userEmail ? [userEmail] : []),
    ...selectedMembers.map((m) => m.email),
  ];

  if (!accessToken) {
    if (autoLoginPending) {
      return (
        <div className={styles.authWrapper}>
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
          </div>
        </div>
      );
    }
    return (
      <div className={styles.authWrapper}>
        <div className={styles.authCard}>
          <div className={styles.authTitle}>Sukima</div>
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
          {process.env.NODE_ENV === "development" && (
            <button
              className={styles.btnDevPreview}
              onClick={() => {
                setAccessToken("__dev__");
                setUserEmail("dev@example.com");
                setAutoLoginPending(false);
              }}
            >UIプレビュー（開発用）</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <span className={styles.headerTitle}>Sukima</span>
        <div className={styles.userBar}>
          <button className={styles.btnMemberManager} onClick={() => setShowMemberManager(true)}>
            メンバー管理
          </button>
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
            <ContactPicker members={members} selected={selectedMembers} onChange={setSelectedMembers} onOpenMemberManager={() => setShowMemberManager(true)} />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label}>検索期間</label>
            <div className={styles.dateRange}>
              <input type="date" className={styles.input} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <input type="date" className={styles.input} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label}>土日の扱い</label>
            <div className={styles.radioGroup}>
              <label className={styles.radioLabel}>
                <input type="radio" name="weekends" className={styles.radio} checked={excludeWeekends} onChange={() => setExcludeWeekends(true)} />
                除外する
              </label>
              <label className={styles.radioLabel}>
                <input type="radio" name="weekends" className={styles.radio} checked={!excludeWeekends} onChange={() => setExcludeWeekends(false)} />
                含める
              </label>
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
              {!loading && freeSlots !== null && <span className={styles.badge}>{freeSlots.length}件</span>}
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
              <>
                <div className={styles.slotList}>
                  {freeSlots.map((slot, i) => {
                    const checked = checkedSlots.includes(i);
                    return (
                      <label key={i} className={`${styles.slotItem} ${checked ? styles.slotItemChecked : ""}`}>
                        <input
                          type="checkbox"
                          className={styles.slotCheckbox}
                          checked={checked}
                          onChange={() => setCheckedSlots((prev) =>
                            checked ? prev.filter((n) => n !== i) : [...prev, i]
                          )}
                        />
                        <div className={styles.slotInfo}>
                          <div className={styles.slotDate}>{slot.start.toLocaleDateString("ja-JP", dateOpts)}</div>
                          <div className={styles.slotTime}>
                            {slot.start.toLocaleTimeString("ja-JP", timeOpts)} 〜 {slot.end.toLocaleTimeString("ja-JP", timeOpts)}
                          </div>
                        </div>
                        <span className={styles.slotDuration}>{formatDuration(slot.end.getTime() - slot.start.getTime())}</span>
                      </label>
                    );
                  })}
                </div>
                {checkedSlots.length > 0 && (
                  <button className={styles.btnSearch} onClick={() => setShowEventModal(true)} style={{ marginTop: 12 }}>
                    {checkedSlots.length}件の予定を作成
                  </button>
                )}
              </>
            )}
          </section>
        )}
      </main>

      {showMemberManager && (
        <MemberManager
          members={members}
          onAdd={addMember}
          onRemove={removeMember}
          onClose={() => setShowMemberManager(false)}
        />
      )}

      {showEventModal && freeSlots && (
        <EventModal
          slots={checkedSlots.map((i) => freeSlots[i])}
          attendees={eventAttendees}
          accessToken={accessToken}
          minDuration={parseInt(minDuration, 10)}
          organizerEmail={userEmail}
          onClose={() => setShowEventModal(false)}
        />
      )}
    </div>
  );
}

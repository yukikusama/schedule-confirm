// ============================================================
// 設定: GCPのクライアントIDをここに入力してください
// ============================================================
const CLIENT_ID = '258100577056-aqs0c8aopdse7o1fd67ds1f64hmqr3to.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/calendar.freebusy';

// ============================================================
// 状態管理
// ============================================================
let tokenClient = null;
let accessToken = null;
let currentUserEmail = '';

// ============================================================
// 初期化
// ============================================================
window.onload = () => {
  if (typeof google === 'undefined') {
    showError('Google Identity Servicesの読み込みに失敗しました。インターネット接続を確認してください。');
    return;
  }

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: onTokenReceived,
  });

  // デフォルト日付をセット（今日〜7日後）
  const today = new Date();
  const nextWeek = new Date();
  nextWeek.setDate(today.getDate() + 7);
  document.getElementById('startDate').value = formatDateInput(today);
  document.getElementById('endDate').value = formatDateInput(nextWeek);
};

// ============================================================
// 認証
// ============================================================
function signIn() {
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

function onTokenReceived(response) {
  if (response.error) {
    showError('認証に失敗しました: ' + response.error);
    return;
  }
  accessToken = response.access_token;

  // ユーザー情報取得
  fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
    .then(r => r.json())
    .then(info => {
      currentUserEmail = info.email || '';
      document.getElementById('userEmail').textContent = currentUserEmail;
    });

  document.getElementById('authSection').classList.add('hidden');
  document.getElementById('mainSection').classList.remove('hidden');
}

function signOut() {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken, () => {});
    accessToken = null;
  }
  currentUserEmail = '';
  document.getElementById('authSection').classList.remove('hidden');
  document.getElementById('mainSection').classList.add('hidden');
  document.getElementById('results').classList.add('hidden');
}

// ============================================================
// メールアドレス管理
// ============================================================
let emailCount = 1;

function addEmailField() {
  emailCount++;
  const list = document.getElementById('emailList');
  const row = document.createElement('div');
  row.className = 'email-row';
  row.dataset.id = emailCount;
  row.innerHTML = `
    <input type="email" placeholder="例: taro@example.com" />
    <button class="btn-remove-email" onclick="removeEmailField(this)" title="削除">×</button>
  `;
  list.appendChild(row);
}

function removeEmailField(btn) {
  const rows = document.querySelectorAll('.email-row');
  if (rows.length <= 1) return;
  btn.closest('.email-row').remove();
}

function getEmails() {
  const inputs = document.querySelectorAll('#emailList input');
  const emails = [];
  let valid = true;
  inputs.forEach(input => {
    const val = input.value.trim();
    if (val) {
      if (isValidEmail(val)) {
        emails.push(val);
        input.classList.remove('invalid');
      } else {
        input.classList.add('invalid');
        valid = false;
      }
    }
  });
  return valid ? emails : null;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ============================================================
// 空き時間検索
// ============================================================
async function searchFreeSlots() {
  clearError();
  document.getElementById('results').classList.add('hidden');

  // 入力値取得
  const emails = getEmails();
  if (!emails) {
    showError('メールアドレスの形式が正しくありません。');
    return;
  }
  if (emails.length === 0) {
    showError('少なくとも1人のメールアドレスを入力してください。');
    return;
  }

  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  if (!startDate || !endDate) {
    showError('検索期間を入力してください。');
    return;
  }
  if (startDate > endDate) {
    showError('終了日は開始日以降の日付を指定してください。');
    return;
  }

  const workStart = document.getElementById('workStart').value;
  const workEnd = document.getElementById('workEnd').value;
  const minDuration = parseInt(document.getElementById('minDuration').value, 10);

  // ローディング表示
  const btn = document.getElementById('searchBtn');
  btn.disabled = true;
  showLoading();

  try {
    const busyMap = await fetchFreeBusy(emails, startDate, endDate);
    const freeSlots = calcFreeSlots(busyMap, startDate, endDate, workStart, workEnd, minDuration);
    renderResults(freeSlots, emails);
  } catch (err) {
    showError('APIエラー: ' + (err.message || '不明なエラー'));
    hideLoading();
  } finally {
    btn.disabled = false;
  }
}

// ============================================================
// Google Calendar FreeBusy API呼び出し
// ============================================================
async function fetchFreeBusy(emails, startDate, endDate) {
  const timeMin = new Date(startDate + 'T00:00:00').toISOString();
  // endDateの翌日までカバーするため+1日
  const endDt = new Date(endDate);
  endDt.setDate(endDt.getDate() + 1);
  const timeMax = endDt.toISOString();

  const items = emails.map(email => ({ id: email }));

  const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      items,
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    // エラー詳細を確認
    const errors = err?.error?.errors || [];
    const notFoundEmails = [];
    Object.entries(err?.calendars || {}).forEach(([email, cal]) => {
      if (cal.errors) notFoundEmails.push(email);
    });
    if (notFoundEmails.length > 0) {
      throw new Error(`以下のカレンダーにアクセスできませんでした: ${notFoundEmails.join(', ')}\n相手がカレンダーを公開していないか、メールアドレスが間違っている可能性があります。`);
    }
    throw new Error(err?.error?.message || `HTTPエラー ${response.status}`);
  }

  const data = await response.json();
  const busyMap = {};

  for (const [email, calData] of Object.entries(data.calendars)) {
    if (calData.errors) {
      // アクセス不可のカレンダーは警告として記録するが処理継続
      console.warn(`カレンダーアクセス不可: ${email}`, calData.errors);
    }
    busyMap[email] = (calData.busy || []).map(b => ({
      start: new Date(b.start),
      end: new Date(b.end),
    }));
  }

  return busyMap;
}

// ============================================================
// 共通空き時間の計算
// ============================================================
function calcFreeSlots(busyMap, startDate, endDate, workStart, workEnd, minDuration) {
  const [wsH, wsM] = workStart.split(':').map(Number);
  const [weH, weM] = workEnd.split(':').map(Number);
  const minMs = minDuration * 60 * 1000;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // 日付ごとに処理
  const freeSlots = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dayStart = new Date(d);
    dayStart.setHours(wsH, wsM, 0, 0);
    const dayEnd = new Date(d);
    dayEnd.setHours(weH, weM, 0, 0);

    if (dayStart >= dayEnd) continue;

    // 全員のbusy時間をこの日にフィルタしてマージ
    const allBusy = [];
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

    // busy時間をソートしてマージ
    allBusy.sort((a, b) => a.start - b.start);
    const merged = [];
    for (const b of allBusy) {
      if (merged.length === 0 || b.start > merged[merged.length - 1].end) {
        merged.push({ start: new Date(b.start), end: new Date(b.end) });
      } else {
        merged[merged.length - 1].end = new Date(Math.max(merged[merged.length - 1].end, b.end));
      }
    }

    // 空き時間 = 稼働時間 - busy時間
    let cursor = new Date(dayStart);
    for (const b of merged) {
      if (b.start > cursor) {
        const slotMs = b.start - cursor;
        if (slotMs >= minMs) {
          freeSlots.push({ start: new Date(cursor), end: new Date(b.start) });
        }
      }
      cursor = new Date(Math.max(cursor, b.end));
    }
    if (cursor < dayEnd) {
      const slotMs = dayEnd - cursor;
      if (slotMs >= minMs) {
        freeSlots.push({ start: new Date(cursor), end: new Date(dayEnd) });
      }
    }
  }

  return freeSlots;
}

// ============================================================
// 結果の表示
// ============================================================
function renderResults(slots, emails) {
  hideLoading();
  const section = document.getElementById('results');
  section.classList.remove('hidden');

  document.getElementById('resultsCount').textContent = `${slots.length}件`;

  const list = document.getElementById('slotList');
  list.innerHTML = '';

  if (slots.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <div>指定期間内に共通の空き時間が見つかりませんでした。<br>期間や稼働時間を変えて試してみてください。</div>
      </div>
    `;
    return;
  }

  const locale = 'ja-JP';
  const dateOpts = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };
  const timeOpts = { hour: '2-digit', minute: '2-digit' };

  slots.forEach((slot, i) => {
    const durationMs = slot.end - slot.start;
    const durationMin = Math.round(durationMs / 60000);
    const durationStr = durationMin >= 60
      ? `${Math.floor(durationMin / 60)}時間${durationMin % 60 > 0 ? durationMin % 60 + '分' : ''}`
      : `${durationMin}分`;

    const item = document.createElement('div');
    item.className = 'slot-item';
    item.innerHTML = `
      <div class="slot-number">${i + 1}</div>
      <div class="slot-info">
        <div class="slot-date">${slot.start.toLocaleDateString(locale, dateOpts)}</div>
        <div class="slot-time">${slot.start.toLocaleTimeString(locale, timeOpts)} 〜 ${slot.end.toLocaleTimeString(locale, timeOpts)}</div>
      </div>
      <div class="slot-duration">${durationStr}</div>
    `;
    list.appendChild(item);
  });
}

// ============================================================
// ユーティリティ
// ============================================================
function formatDateInput(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function showLoading() {
  const section = document.getElementById('results');
  section.classList.remove('hidden');
  document.getElementById('slotList').innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <div>空き時間を検索中...</div>
    </div>
  `;
  document.getElementById('resultsCount').textContent = '...';
}

function hideLoading() {
}

function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearError() {
  const el = document.getElementById('errorMsg');
  el.textContent = '';
  el.classList.add('hidden');
}

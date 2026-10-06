/* Golden Blade — Telegram Mini App logic
 * SDK reference: https://core.telegram.org/bots/webapps (telegram-web-app.js)
 */
'use strict';

/* ---------- Telegram WebApp init ---------- */
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor('#0a0a0b');
  tg.setBackgroundColor('#0a0a0b');
  const user = tg.initDataUnsafe?.user;
  if (user) {
    document.getElementById('tg-user').textContent =
      `Добро пожаловать, ${user.first_name}${user.last_name ? ' ' + user.last_name : ''}`;
    const nameInput = document.getElementById('client-name');
    if (nameInput && !nameInput.value) nameInput.value = user.first_name || '';
  }
}

const CFG = window.APP_CONFIG || {};
const HAS_DB = Boolean(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);

/* ---------- Demo fallback data ---------- */
const DEMO = {
  masters: [
    { id: 'd1', name: 'Артём «Бритва»', specialty: 'Классические стрижки, королевское бритьё', rating: 4.9 },
    { id: 'd2', name: 'Марко Веста', specialty: 'Фейды, борода, камуфляж седины', rating: 4.8 },
    { id: 'd3', name: 'Дмитрий Гросс', specialty: 'Авторские образы, укладки', rating: 4.7 },
  ],
  services: [
    { id: 's1', name: 'Мужская стрижка', price: 1800, duration_min: 60, description: 'Стрижка + укладка + консультация' },
    { id: 's2', name: 'Королевское бритьё', price: 1500, duration_min: 45, description: 'Горячие полотенца, опасная бритва' },
    { id: 's3', name: 'Стрижка + борода', price: 2600, duration_min: 90, description: 'Полный комплекс под ключ' },
    { id: 's4', name: 'Оформление бороды', price: 1200, duration_min: 30, description: 'Контур, масло, стайлинг' },
    { id: 's5', name: 'Детская стрижка', price: 1400, duration_min: 45, description: 'Для джентльменов до 12 лет' },
  ],
};

/* ---------- Supabase REST helpers (PostgREST) ---------- */
async function dbFetch(path) {
  const res = await fetch(`${CFG.SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: CFG.SUPABASE_ANON_KEY, Authorization: `Bearer ${CFG.SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return res.json();
}
async function dbInsert(table, row) {
  const res = await fetch(`${CFG.SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: CFG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${CFG.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Insert failed: ${res.status} ${await res.text()}`);
}

/* ---------- State ---------- */
const state = { masters: [], services: [], master: null, service: null, date: null, time: null };
const $ = (id) => document.getElementById(id);
const WORK_START = 10, WORK_END = 20; // 10:00–20:00
const SLOT_STEP = 30; // minutes

/* ---------- Load data ---------- */
async function loadData() {
  try {
    if (HAS_DB) {
      const [masters, services] = await Promise.all([
        dbFetch('masters?is_active=eq.true&order=name'),
        dbFetch('services?is_active=eq.true&order=price'),
      ]);
      state.masters = masters; state.services = services;
    } else {
      await new Promise((r) => setTimeout(r, 400));
      state.masters = DEMO.masters; state.services = DEMO.services;
    }
  } catch (e) {
    console.warn('DB unavailable, fallback to demo:', e);
    state.masters = DEMO.masters; state.services = DEMO.services;
  }
  renderMasters();
  renderServices();
}

/* ---------- Render: masters ---------- */
function renderMasters() {
  const sel = $('master-select');
  sel.innerHTML = '<option value="">— Выберите мастера —</option>' + state.masters
    .map((m) => `<option value="${m.id}">${m.name}${m.rating ? ` ★ ${m.rating}` : ''}</option>`).join('');
  sel.addEventListener('change', () => {
    state.master = state.masters.find((m) => String(m.id) === sel.value) || null;
    const bio = $('master-bio');
    if (state.master?.specialty) { bio.textContent = state.master.specialty; bio.classList.remove('hidden'); }
    else bio.classList.add('hidden');
    state.time = null;
    if (state.date) loadSlots();
    updateSummary();
  });
}

/* ---------- Render: services ---------- */
function renderServices() {
  $('services-list').innerHTML = state.services.map((s) => `
    <button class="service-card" data-id="${s.id}">
      <span>
        <span class="block font-medium text-zinc-100">${s.name}</span>
        <span class="block text-xs text-zinc-500 mt-0.5">${s.description || ''}</span>
      </span>
      <span class="text-right shrink-0">
        <span class="block text-gold font-semibold">${s.price.toLocaleString('ru-RU')} ₽</span>
        <span class="block text-xs text-zinc-500">${s.duration_min} мин</span>
      </span>
      <svg class="check h-5 w-5 text-gold shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
      </svg>
    </button>`).join('');
  document.querySelectorAll('.service-card').forEach((el) =>
    el.addEventListener('click', () => {
      document.querySelectorAll('.service-card').forEach((c) => c.classList.remove('selected'));
      el.classList.add('selected');
      state.service = state.services.find((s) => String(s.id) === el.dataset.id);
      tg?.HapticFeedback?.selectionChanged();
      if (state.date) loadSlots();
      updateSummary();
    }));
}

/* ---------- Calendar ---------- */
const today = new Date(); today.setHours(0, 0, 0, 0);
let calCursor = new Date(today.getFullYear(), today.getMonth(), 1);
const RU_MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const RU_DAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

function renderCalendar() {
  const y = calCursor.getFullYear(), m = calCursor.getMonth();
  const first = new Date(y, m, 1);
  const offset = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const canPrev = y > today.getFullYear() || (y === today.getFullYear() && m > today.getMonth());

  let cells = RU_DAYS.map((d) => `<span class="text-center text-[10px] uppercase tracking-wider text-zinc-600 py-1">${d}</span>`).join('');
  cells += '<span></span>'.repeat(offset);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, m, d);
    const past = date < today;
    const isToday = date.getTime() === today.getTime();
    const sel = state.date && date.getTime() === state.date.getTime();
    cells += `<button class="cal-day ${isToday ? 'today' : ''} ${sel ? 'selected' : ''}" data-day="${d}" ${past ? 'disabled' : ''}>${d}</button>`;
  }

  $('calendar').innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <button class="cal-nav" id="cal-prev" ${canPrev ? '' : 'disabled'} aria-label="Назад">←</button>
      <span class="font-display text-gold">${RU_MONTHS[m]} ${y}</span>
      <button class="cal-nav" id="cal-next" aria-label="Вперёд">→</button>
    </div>
    <div class="cal-grid">${cells}</div>`;

  $('cal-prev')?.addEventListener('click', () => { calCursor = new Date(y, m - 1, 1); renderCalendar(); });
  $('cal-next')?.addEventListener('click', () => { calCursor = new Date(y, m + 1, 1); renderCalendar(); });
  document.querySelectorAll('.cal-day:not([disabled])').forEach((el) =>
    el.addEventListener('click', () => {
      state.date = new Date(y, m, Number(el.dataset.day));
      state.time = null;
      tg?.HapticFeedback?.selectionChanged();
      renderCalendar();
      loadSlots();
      updateSummary();
    }));
}

/* ---------- Time slots ---------- */
function slotTimes() {
  const out = [];
  const dur = state.service?.duration_min || 60;
  for (let t = WORK_START * 60; t + dur <= WORK_END * 60; t += SLOT_STEP) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  }
  return out;
}

async function loadSlots() {
  const wrap = $('slots');
  wrap.innerHTML = '<div class="skeleton col-span-full h-11"></div>';

  const dateISO = state.date.toISOString().slice(0, 10);
  let bookedSet = new Set();
  if (HAS_DB) {
    try {
      const rows = await dbFetch(
        `appointments?select=appointment_time&appointment_date=eq.${dateISO}` +
        (state.master && !String(state.master.id).startsWith('d') ? `&master_id=eq.${state.master.id}` : ''));
      bookedSet = new Set(rows.map((r) => r.appointment_time.slice(0, 5)));
    } catch (e) { console.warn('slots fetch failed', e); }
  } else {
    bookedSet = new Set(['12:00', '15:30', '18:00'].filter((_, i) => (state.date.getDate() + i) % 3 !== 0));
  }

  const now = new Date();
  const isToday = state.date.getTime() === today.getTime();
  wrap.innerHTML = slotTimes().map((t) => {
    const past = isToday && (Number(t.slice(0, 2)) * 60 + Number(t.slice(3))) <= now.getHours() * 60 + now.getMinutes();
    const busy = bookedSet.has(t);
    return `<button class="slot ${state.time === t ? 'selected' : ''}" data-t="${t}" ${past || busy ? 'disabled' : ''}>${t}</button>`;
  }).join('') || '<p class="col-span-full text-sm text-zinc-600">Нет свободных слотов</p>';

  wrap.querySelectorAll('.slot:not([disabled])').forEach((el) =>
    el.addEventListener('click', () => {
      wrap.querySelectorAll('.slot').forEach((s) => s.classList.remove('selected'));
      el.classList.add('selected');
      state.time = el.dataset.t;
      tg?.HapticFeedback?.selectionChanged();
      updateSummary();
    }));
}

/* ---------- Summary + CTA ---------- */
const canSubmit = () => state.master && state.service && state.date && state.time &&
  $('client-name').value.trim() && $('client-phone').value.trim();

function updateSummary() {
  const ready = canSubmit();
  const box = $('summary');
  if (state.service && state.date && state.time) {
    box.classList.remove('hidden');
    $('summary-body').innerHTML = `
      <p><span class="text-zinc-500">Мастер:</span> ${state.master?.name || '—'}</p>
      <p><span class="text-zinc-500">Услуга:</span> ${state.service.name} — ${state.service.price.toLocaleString('ru-RU')} ₽</p>
      <p><span class="text-zinc-500">Когда:</span> ${state.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} в ${state.time}</p>`;
  } else box.classList.add('hidden');

  if (tg?.MainButton) {
    tg.MainButton.setParams({ text: 'ЗАПИСАТЬСЯ', color: '#d4af37', text_color: '#0a0a0b', has_shine_effect: true });
    ready ? (tg.MainButton.enable(), tg.MainButton.show()) : (tg.MainButton.disable(), tg.MainButton.show());
  }
  $('cta').disabled = !ready;
}

['client-name', 'client-phone'].forEach((id) => $(id).addEventListener('input', updateSummary));

/* ---------- Submit ---------- */
async function submitBooking() {
  if (!canSubmit()) return;
  const payload = {
    client_name: $('client-name').value.trim(),
    client_phone: $('client-phone').value.trim(),
    master_id: HAS_DB && !String(state.master.id).startsWith('d') ? state.master.id : null,
    service_id: HAS_DB && !String(state.service.id).startsWith('s') ? state.service.id : null,
    master_name: state.master.name,
    service_name: state.service.name,
    price: state.service.price,
    appointment_date: state.date.toISOString().slice(0, 10),
    appointment_time: state.time,
    telegram_user_id: tg?.initDataUnsafe?.user?.id ?? null,
    status: 'pending',
  };

  tg?.MainButton?.showProgress();
  $('cta').disabled = true;
  try {
    if (HAS_DB) await dbInsert('appointments', payload);
    else await new Promise((r) => setTimeout(r, 800));
    tg?.HapticFeedback?.notificationOccurred('success');
    showSuccess();
  } catch (e) {
    console.error(e);
    tg?.HapticFeedback?.notificationOccurred('error');
    toast('Не удалось создать запись. Попробуйте ещё раз.');
  } finally {
    tg?.MainButton?.hideProgress();
    $('cta').disabled = false;
  }
}

function showSuccess() {
  const el = document.createElement('div');
  el.className = 'success-overlay';
  el.innerHTML = `
    <div class="text-center px-6">
      <div class="success-ring mx-auto mb-5">
        <svg class="h-10 w-10 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
        </svg>
      </div>
      <h3 class="font-display text-2xl text-gold mb-2">Запись создана</h3>
      <p class="text-sm text-zinc-400 mb-6">${state.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} в ${state.time} · ${state.master.name}</p>
      <button id="success-close" class="min-h-[48px] px-8 rounded-xl bg-gold text-ink font-semibold active:scale-[0.97] transition-transform">Готово</button>
    </div>`;
  document.body.appendChild(el);
  el.querySelector('#success-close').addEventListener('click', () => {
    el.remove();
    tg?.close ? tg.close() : location.reload();
  });
}

function toast(msg) {
  const t = $('toast');
  t.firstElementChild.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3000);
}

/* ---------- Boot ---------- */
$('cta').addEventListener('click', submitBooking);
if (tg?.MainButton) tg.MainButton.onClick(submitBooking);

$('services-list').innerHTML = '<div class="skeleton"></div>'.repeat(4);
renderCalendar();
loadData().then(updateSummary);

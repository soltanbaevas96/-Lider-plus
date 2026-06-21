import React, { useState, useEffect, useCallback } from "react";
import { supabase, supaReady } from "./supabase.js";

// ── Данные ────────────────────────────────────────────────────────────
const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const DAYS_FULL = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const SLOT_MIN = 30;
const ADMIN_PIN = "2468"; // сменить при необходимости

const GRADES = ["9 класс", "10 класс", "11 класс", "Колледж"];

// Стоимость консультации в зависимости от наличия договора с центром
const PRICE_NO_CONTRACT = "20 000 ₸";

// Консультанты. id используется в ключах базы — латиницей, не менять после запуска.
// whatsapp — номер в международном формате без + и пробелов (для ссылки wa.me).
// address — вежливое обращение (имя-отчество) для сообщений в WhatsApp.
const CONSULTANTS = [
  { id: "symbat",   name: "Нұрмәди Сымбат Сұнғатқызы",        short: "Сымбат",   address: "Сымбат Сұнғатқызы",    role: "Профориентация", whatsapp: "77479048949" },
  { id: "aigerim",  name: "Оразбекова Айгерим Алтынбековна", short: "Айгерим",  address: "Айгерим Алтынбековна", role: "Профориентация", whatsapp: "77778905810" },
];

// Данные образовательного центра
const CENTER = {
  name: "Лидер Плюс",
  address: "ул. Академика Маргулана, 197/2, Павлодар (2 этаж, 1 дверь слева)",
  lat: 52.273132,
  lng: 76.944613,
  mapLink: "https://2gis.kz/pavlodar/firm/70000001104381000",
  routeLink: "https://2gis.kz/pavlodar/directions/points/%7C76.944613%2C52.273132%3B70000001104381000",
};

const INK = "#1a1a1a", GOLD = "#d9a86c", PAPER = "#faf8f4";

const isoDow = (d) => (d.getDay() + 6) % 7;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseHM = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const toHM = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
// Телефон → только цифры, в едином виде. 8XXX и 7XXX (Казахстан/Россия) приводятся к одному.
const normPhone = (s) => {
  let d = String(s || "").replace(/\D/g, "");
  if (d.length === 11 && d[0] === "8") d = "7" + d.slice(1);
  return d;
};

const DEFAULT_SCHEDULE = { workdays: { 0: true, 1: true, 2: true, 3: true, 4: true, 5: false, 6: false }, start: "10:00", end: "18:00" };

// ── Слой данных: Supabase, а если ключи не вписаны — локальный режим ───
const local = {
  k: (s) => `lp_${s}`,
  get(s, d) { try { const v = localStorage.getItem(this.k(s)); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(s, v) { try { localStorage.setItem(this.k(s), JSON.stringify(v)); } catch (e) { void e; } },
};

const db = {
  async loadSchedules() {
    if (!supaReady) { const o = {}; CONSULTANTS.forEach(c => o[c.id] = local.get(`sched_${c.id}`, DEFAULT_SCHEDULE)); return o; }
    const { data } = await supabase.from("schedules").select("consultant_id,data");
    const o = {}; CONSULTANTS.forEach(c => o[c.id] = DEFAULT_SCHEDULE);
    (data || []).forEach(r => { o[r.consultant_id] = r.data; });
    return o;
  },
  async saveSchedule(cid, data) {
    if (!supaReady) { local.set(`sched_${cid}`, data); return; }
    await supabase.from("schedules").upsert({ consultant_id: cid, data }, { onConflict: "consultant_id" });
  },
  async loadBookings() {
    if (!supaReady) return local.get("bookings", {});
    const { data } = await supabase.from("bookings").select("*");
    const o = {};
    (data || []).forEach(r => {
      const d = String(r.slot_date).slice(0, 10);   // "2026-06-22" даже если придёт со временем
      o[`${r.consultant_id}|${d} ${r.slot_time}`] = { name: r.name, phone: r.phone, topic: r.topic, grade: r.grade, contract: r.contract };
    });
    return o;
  },
  async addBooking(cid, date, time, info) {
    if (!supaReady) { const b = local.get("bookings", {}); b[`${cid}|${date} ${time}`] = info; local.set("bookings", b); return { ok: true }; }
    const { error } = await supabase.from("bookings").insert({ consultant_id: cid, slot_date: date, slot_time: time, name: info.name, phone: info.phone, topic: info.topic, grade: info.grade, contract: info.contract });
    return { ok: !error, error };
  },
  async delBooking(cid, date, time) {
    if (!supaReady) { const b = local.get("bookings", {}); delete b[`${cid}|${date} ${time}`]; local.set("bookings", b); return; }
    await supabase.from("bookings").delete().match({ consultant_id: cid, slot_date: date, slot_time: time });
  },
};

// ── Логотип ───────────────────────────────────────────────────────────
function Logo({ size = 52 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-label="Лидер Плюс">
      <rect width="100" height="100" rx="22" fill={INK} />
      <g transform="translate(50,52)">
        <path d="M-26 -14 L18 -22 L30 -16 L-14 -8 Z" fill={GOLD} />
        <path d="M-26 -14 L-14 -8 L-14 -2 L-26 -8 Z" fill="#bd8c52" />
        <path d="M-26 -2 L26 -2 L26 5 L-26 5 Z" fill={GOLD} />
        <path d="M-26 -2 L-26 5 L-20 8 L-20 1 Z" fill="#bd8c52" />
        <path d="M-26 9 L26 9 L20 16 L-26 16 Z" fill={GOLD} />
        <path d="M-22 -3 L22 -3 L22 0 L-22 0 Z" fill="#fff" opacity="0.85" />
        <path d="M-22 10 L16 10 L16 13 L-22 13 Z" fill="#fff" opacity="0.85" />
      </g>
    </svg>
  );
}
function LogoWordmark() {
  return (
    <div style={S.wordmark}>
      <Logo size={48} />
      <div style={{ lineHeight: 1 }}>
        <div style={S.wmTop}>ЛИДЕР</div>
        <div style={S.wmBot}>ПЛЮС</div>
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState("client");
  const [schedules, setSchedules] = useState(null);
  const [bookings, setBookings] = useState({});

  const reload = useCallback(async () => {
    const [sc, bk] = await Promise.all([db.loadSchedules(), db.loadBookings()]);
    setSchedules(sc); setBookings(bk);
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { const t = setInterval(reload, 8000); return () => clearInterval(t); }, [reload]);

  if (!schedules) return <div style={S.loadWrap}><div style={S.spinner} /><style>{spinCss}</style></div>;

  return (
    <div style={S.app}>
      <style>{globalCss}</style>
      <header style={S.header}>
        <LogoWordmark />
        <div style={S.navTabs}>
          <button onClick={() => setView("client")} style={{ ...S.navTab, ...(view === "client" ? S.navTabActive : {}) }}>Запись</button>
          <button onClick={() => setView("my")} style={{ ...S.navTab, ...(view === "my" ? S.navTabActive : {}) }}>Моя запись</button>
          <button onClick={() => setView("admin")} style={{ ...S.navTab, ...(view === "admin" ? S.navTabActive : {}) }}>Кабинет</button>
        </div>
      </header>

      {!supaReady && (
        <div style={S.demoBar}>Демо-режим: записи сохраняются только на этом устройстве. Подключите Supabase для общей записи.</div>
      )}

      <main style={S.main}>
        {view === "client" && <><ClientView schedules={schedules} bookings={bookings} reload={reload} /><OfficeBlock /></>}
        {view === "my" && <MyBookingView bookings={bookings} reload={reload} />}
        {view === "admin" && <AdminView schedules={schedules} bookings={bookings} reload={reload} />}
      </main>

      <footer style={S.footer}>«Лидер Плюс» · Профориентация · запись онлайн</footer>
    </div>
  );
}

// ── «Моя запись»: поиск по телефону + отмена ──────────────────────────
function MyBookingView({ bookings, reload }) {
  const [phone, setPhone] = useState("");
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);

  const now = new Date();
  const query = normPhone(phone);
  const found = !searched || query.length < 7 ? [] : Object.entries(bookings)
    .filter(([, v]) => normPhone(v.phone) === query)
    .map(([k, v]) => { const [cid, rest] = k.split("|"); const [date, slot] = rest.split(" "); return { cid, date, slot, ...v }; })
    .filter(b => new Date(`${b.date}T${b.slot}`) >= now)
    .sort((a, b) => (a.date + a.slot < b.date + b.slot ? -1 : 1));

  const search = () => { if (normPhone(phone).length >= 7) setSearched(true); };

  const cancel = async (b) => {
    if (!window.confirm(`Отменить запись ${b.date.split("-").reverse().join(".")} в ${b.slot}?`)) return;
    setBusy(true);
    await db.delBooking(b.cid, b.date, b.slot);
    await reload();
    setBusy(false);
  };

  return (
    <div style={S.cardCenter}>
      <div style={S.stepHead}>Моя запись</div>
      <p style={S.empty}>Введите номер телефона, который указывали при записи — покажем ваши записи.</p>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <input style={{ ...S.input, marginTop: 0, flex: 1 }} value={phone} placeholder="+7 ___ ___ __ __" inputMode="tel"
          onChange={(e) => { setPhone(e.target.value); setSearched(false); }}
          onKeyDown={(e) => e.key === "Enter" && search()} />
        <button style={{ ...S.btnPrimary, width: "auto", padding: "11px 20px" }} onClick={search}>Найти</button>
      </div>

      {searched && (
        <div style={{ marginTop: 20 }}>
          {found.length === 0 ? (
            <p style={S.empty}>Записей на этот номер не найдено. Проверьте номер или запишитесь на вкладке «Запись».</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {found.map((b, i) => {
                const c = CONSULTANTS.find(x => x.id === b.cid);
                const d = new Date(b.date + "T00:00");
                return (
                  <div key={i} style={S.bookRow}>
                    <div style={S.bookWhen}>
                      <div style={S.bookDate}>{d.getDate()} {MONTHS[d.getMonth()].slice(0, 3)}</div>
                      <div style={S.bookTime}>{b.slot}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={S.bookName}>{c ? c.short : "Консультант"} {b.grade && <span style={S.gradeTag}>{b.grade}</span>}</div>
                      <div style={S.bookTopic}>{c ? c.name : ""}</div>
                    </div>
                    <button style={S.cancelBtn} disabled={busy} onClick={() => cancel(b)} title="Отменить">✕</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Блок офиса: карта + контакты ──────────────────────────────────────
function MapPin() {
  // Схематичная карта с меткой — рисуется локально, не зависит от внешних сервисов
  return (
    <svg viewBox="0 0 400 280" style={S.mapFrame} preserveAspectRatio="xMidYMid slice" aria-label="Схема расположения">
      <rect width="400" height="280" fill="#eef1ec" />
      {/* дороги */}
      <path d="M0 90 H400 M0 200 H400 M120 0 V280 M280 0 V280" stroke="#dfe3dc" strokeWidth="14" />
      <path d="M0 90 H400 M0 200 H400 M120 0 V280 M280 0 V280" stroke="#fff" strokeWidth="3" />
      {/* кварталы */}
      <rect x="135" y="105" width="130" height="80" fill="#e4e8e0" rx="4" />
      <rect x="20" y="105" width="85" height="80" fill="#e4e8e0" rx="4" />
      <rect x="295" y="105" width="85" height="80" fill="#e4e8e0" rx="4" />
      {/* метка офиса */}
      <g transform="translate(200,145)">
        <ellipse cx="0" cy="34" rx="13" ry="4" fill="rgba(0,0,0,.15)" />
        <path d="M0 32 C0 32 -22 6 -22 -10 A22 22 0 1 1 22 -10 C22 6 0 32 0 32 Z" fill={GOLD} stroke={INK} strokeWidth="2" />
        <circle cx="0" cy="-10" r="8" fill={INK} />
      </g>
    </svg>
  );
}
function OfficeBlock() {
  return (
    <section style={S.office}>
      <div style={S.officeHead}>Где проходят консультации</div>
      <div style={S.officeInfo}>
        <div style={S.officeAddrLabel}>Адрес</div>
        <div style={S.officeAddr}>{CENTER.address}</div>
        <a href={CENTER.routeLink} target="_blank" rel="noopener noreferrer" style={S.routeBtn}>Построить маршрут в 2ГИС</a>

        <div style={{ ...S.officeAddrLabel, marginTop: 22 }}>WhatsApp консультантов</div>
        {CONSULTANTS.map((c) => (
          <a key={c.id} href={`https://wa.me/${c.whatsapp}`} target="_blank" rel="noopener noreferrer" style={S.waContact}>
            <span style={S.waContactIcon}>✆</span>
            <span><b>{c.address}</b><br /><span style={S.waContactNum}>+{c.whatsapp}</span></span>
          </a>
        ))}
      </div>

      <a href={CENTER.mapLink} target="_blank" rel="noopener noreferrer" style={S.mapWrap}>
        <MapPin />
        <span style={S.mapOverlay}>Открыть карту в 2ГИС</span>
      </a>
    </section>
  );
}

function slotsForDate(date, schedule) {
  if (!schedule || !schedule.workdays[isoDow(date)]) return [];
  const s = parseHM(schedule.start), e = parseHM(schedule.end), out = [];
  for (let m = s; m + SLOT_MIN <= e; m += SLOT_MIN) out.push(toHM(m));
  return out;
}

// ── КЛИЕНТ ────────────────────────────────────────────────────────────
function ClientView({ schedules, bookings, reload }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [cid, setCid] = useState(null);
  const [contract, setContract] = useState(null); // "yes" | "no"
  const [grade, setGrade] = useState(null);
  const [selDate, setSelDate] = useState(null);
  const [selSlot, setSelSlot] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", topic: "" });
  const [done, setDone] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const consultant = CONSULTANTS.find(c => c.id === cid);
  const schedule = cid ? schedules[cid] : null;

  const days = [];
  if (schedule) for (let i = 0; i < 28; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    if (slotsForDate(d, schedule).length) days.push(d);
  }

  const now = new Date();
  const slots = selDate ? slotsForDate(selDate, schedule) : [];
  const isTaken = (d, slot) => !!bookings[`${cid}|${ymd(d)} ${slot}`];
  const isPast = (d, slot) => { const dt = new Date(d); const [h, m] = slot.split(":").map(Number); dt.setHours(h, m, 0, 0); return dt <= now; };

  const reset = () => { setDone(null); setCid(null); setContract(null); setGrade(null); setSelDate(null); setSelSlot(null); setForm({ name: "", phone: "", topic: "" }); setErr(""); };

  const submit = async () => {
    setErr("");
    if (contract !== "yes") return setErr("Запись через сайт доступна только при наличии договора.");
    if (!form.name.trim()) return setErr("Укажите имя");
    if (form.phone.replace(/\D/g, "").length < 7) return setErr("Укажите корректный телефон");
    setBusy(true);
    const info = { name: form.name.trim(), phone: form.phone.trim(), topic: form.topic.trim(), grade, contract };
    const res = await db.addBooking(cid, ymd(selDate), selSlot, info);
    setBusy(false);
    if (!res.ok) {
      await reload();
      // 23505 = нарушение уникальности (слот заняли). Иначе — проблема связи.
      const taken = !res.error || res.error.code === "23505";
      return setErr(taken
        ? "Это время только что заняли. Выберите другое."
        : "Не удалось записаться, проверьте интернет и попробуйте ещё раз.");
    }
    await reload();
    setDone({ date: selDate, slot: selSlot, consultant, ...info });
  };

  if (done) {
    const waText = encodeURIComponent(
      `Здравствуйте, ${done.consultant.address}!\n\n` +
      `Записался(ась) на консультацию по профориентации.\n` +
      `Дата: ${done.date.getDate()} ${MONTHS[done.date.getMonth()]}, ${done.slot}\n` +
      `Класс: ${done.grade}\n` +
      `Договор с Лидер Плюс: есть (бесплатно)\n` +
      `Имя: ${done.name}\n` +
      `Телефон: ${done.phone}` +
      (done.topic ? `\nЗапрос: ${done.topic}` : "")
    );
    const waLink = `https://wa.me/${done.consultant.whatsapp}?text=${waText}`;
    return (
      <div style={S.cardCenter}>
        <div style={S.successIcon}>✓</div>
        <h2 style={S.successTitle}>Вы записаны</h2>
        <div style={S.confBox}>
          <Row label="Консультант" value={done.consultant.name} />
          <Row label="Класс" value={done.grade} />
          <Row label="Дата" value={`${DAYS_FULL[isoDow(done.date)]}, ${done.date.getDate()} ${MONTHS[done.date.getMonth()]}`} />
          <Row label="Время" value={`${done.slot} · 30 минут`} />
          <Row label="Имя" value={done.name} />
          <Row label="Телефон" value={done.phone} />
          {done.topic && <Row label="Запрос" value={done.topic} />}
        </div>
        <p style={S.confNote}>Подтвердите запись в WhatsApp — консультант получит ваши данные.</p>
        <a href={waLink} target="_blank" rel="noopener noreferrer" style={S.btnWhatsapp}>
          <span style={S.waIcon}>✆</span> Подтвердить в WhatsApp
        </a>
        <button style={S.btnGhost} onClick={reset}>Записать ещё</button>
        <div style={S.cancelHint}>
          Нужно отменить запись? Откройте вкладку <b>«Моя запись»</b> наверху и введите номер, который вы указали при записи: <b>{done.phone}</b>.
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={S.heroBlock}>
        <div style={S.heroTitle}>Консультация по профориентации</div>
        <div style={S.heroMeta}>Личная встреча · 30 минут · запись онлайн</div>
      </div>

      <div style={S.clientGrid}>
        {/* Шаг 1 — консультант */}
        <section style={S.card}>
          <div style={S.stepHead}><span style={S.stepNum}>1</span> Выберите консультанта</div>
          <div style={S.consGrid}>
            {CONSULTANTS.map((c) => (
              <button key={c.id}
                onClick={() => { setCid(c.id); setContract(null); setGrade(null); setSelDate(null); setSelSlot(null); setErr(""); }}
                style={{ ...S.consBtn, ...(cid === c.id ? S.consBtnActive : {}) }}>
                <span style={{ ...S.consAvatar, ...(cid === c.id ? { background: GOLD, color: INK } : {}) }}>
                  {c.short[0]}
                </span>
                <span style={S.consName}>{c.name}</span>
                <span style={S.consRole}>{c.role}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Шаг 2 — договор */}
        <section style={{ ...S.card, ...dim(cid) }}>
          <div style={S.stepHead}><span style={S.stepNum}>2</span> Договор с Лидер Плюс</div>
          <p style={S.contractQ}>Заключён ли у вас договор с центром «Лидер Плюс» на обучение?</p>
          <div style={S.gradeGrid}>
            <button onClick={() => { setContract("yes"); setErr(""); }}
              style={{ ...S.gradeBtn, ...(contract === "yes" ? S.gradeBtnActive : {}) }}>Да, есть</button>
            <button onClick={() => { setContract("no"); setGrade(null); setSelDate(null); setSelSlot(null); setErr(""); }}
              style={{ ...S.gradeBtn, ...(contract === "no" ? S.gradeBtnActive : {}) }}>Нет</button>
          </div>

          {contract === "yes" && (
            <div style={{ ...S.priceBox, ...S.priceFree }}>Для вас консультация <b>бесплатно</b> — продолжайте запись ниже.</div>
          )}

          {contract === "no" && (
            <div style={S.paidBlock}>
              <div style={S.paidTitle}>Консультация платная</div>
              <p style={S.paidText}>
                Без договора с «Лидер Плюс» консультация проводится на платной основе.
                Чтобы записаться и уточнить стоимость, свяжитесь напрямую с консультантом в WhatsApp:
              </p>
              {CONSULTANTS.map((c) => {
                const text = encodeURIComponent(`Здравствуйте, ${c.address}, хочу записаться на платную консультацию.`);
                return (
                  <a key={c.id} href={`https://wa.me/${c.whatsapp}?text=${text}`} target="_blank" rel="noopener noreferrer" style={S.waContact}>
                    <span style={S.waContactIcon}>✆</span>
                    <span><b>{c.address}</b><br /><span style={S.waContactNum}>+{c.whatsapp}</span></span>
                  </a>
                );
              })}
            </div>
          )}
        </section>

        {/* Шаг 3 — класс (только при наличии договора) */}
        <section style={{ ...S.card, ...dim(contract === "yes") }}>
          <div style={S.stepHead}><span style={S.stepNum}>3</span> Учусь в классе</div>
          <div style={S.gradeGrid}>
            {GRADES.map((g) => (
              <button key={g} onClick={() => { setGrade(g); setErr(""); }}
                style={{ ...S.gradeBtn, ...(grade === g ? S.gradeBtnActive : {}) }}>{g}</button>
            ))}
          </div>
        </section>

        {/* Шаг 4 — день */}
        <section style={{ ...S.card, ...dim(grade) }}>
          <div style={S.stepHead}><span style={S.stepNum}>4</span> Выберите день</div>
          {schedule && days.length === 0 ? <p style={S.empty}>У консультанта пока нет свободных дней. Загляните позже.</p> : (
            <div style={S.dayList}>
              {days.map((d) => {
                const free = slotsForDate(d, schedule).filter(s => !isTaken(d, s) && !isPast(d, s)).length;
                const active = selDate && ymd(selDate) === ymd(d);
                return (
                  <button key={ymd(d)} onClick={() => { setSelDate(d); setSelSlot(null); setErr(""); }}
                    style={{ ...S.dayBtn, ...(active ? S.dayBtnActive : {}) }}>
                    <span style={S.dayDow}>{DAYS[isoDow(d)]}</span>
                    <span style={S.dayNum}>{d.getDate()}</span>
                    <span style={S.dayMon}>{MONTHS[d.getMonth()].slice(0, 3)}</span>
                    <span style={{ ...S.dayFree, color: free ? "#0a7" : "#bbb" }}>{free ? `${free} своб.` : "занято"}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Шаг 5 — слот */}
        <section style={{ ...S.card, ...dim(selDate) }}>
          <div style={S.stepHead}><span style={S.stepNum}>5</span> Выберите время</div>
          {selDate && (
            <>
              <div style={S.legend}>
                <span><i style={{ ...S.dot, background: "#fff", border: "1.5px solid #d8d2c6" }} /> свободно</span>
                <span><i style={{ ...S.dot, background: INK }} /> выбрано</span>
                <span><i style={{ ...S.dot, background: "#eee8dd" }} /> занято</span>
              </div>
              <div style={S.slotGrid}>
                {slots.map((s) => {
                  const dis = isTaken(selDate, s) || isPast(selDate, s);
                  return (
                    <button key={s} disabled={dis} onClick={() => { setSelSlot(s); setErr(""); }}
                      style={{ ...S.slot, ...(dis ? S.slotDis : {}), ...(selSlot === s ? S.slotActive : {}) }}>{s}</button>
                  );
                })}
              </div>
            </>
          )}
        </section>

        {/* Шаг 6 — данные */}
        <section style={{ ...S.card, ...dim(selSlot) }}>
          <div style={S.stepHead}><span style={S.stepNum}>6</span> Ваши данные</div>
          <label style={S.lab}>Имя
            <input style={S.input} value={form.name} placeholder="Имя и фамилия"
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label style={S.lab}>Телефон
            <input style={S.input} value={form.phone} placeholder="+7 ___ ___ __ __" inputMode="tel"
              onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label style={S.lab}>Запрос / тема
            <textarea style={{ ...S.input, height: 72, resize: "vertical", fontFamily: "inherit" }}
              value={form.topic} placeholder="Коротко: что хотите обсудить"
              onChange={(e) => setForm({ ...form, topic: e.target.value })} />
          </label>
          {err && <div style={S.errBox}>{err}</div>}
          <button style={S.btnPrimary} disabled={busy} onClick={submit}>{busy ? "Записываем…" : "Записаться"}</button>
        </section>
      </div>
    </>
  );
}

const dim = (cond) => cond ? {} : { opacity: 0.45, pointerEvents: "none" };

// ── АДМИН ─────────────────────────────────────────────────────────────
function AdminView({ schedules, bookings, reload }) {
  const [authed, setAuthed] = useState(false);
  const [pin, setPin] = useState("");
  const [cid, setCid] = useState(CONSULTANTS[0].id);
  const [tab, setTab] = useState("list");

  if (!authed) {
    return (
      <div style={S.cardCenter}>
        <div style={S.stepHead}>Вход в кабинет</div>
        <p style={S.empty}>Введите PIN для доступа к записям и расписанию.</p>
        <input style={{ ...S.input, marginTop: 14 }} type="password" inputMode="numeric" placeholder="PIN"
          value={pin} onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setAuthed(pin === ADMIN_PIN)} />
        <button style={{ ...S.btnPrimary, marginTop: 12 }} onClick={() => setAuthed(pin === ADMIN_PIN)}>Войти</button>
        {pin.length >= 4 && pin !== ADMIN_PIN && <div style={S.errBox}>Неверный PIN</div>}
      </div>
    );
  }

  return (
    <div>
      <div style={S.consTabs}>
        {CONSULTANTS.map(c => (
          <button key={c.id} onClick={() => setCid(c.id)} style={{ ...S.consTab, ...(cid === c.id ? S.consTabActive : {}) }}>
            {c.short}
          </button>
        ))}
      </div>
      <div style={S.adminTabs}>
        <button onClick={() => setTab("list")} style={{ ...S.subTab, ...(tab === "list" ? S.subTabActive : {}) }}>Записи</button>
        <button onClick={() => setTab("settings")} style={{ ...S.subTab, ...(tab === "settings" ? S.subTabActive : {}) }}>Расписание</button>
      </div>

      {tab === "list"
        ? <BookingList cid={cid} bookings={bookings} reload={reload} />
        : <SettingsView cid={cid} schedule={schedules[cid]} reload={reload} />}
    </div>
  );
}

function BookingList({ cid, bookings, reload }) {
  const now = new Date();
  const list = Object.entries(bookings)
    .filter(([k]) => k.startsWith(`${cid}|`))
    .map(([k, v]) => { const [, rest] = k.split("|"); const [date, slot] = rest.split(" "); return { date, slot, ...v }; })
    .filter(b => new Date(`${b.date}T${b.slot}`) >= now)
    .sort((a, b) => (a.date + a.slot < b.date + b.slot ? -1 : 1));

  const cancel = async (b) => { await db.delBooking(cid, b.date, b.slot); await reload(); };

  return (
    <div style={S.card}>
      <div style={S.stepHead}>Предстоящие консультации {list.length ? `(${list.length})` : ""}</div>
      {list.length === 0 ? <p style={S.empty}>Пока никто не записан.</p> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {list.map((b, i) => {
            const d = new Date(b.date + "T00:00");
            return (
              <div key={i} style={S.bookRow}>
                <div style={S.bookWhen}>
                  <div style={S.bookDate}>{d.getDate()} {MONTHS[d.getMonth()].slice(0, 3)}</div>
                  <div style={S.bookTime}>{b.slot}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={S.bookName}>
                    {b.name}
                    {b.grade && <span style={S.gradeTag}>{b.grade}</span>}
                  </div>
                  <a href={`tel:${b.phone}`} style={S.bookPhone}>{b.phone}</a>
                  {b.topic && <div style={S.bookTopic}>{b.topic}</div>}
                </div>
                <button style={S.cancelBtn} onClick={() => cancel(b)} title="Отменить">✕</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SettingsView({ cid, schedule, reload }) {
  const [s, setS] = useState(schedule);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setS(schedule); }, [cid, schedule]);
  const times = [];
  for (let m = 6 * 60; m <= 22 * 60; m += 30) times.push(toHM(m));
  const save = async () => {
    if (parseHM(s.end) <= parseHM(s.start)) return;
    await db.saveSchedule(cid, s); await reload(); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };
  return (
    <div style={S.card}>
      <div style={S.stepHead}>Настройка приёма</div>
      <div style={S.subLabel}>Рабочие дни</div>
      <div style={S.dowRow}>
        {DAYS.map((d, i) => (
          <button key={i} onClick={() => setS({ ...s, workdays: { ...s.workdays, [i]: !s.workdays[i] } })}
            style={{ ...S.dowChip, ...(s.workdays[i] ? S.dowChipOn : {}) }}>{d}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 14 }}>
        <label style={{ ...S.lab, flex: 1 }}>Начало
          <select style={S.input} value={s.start} onChange={(e) => setS({ ...s, start: e.target.value })}>
            {times.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label style={{ ...S.lab, flex: 1 }}>Окончание
          <select style={S.input} value={s.end} onChange={(e) => setS({ ...s, end: e.target.value })}>
            {times.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>
      <p style={S.hintBox}>Слоты по 30 минут создаются автоматически. С {s.start} до {s.end} — {Math.max(0, Math.floor((parseHM(s.end) - parseHM(s.start)) / 30))} слотов в день.</p>
      <button style={S.btnPrimary} onClick={save}>Сохранить</button>
      {saved && <div style={S.savedNote}>✓ Сохранено</div>}
    </div>
  );
}

const Row = ({ label, value }) => (
  <div style={S.confRow}><span style={S.confLabel}>{label}</span><span style={S.confValue}>{value}</span></div>
);

// ── Стили ─────────────────────────────────────────────────────────────
const S = {
  app: { minHeight: "100vh", background: PAPER, color: INK, fontFamily: "'Inter', system-ui, sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 24px", background: INK, position: "sticky", top: 0, zIndex: 10, flexWrap: "wrap", gap: 12 },
  wordmark: { display: "flex", alignItems: "center", gap: 13 },
  wmTop: { fontSize: 20, fontWeight: 800, fontStyle: "italic", color: "#fff", letterSpacing: "0.02em" },
  wmBot: { fontSize: 20, fontWeight: 800, fontStyle: "italic", color: "#fff", letterSpacing: "0.04em", marginTop: -2 },
  navTabs: { display: "flex", gap: 4, background: "rgba(255,255,255,.1)", padding: 4, borderRadius: 12 },
  navTab: { border: "none", background: "transparent", padding: "8px 18px", borderRadius: 9, fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,.6)", cursor: "pointer" },
  navTabActive: { background: GOLD, color: INK },
  demoBar: { background: "#fff6e6", color: "#8a6a2a", textAlign: "center", fontSize: 12.5, padding: "8px 16px", borderBottom: "1px solid #f0e2c4" },
  main: { maxWidth: 1080, margin: "0 auto", padding: "28px 20px 40px" },
  footer: { textAlign: "center", padding: 20, fontSize: 12.5, color: "#9a9488", borderTop: "1px solid #ece8e0" },

  heroBlock: { textAlign: "center", marginBottom: 26 },
  heroTitle: { fontSize: 26, fontWeight: 800, letterSpacing: "-.02em", marginBottom: 6 },
  heroMeta: { fontSize: 13.5, color: "#9a9488" },

  clientGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 20, alignItems: "start" },
  card: { background: "#fff", borderRadius: 18, padding: 24, border: "1px solid #ece8e0", boxShadow: "0 2px 16px rgba(0,0,0,.04)", transition: "opacity .2s" },
  cardCenter: { background: "#fff", borderRadius: 18, padding: 28, border: "1px solid #ece8e0", boxShadow: "0 2px 16px rgba(0,0,0,.04)", maxWidth: 460, margin: "0 auto" },
  stepHead: { display: "flex", alignItems: "center", gap: 10, fontSize: 16, fontWeight: 700, marginBottom: 18, letterSpacing: "-.01em" },
  stepNum: { width: 26, height: 26, borderRadius: 8, background: INK, color: GOLD, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13.5, fontWeight: 700, flex: "0 0 auto" },

  consGrid: { display: "flex", flexDirection: "column", gap: 11 },
  consBtn: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3, padding: "15px 16px", borderRadius: 14, border: "1.5px solid #e6e1d6", background: "#fff", cursor: "pointer", textAlign: "left", transition: "all .15s", position: "relative" },
  consBtnActive: { borderColor: INK, background: "#fbf8f2", boxShadow: `0 0 0 3px ${GOLD}44` },
  consAvatar: { position: "absolute", top: 14, right: 14, width: 34, height: 34, borderRadius: "50%", background: "#efe9dd", color: "#8a6a3a", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15 },
  consName: { fontSize: 15.5, fontWeight: 700, paddingRight: 40 },
  consRole: { fontSize: 12.5, color: "#9a9488" },

  gradeGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11 },
  gradeBtn: { padding: "15px 10px", borderRadius: 13, border: "1.5px solid #e6e1d6", background: "#fff", fontSize: 15, fontWeight: 700, color: "#4a4636", cursor: "pointer", transition: "all .15s" },
  gradeBtnActive: { background: INK, color: "#fff", borderColor: INK, boxShadow: `0 0 0 3px ${GOLD}55` },

  dayList: { display: "flex", gap: 9, overflowX: "auto", paddingBottom: 6 },
  dayBtn: { flex: "0 0 auto", width: 78, padding: "12px 6px", borderRadius: 14, border: "1.5px solid #ece8e0", background: "#fff", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
  dayBtnActive: { borderColor: INK, background: "#fbf8f2", boxShadow: `0 0 0 3px ${GOLD}44` },
  dayDow: { fontSize: 12, color: "#9a9488", fontWeight: 600 },
  dayNum: { fontSize: 22, fontWeight: 700, lineHeight: 1.1 },
  dayMon: { fontSize: 11, color: "#9a9488" },
  dayFree: { fontSize: 10.5, fontWeight: 600, marginTop: 3 },

  legend: { display: "flex", gap: 16, fontSize: 12, color: "#9a9488", marginBottom: 14, flexWrap: "wrap" },
  dot: { width: 11, height: 11, borderRadius: 4, display: "inline-block", marginRight: 5, verticalAlign: "-1px" },
  slotGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(76px,1fr))", gap: 9 },
  slot: { padding: "11px 0", borderRadius: 11, border: "1.5px solid #d8d2c6", background: "#fff", fontSize: 14.5, fontWeight: 600, color: INK, cursor: "pointer" },
  slotActive: { background: INK, color: GOLD, borderColor: INK },
  slotDis: { background: "#eee8dd", color: "#c4bdae", borderColor: "#eee8dd", cursor: "not-allowed", textDecoration: "line-through" },

  lab: { display: "block", fontSize: 13, fontWeight: 600, color: "#6b665a", marginBottom: 14 },
  subLabel: { fontSize: 13, fontWeight: 600, color: "#6b665a", margin: "4px 0 10px" },
  input: { width: "100%", boxSizing: "border-box", marginTop: 6, padding: "11px 13px", borderRadius: 11, border: "1.5px solid #e4e0d8", fontSize: 14.5, color: INK, background: "#fdfcfa", outline: "none" },
  btnPrimary: { width: "100%", padding: 13, borderRadius: 12, border: "none", background: INK, color: GOLD, fontSize: 15, fontWeight: 700, cursor: "pointer" },
  btnGhost: { width: "100%", padding: 12, borderRadius: 12, border: "1.5px solid #e4e0d8", background: "#fff", color: INK, fontSize: 14.5, fontWeight: 600, cursor: "pointer", marginTop: 8 },
  btnWhatsapp: { display: "flex", alignItems: "center", justifyContent: "center", gap: 9, width: "100%", boxSizing: "border-box", padding: 14, borderRadius: 12, border: "none", background: "#25D366", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", textDecoration: "none", marginBottom: 8 },
  waIcon: { fontSize: 18, transform: "rotate(0deg)" },
  errBox: { background: "#fdecec", color: "#c0392b", padding: "9px 12px", borderRadius: 10, fontSize: 13, fontWeight: 500, margin: "0 0 12px" },
  empty: { color: "#9a9488", fontSize: 14, lineHeight: 1.5 },

  successIcon: { width: 56, height: 56, borderRadius: "50%", background: "#e6f6ee", color: "#0a7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, margin: "0 auto 16px", fontWeight: 700 },
  successTitle: { textAlign: "center", fontSize: 22, fontWeight: 700, margin: "0 0 20px" },
  confBox: { background: "#faf8f3", borderRadius: 14, padding: "6px 16px", marginBottom: 16 },
  confRow: { display: "flex", justifyContent: "space-between", gap: 16, padding: "11px 0", borderBottom: "1px solid #ece8e0" },
  confLabel: { fontSize: 13, color: "#9a9488", flex: "0 0 auto" },
  confValue: { fontSize: 14, fontWeight: 600, textAlign: "right" },
  confNote: { fontSize: 13, color: "#9a9488", textAlign: "center", lineHeight: 1.5, marginBottom: 16 },
  cancelHint: { fontSize: 12.5, color: "#6b665a", textAlign: "center", lineHeight: 1.5, marginTop: 16, padding: "12px 14px", background: "#faf8f3", borderRadius: 11, border: "1px solid #ece8e0" },
  contractQ: { fontSize: 14, color: "#4a4636", lineHeight: 1.45, marginBottom: 14 },
  priceBox: { marginTop: 14, padding: "12px 14px", borderRadius: 11, fontSize: 14, textAlign: "center" },
  priceFree: { background: "#e6f6ee", color: "#0a7a4a", border: "1px solid #b9e6cd" },
  paidBlock: { marginTop: 16, padding: "16px", borderRadius: 12, background: "#fff4e6", border: "1px solid #f0dcb4" },
  paidTitle: { fontSize: 15.5, fontWeight: 800, color: "#9a6a1a", marginBottom: 8 },
  paidText: { fontSize: 13.5, color: "#7a5a2a", lineHeight: 1.5, marginBottom: 14 },

  consTabs: { display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" },
  consTab: { padding: "9px 18px", borderRadius: 11, border: "1.5px solid #ece8e0", background: "#fff", fontSize: 14, fontWeight: 700, color: "#9a9488", cursor: "pointer" },
  consTabActive: { background: GOLD, color: INK, borderColor: GOLD },
  adminTabs: { display: "flex", gap: 8, marginBottom: 18 },
  subTab: { padding: "9px 18px", borderRadius: 11, border: "1.5px solid #ece8e0", background: "#fff", fontSize: 14, fontWeight: 600, color: "#9a9488", cursor: "pointer" },
  subTabActive: { background: INK, color: GOLD, borderColor: INK },
  bookRow: { display: "flex", alignItems: "center", gap: 14, padding: 13, borderRadius: 13, background: "#faf8f3", border: "1px solid #ece8e0" },
  bookWhen: { textAlign: "center", flex: "0 0 auto", minWidth: 48 },
  bookDate: { fontSize: 12.5, color: "#9a9488", fontWeight: 600 },
  bookTime: { fontSize: 17, fontWeight: 700, color: INK },
  bookName: { fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  gradeTag: { fontSize: 11.5, fontWeight: 700, color: "#8a6a3a", background: `${GOLD}33`, padding: "2px 8px", borderRadius: 7 },
  bookPhone: { fontSize: 13.5, color: "#8a6a3a", textDecoration: "none", fontWeight: 600 },
  bookTopic: { fontSize: 13, color: "#6b665a", marginTop: 3, lineHeight: 1.4 },
  cancelBtn: { width: 32, height: 32, borderRadius: 9, border: "1.5px solid #f0d4d0", background: "#fff", color: "#c0392b", fontSize: 14, cursor: "pointer", flex: "0 0 auto" },

  dowRow: { display: "flex", gap: 7, marginBottom: 20, flexWrap: "wrap" },
  dowChip: { width: 44, height: 44, borderRadius: 11, border: "1.5px solid #e4e0d8", background: "#fff", fontSize: 13.5, fontWeight: 700, color: "#bbb", cursor: "pointer" },
  dowChipOn: { background: INK, color: GOLD, borderColor: INK },
  hintBox: { fontSize: 12.5, color: "#9a9488", background: "#faf8f3", padding: "10px 13px", borderRadius: 10, margin: "4px 0 18px", lineHeight: 1.5 },
  savedNote: { textAlign: "center", color: "#0a7", fontSize: 13.5, fontWeight: 600, marginTop: 12 },
  office: { maxWidth: 560, margin: "8px auto 0", padding: "0 20px" },
  officeHead: { fontSize: 20, fontWeight: 800, letterSpacing: "-.02em", marginBottom: 16, textAlign: "center" },
  officeGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 18, alignItems: "stretch" },
  mapWrap: { position: "relative", borderRadius: 14, overflow: "hidden", border: "1px solid #ece8e0", height: 150, background: "#eee", display: "block", textDecoration: "none", marginTop: 14 },
  mapFrame: { width: "100%", height: "100%", objectFit: "cover", border: "none", display: "block" },
  mapOverlay: { position: "absolute", bottom: 10, right: 10, background: INK, color: GOLD, fontSize: 12.5, fontWeight: 700, padding: "7px 12px", borderRadius: 9 },
  officeInfo: { background: "#fff", borderRadius: 18, padding: 24, border: "1px solid #ece8e0", boxShadow: "0 2px 16px rgba(0,0,0,.04)" },
  officeAddrLabel: { fontSize: 12.5, fontWeight: 700, color: "#9a9488", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 },
  officeAddr: { fontSize: 16, fontWeight: 600, lineHeight: 1.4, marginBottom: 14 },
  routeBtn: { display: "inline-block", padding: "10px 16px", borderRadius: 11, background: INK, color: GOLD, fontSize: 14, fontWeight: 700, textDecoration: "none" },
  waContact: { display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", borderRadius: 12, background: "#f3faf5", border: "1px solid #d6efdd", textDecoration: "none", color: INK, marginTop: 9 },
  waContactIcon: { width: 36, height: 36, borderRadius: "50%", background: "#25D366", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flex: "0 0 auto" },
  waContactNum: { fontSize: 13.5, color: "#1a8a45", fontWeight: 600 },
  loadWrap: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: PAPER },
  spinner: { width: 34, height: 34, border: "3px solid #e4e0d8", borderTopColor: INK, borderRadius: "50%", animation: "spin .7s linear infinite" },
};
const globalCss = `*{-webkit-tap-highlight-color:transparent} button:active{transform:scale(.97)} input:focus,select:focus,textarea:focus{border-color:${INK}!important;box-shadow:0 0 0 3px ${GOLD}44} ::-webkit-scrollbar{height:6px;width:6px}::-webkit-scrollbar-thumb{background:#d8d2c6;border-radius:3px}`;
const spinCss = `@keyframes spin{to{transform:rotate(360deg)}}`;

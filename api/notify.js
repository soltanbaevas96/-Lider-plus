// Серверная функция Vercel: отправляет уведомление о записи в Telegram.
// Токен бота и chat id хранятся в переменных окружения (не в коде сайта).

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });

  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHATS = {
    symbat: process.env.TG_CHAT_SYMBAT,
    aigerim: process.env.TG_CHAT_AIGERIM,
  };
  if (!TOKEN) return res.status(200).json({ ok: false, skip: "no token" });

  try {
    const { consultant_id, text } = req.body || {};
    const chatId = CHATS[consultant_id];
    if (!chatId || !text) return res.status(200).json({ ok: false, skip: "no chat" });

    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    const data = await r.json();
    return res.status(200).json({ ok: !!data.ok });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e) });
  }
}

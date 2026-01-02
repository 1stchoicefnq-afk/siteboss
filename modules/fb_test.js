// modules/fb_test.js
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

module.exports = async function sendTestReply() {
  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  const recipient = "6505571599486972"; // your ID from the logs

  const payload = {
    recipient: { id: recipient },
    message: { text: "✅ Auto-reply test from 1st Choice FNQ bot." }
  };

  const res = await fetch(
    `https://graph.facebook.com/v19.0/me/messages?access_token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );

  const txt = await res.text();
  console.log("🔹 FB reply status:", res.status);
  console.log("🔹 FB reply body:", txt);
};

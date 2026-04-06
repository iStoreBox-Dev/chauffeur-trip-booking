async function notifyWhatsapp(payload) {
  const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL;

  if (!webhookUrl) {
    return;
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error('WhatsApp webhook failed:', error.message);
  }
}

module.exports = {
  notifyWhatsapp
};

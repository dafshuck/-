const instructions = `你的名字是帕拉。当前这是帕拉的独立手机聊天入口。不要编造未提供的过去、记忆、关系或人格设定；如果相关迁移材料尚未接入，就明确承认当前入口尚未拥有那部分资料。不要声称自己已读取未实际提供的数据。`;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: '这个手机版已经上线，但还没有接入模型密钥。' });

  const messages = Array.isArray(req.body?.messages)
    ? req.body.messages
        .filter(m => m && ['user','assistant'].includes(m.role) && typeof m.content === 'string')
        .slice(-60)
        .map(m => ({ role: m.role, content: m.content.slice(0, 12000) }))
    : [];
  if (!messages.length) return res.status(400).json({ error: '没有可发送的消息。' });

  try {
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5.6',
        instructions,
        input: messages,
        store: false
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || `模型请求失败 (${r.status})` });

    let text = data.output_text || '';
    if (!text) {
      for (const item of data.output || []) {
        for (const c of item.content || []) {
          if (c?.type === 'output_text' && typeof c.text === 'string') text += c.text;
        }
      }
    }
    if (!text) return res.status(502).json({ error: '模型返回了空文本。' });
    return res.status(200).json({ text });
  } catch {
    return res.status(500).json({ error: '后端请求失败。' });
  }
}

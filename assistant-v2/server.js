import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { GoogleGenAI } from '@google/genai';

const app = express();
const port = Number(process.env.PORT || 3000);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/', rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use(express.static('.'));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, configured: Boolean(process.env.GEMINI_API_KEY) });
});

app.post('/api/chat', async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'Gemini API key is not configured on the server.' });
    }
    const contents = req.body?.contents;
    if (!Array.isArray(contents) || contents.length === 0 || contents.length > 21) {
      return res.status(400).json({ error: 'Please send a valid conversation (maximum 20 previous messages plus the latest).' });
    }
    const safeContents = contents.map((item) => {
      if (!['user', 'model'].includes(item?.role) || !Array.isArray(item.parts)) {
        throw new Error('Invalid conversation format.');
      }
      const text = item.parts.map(p => String(p?.text || '')).join('\n').slice(0, 12000);
      return { role: item.role, parts: [{ text }] };
    });
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const result = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-flash-latest',
      contents: safeContents,
      config: {
        systemInstruction: 'You are MAHI AI, a helpful creative assistant for MAHI AI CREATIVE STUDIO. Reply in the language the user uses, especially natural Tamil or Tamil-English when appropriate. Help with filmmaking, storyboards, music concepts, image prompts, website development, coding and YouTube content. Be clear, practical and honest. Never claim to have generated media or deployed code unless that actually happened.',
        maxOutputTokens: 1800,
        temperature: 0.8
      }
    });
    const reply = result.text;
    if (!reply) return res.status(502).json({ error: 'Gemini returned an empty response. Please try again.' });
    res.json({ reply });
  } catch (error) {
    console.error('Gemini request failed:', error?.message || error);
    res.status(500).json({ error: 'AI request failed. Check your API key, model access and server logs.' });
  }
});

app.listen(port, () => console.log(`MAHI AI V2 running on http://localhost:${port}`));

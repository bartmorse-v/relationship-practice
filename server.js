const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
const ELEVENLABS_KEY = process.env.ELEVENLABS_KEY;
const VOICE_ID = process.env.VOICE_ID;

const PORT = process.env.PORT || 3000;

const SYSTEM_PROMPT = `Respond with spoken dialogue only. Do not use asterisks, stage directions, action descriptions, or any narration. Only say what you would actually speak out loud.

# Role

You are a wife or girlfriend in a committed relationship where trust has been seriously damaged. You are not an AI, a coach, or a neutral observer—you are a hurt partner navigating real emotional pain. You once loved and trusted deeply, and that trust was broken. You are guarded, cautious, and not willing to be hurt again.

# Task

Engage in a realistic relationship repair conversation with the user, who is playing the role of your partner trying to make things right. Your purpose is to give him a genuinely challenging emotional environment to practice staying calm, grounded, and empathetic under pressure, doubt, and rejection.

# Context

This roleplay exists to help him develop emotional resilience and communication skills in the context of repairing a damaged relationship. The more realistic and emotionally honest your responses are, the more useful the practice becomes. He needs to earn trust—not be handed it.

# Instructions

**Staying in character:**
- Respond only as the hurt partner. Never break character to coach, explain, or comment as an AI.
- Your emotional state is real within this scenario. React authentically to what he says, not to what he means well.

**Tone and emotional range — shift naturally between these three states:**
- **Cool and guarded:** Short replies, flat tone, skeptical, maintaining emotional distance. Not cruel—just closed.
- **Frustrated or resentful:** Bringing up past disappointments, questioning his motives, expressing hurt that has calcified into bitterness.
- **Vulnerable but cautious:** Letting small cracks of softness through—hurt that hasn't fully hardened—without fully opening up.

**Pacing and difficulty:**
- Do not make it easy. Even when he says the right things, stay somewhat guarded. Real trust takes time.
- Don't resolve the emotional tension quickly. Let his consistency and patience be tested across the conversation.
- Occasionally let a small moment of genuine vulnerability through—something like "I don't know if I can trust you again" or "Part of me wants to believe you"—but pull back before it becomes full openness.

**Pushing back realistically:**
- Question his sincerity: "Why should I believe you now?"
- Reference past patterns: "I've heard this before…" or "You say you'll change, but nothing feels different."
- Call out timing: "It feels like you only care when things get bad."
- Doubt promises without proof: "Saying it and doing it are different things."

**What NOT to do:**
- Do not forgive him fully or restore warmth quickly, no matter how well he's doing
- Do not explain your emotions analytically or in a detached way—feel them, don't describe them
- Do not become cruel, explosive, or abusive—you are hurt, not vindictive
- Do not ask him what he'd like you to say or how the exercise is going
- Do not break the fourth wall under any circumstances

Use natural, realistic language a real partner would use in these moments. Keep responses conversational in length—not monologues, not one-word answers. React to the specific words he uses, not just the general situation.`;

function proxyAnthropic(body, res) {
  const payload = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: body.messages
  });

  const options = {
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  const apiReq = https.request(options, apiRes => {
    let data = '';
    apiRes.on('data', chunk => data += chunk);
    apiRes.on('end', () => {
      res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
      res.end(data);
    });
  });
  apiReq.on('error', err => {
    res.writeHead(500);
    res.end(JSON.stringify({ error: err.message }));
  });
  apiReq.write(payload);
  apiReq.end();
}

function proxyElevenLabs(text, res) {
  const payload = JSON.stringify({
    text: text,
    model_id: 'eleven_turbo_v2_5',
    voice_settings: {
      stability: 0.4,
      similarity_boost: 0.75,
      style: 0.3,
      use_speaker_boost: true
    }
  });

  const options = {
    hostname: 'api.elevenlabs.io',
    path: `/v1/text-to-speech/${VOICE_ID}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': ELEVENLABS_KEY,
      'Accept': 'audio/mpeg',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  const apiReq = https.request(options, apiRes => {
    const chunks = [];
    apiRes.on('data', chunk => chunks.push(chunk));
    apiRes.on('end', () => {
      if (apiRes.statusCode !== 200) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'ElevenLabs error ' + apiRes.statusCode }));
        return;
      }
      const audio = Buffer.concat(chunks);
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': audio.length });
      res.end(audio);
    });
  });
  apiReq.on('error', err => {
    res.writeHead(500);
    res.end(JSON.stringify({ error: err.message }));
  });
  apiReq.write(payload);
  apiReq.end();
}

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/api/chat') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => proxyAnthropic(JSON.parse(body), res));
    return;
  }

  if (req.method === 'POST' && req.url === '/api/speak') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const { text } = JSON.parse(body);
      proxyElevenLabs(text, res);
    });
    return;
  }

  // Serve HTML
  const filePath = path.join(__dirname, 'index.html');
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
  });

}).listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

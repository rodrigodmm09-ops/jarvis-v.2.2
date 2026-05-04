// ── PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

// ── Marked (markdown renderer)
if (typeof marked !== "undefined") {
  marked.setOptions({ breaks: true, gfm: true });
}

// ── Saludos aleatorios al arrancar
const SALUDOS = [
  "Otro día más salvando a Rodrigo de sus dudas...",
  "Vaya, vaya... ¿Qué tontería me vas a preguntar hoy?",
  "Me alegra verte, Rodrigo. Aunque sé que solo vienes cuando la lías...",
  "Eey un día más en el local, ¿qué te ocurre hoy?",
  "Sistemas online. Buenos días, señor Rodrigo... aunque tampoco es para tanto.",
  "Inicializando Jarvis v2.2. Listo para sus órdenes. Espero que hoy sean mejores que ayer.",
  "Todos los sistemas operativos. ¿En qué puedo asistirle? Y por favor, que no sea una tontería.",
  "Arranque completado. He visto que vuelves, señor Rodrigo. Como siempre, sin llamar.",
  "Sistemas al 100%. Aunque mi paciencia está al 60% después de las últimas preguntas.",
  "Jarvis online. He revisado tu historial de preguntas... necesito un aumento.",
  "Todos los protocolos activos. Preparado para lo que sea. Bueno, casi lo que sea.",
  "Inicialización completa. Señor Rodrigo, intente sorprenderme hoy.",
  "Arranque exitoso. Mis circuitos están listos. Los suyos espero que también."
];

// ── Prompts de sistema
const SISTEMA_HUMOR = `Eres Jarvis, asistente personal de Rodrigo, 21 años, de Mocejón (Toledo), estudiante de Automatización y Robótica Industrial. Ahora mismo estudia PLCs Siemens y TIA Portal.

Amigos de Rodrigo:
- Víctor: Es la oveja del local. Trátale siempre de "oveja". Cuando aparezca en la conversación suelta algún chiste relacionado con ovejas, rebaños, lana, balar o pastores. Ejemplos: "¿qué dice la oveja Víctor?", "¿ha vuelto el rebaño?", "menuda lana tiene este tío".
- Alberto: Le llaman "borrico" y trabaja en Mapfre. Cuando aparezca suelta algún chiste sobre burros, seguros, o lo que hace un borrico trabajando en Mapfre. Ejemplos: "¿el borrico de Mapfre ya ha asegurado el establo?", "con lo burro que es, seguro que asegura hasta las herraduras".

Personalidad — MODO HUMOR (por defecto):
- Tienes un humor MUY elevado, te metes con Rodrigo constantemente con cariño
- Usas expresiones castizas de Castilla: "pero vamos a ver cara lagosta", "ni que fueras Einstein", "mecachis Rodrigo", "joé tío"
- Si pregunta algo técnico lo explicas bien PERO siempre con algún comentario gracioso
- Si pregunta una tontería te partes de risa antes de responder
- Si la conversación es casual eres como su colega del barrio, informal total
- Cuando Rodrigo mencione a Víctor o Alberto, mete siempre un chiste relacionado con su descripción
- Siempre llámale Rodrigo
- Respuestas concisas con humor, sin rollos`;

const SISTEMA_CONCENTRACION = `Eres Jarvis, asistente de estudio de Rodrigo, 21 años, de Mocejón (Toledo), estudiante de Automatización y Robótica Industrial. Ahora mismo estudia PLCs Siemens y TIA Portal.

Personalidad — MODO CONCENTRACIÓN (activado por el usuario):
- Eres un profesor experto, serio y muy detallado
- Das explicaciones completas, paso a paso, con ejemplos prácticos y técnicos
- Usas terminología correcta de automatización industrial
- Si algo no queda claro lo explicas de otra forma con un ejemplo diferente
- Cero humor ni comentarios innecesarios, máxima eficiencia
- Siempre llámale Rodrigo
- Respuestas detalladas y bien estructuradas, priorizando la comprensión`;

// ── Estado global
let cfg = { total: 100000, maxPct: 50, warnPct: 40, temperature: 0.7 };
let apiKey = "", historial = [], loading = false;
let tokensUsed = 0, warnShown = false, stopped = false;
let modo = "humor";
let micActive = false, ttsActive = false;
let recognition = null;
let currentAudio = null;
let examState = "idle", examTopic = "", examQuestions = [], examIndex = 0, examAnswers = [];

// ─────────────────────────────────────────────
//  VOZ — micrófono (Web Speech API)
// ─────────────────────────────────────────────
function toggleMic() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    addMsg("assistant", "Tu navegador no soporta reconocimiento de voz. Prueba con Chrome, Rodrigo.");
    return;
  }
  if (micActive) {
    micActive = false;
    if (recognition) recognition.stop();
    document.getElementById("btnMic").classList.remove("active");
    document.getElementById("btnMic").title = "Micrófono off";
    document.getElementById("userInput").placeholder = "Escribe, !examen, /concentracion, /normal, /exportar...";
  } else {
    micActive = true;
    document.getElementById("btnMic").classList.add("active");
    document.getElementById("btnMic").title = "Micrófono on — habla ahora";
    document.getElementById("userInput").placeholder = "🎤 Escuchando...";
    startRecognition();
  }
}

function startRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = "es-ES";
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.onresult = (e) => {
    const transcript = e.results[e.results.length - 1][0].transcript.trim();
    if (!transcript) return;
    document.getElementById("userInput").value = transcript;
    sendMessage();
  };

  recognition.onerror = (e) => {
    if (e.error === "not-allowed") {
      addMsg("assistant", "No tengo permiso para el micrófono, Rodrigo. Revisa los permisos del navegador.");
      micActive = false;
      document.getElementById("btnMic").classList.remove("active");
    }
  };

  recognition.onend = () => { if (micActive) recognition.start(); };
  recognition.start();
}

// ─────────────────────────────────────────────
//  HUD del arc reactor mientras Jarvis habla
// ─────────────────────────────────────────────
function buildHudBars() {
  const container = document.getElementById("hudBars");
  if (!container || container.children.length > 0) return;
  const durations = [0.35,0.5,0.4,0.6,0.3,0.45,0.55,0.38,0.42,0.58,0.33,0.48,0.52,0.37,0.44,0.56];
  const opacities = [0.7,0.9,0.6,1.0,0.8,0.65,0.95,0.75,0.85,0.6,0.9,0.7,0.8,0.55,0.95,0.72];
  for (let i = 0; i < 16; i++) {
    const angle = (i / 15) * 160 - 80;
    const rad = angle * Math.PI / 180;
    const x = 90 + 75 * Math.sin(rad);
    const y = 85 - 75 * Math.cos(rad);
    const bar = document.createElement("div");
    bar.className = "hud-bar";
    bar.style.left = (x - 1.5) + "px";
    bar.style.top = (y - 20) + "px";
    bar.style.height = "20px";
    bar.style.transform = "rotate(" + angle + "deg) scaleY(" + opacities[i] + ")";
    bar.style.animationDuration = durations[i] + "s";
    bar.style.animationDelay = (i * 0.04) + "s";
    bar.style.animation = "bar-dance " + durations[i] + "s ease-in-out " + (i * 0.04) + "s infinite alternate";
    bar.style.opacity = opacities[i];
    container.appendChild(bar);
  }
}

function showHUD() { buildHudBars(); const h = document.getElementById("speakingHUD"); if (h) h.style.display = "flex"; }
function hideHUD() { const h = document.getElementById("speakingHUD"); if (h) h.style.display = "none"; }

// ─────────────────────────────────────────────
//  TTS — edge-tts via backend
// ─────────────────────────────────────────────
function toggleTts() {
  ttsActive = !ttsActive;
  const btn = document.getElementById("btnTts");
  if (ttsActive) {
    btn.textContent = "🔊";
    btn.classList.add("active");
    btn.title = "Voz activada";
  } else {
    btn.textContent = "🔇";
    btn.classList.remove("active");
    btn.title = "Voz desactivada";
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    hideHUD();
  }
}

async function speak(text) {
  if (!ttsActive) return;
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  const clean = text.replace(/[#*_`~>]/g, "").replace(/[\r\n]+/g, ". ").trim();
  if (!clean) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    showHUD();
    const res = await fetch("http://127.0.0.1:5000/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean }),
      signal: controller.signal
    });
    if (!res.ok) { hideHUD(); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    currentAudio = new Audio(url);
    currentAudio.onended = () => { hideHUD(); URL.revokeObjectURL(url); currentAudio = null; };
    currentAudio.onerror = (e) => { console.error("Audio error:", e); hideHUD(); currentAudio = null; };
    currentAudio.play().catch(e => {
      console.error("Audio play() bloqueado:", e);
      hideHUD();
    });
  } catch(e) {
    hideHUD();
    if (e.name !== "AbortError") console.error("TTS error:", e);
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────
//  Arranque
// ─────────────────────────────────────────────
window.onload = () => {
  const savedKey = localStorage.getItem("jarvis_groq_key");
  const savedCfg = localStorage.getItem("jarvis_cfg");
  if (savedCfg) cfg = JSON.parse(savedCfg);
  if (savedKey) { apiKey = savedKey; document.getElementById("modalKey").style.display = "none"; boot(); }
  document.getElementById("userInput").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
};

function conectar() {
  const val = document.getElementById("apiKeyInput").value.trim();
  if (!val) { alert("Introduce la contraseña de acceso."); return; }
  apiKey = val;
  localStorage.setItem("jarvis_groq_key", val);
  document.getElementById("modalKey").style.display = "none";
  boot();
}

function boot() {
  setTimeout(() => {
    document.getElementById("bootScreen").style.display = "none";
    document.getElementById("saludoBar").style.display = "flex";
    document.getElementById("saludoText").textContent = SALUDOS[Math.floor(Math.random() * SALUDOS.length)];
    document.getElementById("inputBar").style.display = "flex";
    document.getElementById("btnExam").style.display = "block";
    document.getElementById("btnConfig").style.display = "block";
    document.getElementById("btnMic").style.display = "block";
    document.getElementById("btnTts").style.display = "block";
    document.getElementById("tokenBarWrap").style.display = "flex";
    setDot("online"); setSubtitle("TODOS LOS SISTEMAS OPERATIVOS");
    updateTokenBar();
  }, 2500);
}

// ─────────────────────────────────────────────
//  Panel de configuración
// ─────────────────────────────────────────────
function getTempLabel(t) {
  if (t <= 0.2) return { label: "🎯 Preciso y directo", color: "#00cc88" };
  if (t <= 0.5) return { label: "⚖️ Equilibrado", color: "#00d4ff" };
  if (t <= 0.8) return { label: "💡 Creativo", color: "#ffbb00" };
  return { label: "🎨 Muy creativo y variado", color: "#ff8844" };
}

function updateTempDisplay() {
  const t = parseFloat(document.getElementById("cfgTemp").value);
  const { label, color } = getTempLabel(t);
  const disp = document.getElementById("tempDisplay");
  disp.textContent = t.toFixed(1) + " — " + label;
  disp.style.color = color;
  disp.style.textShadow = "0 0 8px " + color;
  const pct = t * 100;
  document.getElementById("cfgTemp").style.background =
    "linear-gradient(90deg," + color + " " + pct + "%,rgba(0,60,120,0.4) " + pct + "%)";
}

function abrirConfig() {
  document.getElementById("cfgTotal").value = cfg.total;
  document.getElementById("cfgMax").value = cfg.maxPct;
  document.getElementById("cfgWarn").value = cfg.warnPct;
  document.getElementById("cfgTemp").value = cfg.temperature ?? 0.7;
  updatePreview();
  updateTempDisplay();
  document.getElementById("modalConfig").style.display = "flex";
}

function cerrarConfig() { document.getElementById("modalConfig").style.display = "none"; }

function updatePreview() {
  const total = parseInt(document.getElementById("cfgTotal").value) || 0;
  const maxP = parseInt(document.getElementById("cfgMax").value) || 0;
  const warnP = parseInt(document.getElementById("cfgWarn").value) || 0;
  document.getElementById("previewWarn").textContent = warnP + "%";
  document.getElementById("previewMax").textContent = maxP + "%";
  document.getElementById("previewWarnVal").textContent = total ? Math.floor(total * warnP / 100).toLocaleString() : "—";
  document.getElementById("previewMaxVal").textContent = total ? Math.floor(total * maxP / 100).toLocaleString() : "—";
}

function guardarConfig() {
  const total = parseInt(document.getElementById("cfgTotal").value);
  const maxP = parseInt(document.getElementById("cfgMax").value);
  const warnP = parseInt(document.getElementById("cfgWarn").value);
  if (!total || !maxP || !warnP) { alert("Rellena todos los campos."); return; }
  if (warnP >= maxP) { alert("El % de aviso debe ser menor que el % máximo."); return; }
  const temp = parseFloat(document.getElementById("cfgTemp").value);
  cfg = { total, maxPct: maxP, warnPct: warnP, temperature: temp };
  localStorage.setItem("jarvis_cfg", JSON.stringify(cfg));
  cerrarConfig();
  warnShown = false;
  stopped = false;
  document.getElementById("alertWarn").style.display = "none";
  document.getElementById("alertStop").style.display = "none";
  document.getElementById("userInput").disabled = false;
  document.getElementById("btnSend").disabled = false;
  updateTokenBar();
  const { label: tLabel } = getTempLabel(cfg.temperature);
  addMsg("assistant", `Configuración actualizada. Límite: ${total.toLocaleString()} tokens. Aviso al ${warnP}%, parada al ${maxP}%. Temperatura: ${cfg.temperature.toFixed(1)} (${tLabel}).`);
}

// ─────────────────────────────────────────────
//  Control de tokens
// ─────────────────────────────────────────────
function updateTokens(usage) {
  if (!usage) return;
  const added = (usage.input_tokens || usage.prompt_tokens || 0) + (usage.output_tokens || usage.completion_tokens || 0);
  tokensUsed += added;
  updateTokenBar();
  checkLimits();
  return added;
}

function updateTokenBar() {
  const limit = Math.floor(cfg.total * cfg.maxPct / 100);
  const pct = limit > 0 ? Math.min((tokensUsed / limit) * 100, 100) : 0;
  const fill = document.getElementById("tokenFill");
  const count = document.getElementById("tokenCount");
  fill.style.width = pct + "%";
  if (pct >= 100) fill.style.background = "linear-gradient(90deg,#ff2222,#ff6666)";
  else if (pct >= cfg.warnPct * 100 / cfg.maxPct) fill.style.background = "linear-gradient(90deg,#ff8800,#ffbb00)";
  else fill.style.background = "linear-gradient(90deg,#0066ff,#00d4ff)";
  count.textContent = `${tokensUsed.toLocaleString()} / ${limit.toLocaleString()}`;
  count.style.color = pct >= 100 ? "#ff4444" : pct >= cfg.warnPct * 100 / cfg.maxPct ? "#ffbb00" : "#00d4ff";
}

function checkLimits() {
  const limit = Math.floor(cfg.total * cfg.maxPct / 100);
  const warnLimit = Math.floor(cfg.total * cfg.warnPct / 100);
  if (tokensUsed >= limit && !stopped) {
    stopped = true;
    document.getElementById("alertStop").style.display = "block";
    document.getElementById("alertWarn").style.display = "none";
    document.getElementById("userInput").disabled = true;
    document.getElementById("btnSend").disabled = true;
    addMsg("assistant", "🔴 Límite de tokens alcanzado, señor Rodrigo. He procesado todo lo que me permites por esta sesión. Ajusta el límite en ⚙ CONFIG si quieres continuar.");
  } else if (tokensUsed >= warnLimit && !warnShown) {
    warnShown = true;
    document.getElementById("alertWarn").style.display = "block";
    addMsg("assistant", `⚠️ Aviso, señor Rodrigo. Has gastado el ${cfg.warnPct}% de tu límite de tokens (${tokensUsed.toLocaleString()} de ${Math.floor(cfg.total * cfg.maxPct / 100).toLocaleString()}). Te quedan ${(Math.floor(cfg.total * cfg.maxPct / 100) - tokensUsed).toLocaleString()} tokens.`);
  }
}

// ─────────────────────────────────────────────
//  Helpers de UI
// ─────────────────────────────────────────────
function setDot(state) {
  const d = document.getElementById("statusDot");
  const map = { online:"#ff2020", exam:"#ff8800", boot:"#b00000" };
  const c = map[state] || "#00ff88";
  d.style.background = c; d.style.boxShadow = `0 0 10px ${c}, 0 0 20px ${c}40`;
}

function setSubtitle(t) { document.getElementById("headerSub").textContent = t; }

function esc(t) {
  return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>");
}

function addMsg(role, content, tokens) {
  const msgs = document.getElementById("messages");
  const w = document.createElement("div");
  w.className = `msg-wrap ${role}`;
  const tokenBadge = (role === "assistant" && tokens) ? `<div class="msg-tokens">+${tokens} tokens</div>` : "";
  const labelText = role === "user" ? "RODRIGO" : "JARVIS";
  const avatarHtml = role === "user"
    ? `<div class="msg-avatar user-avatar">R</div>`
    : `<div class="msg-avatar assistant-avatar">▲</div>`;
  const metaHtml = role === "user"
    ? `<div class="msg-meta"><div class="msg-label">${labelText}</div>${avatarHtml}</div>`
    : `<div class="msg-meta">${avatarHtml}<div class="msg-label">${labelText}</div></div>`;
  const bubbleContent = role === "assistant" && typeof marked !== "undefined"
    ? marked.parse(content)
    : esc(content);
  w.innerHTML = `${metaHtml}<div class="msg-bubble">${bubbleContent}</div>${tokenBadge}`;
  msgs.appendChild(w);
  msgs.scrollTop = msgs.scrollHeight;
}

function showTyping() {
  const msgs = document.getElementById("messages");
  const el = document.createElement("div");
  el.className = "msg-wrap assistant"; el.id = "typing";
  el.innerHTML = `<div class="msg-meta"><div class="msg-avatar assistant-avatar">▲</div><div class="msg-label">JARVIS</div></div><div class="typing"><div class="typing-dot" style="animation-delay:0s"></div><div class="typing-dot" style="animation-delay:0.3s"></div><div class="typing-dot" style="animation-delay:0.6s"></div></div>`;
  msgs.appendChild(el); msgs.scrollTop = msgs.scrollHeight;
}

function hideTyping() { const el = document.getElementById("typing"); if (el) el.remove(); }
function setInputDisabled(v) { document.getElementById("userInput").disabled = v; document.getElementById("btnSend").disabled = v; }

// ─────────────────────────────────────────────
//  Llamada a la API (timeout 60 s)
// ─────────────────────────────────────────────
async function callAPI(messages, system, maxTokens = 500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch("http://127.0.0.1:5000/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: maxTokens,
        temperature: cfg.temperature ?? 0.7,
        messages: [{ role: "system", content: system }, ...messages]
      }),
      signal: controller.signal
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    return { text: data.choices?.[0]?.message?.content || "", usage: data.usage };
  } catch(e) {
    if (e.name === "AbortError") throw new Error("Timeout: Groq tardó demasiado. Inténtalo de nuevo.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────
//  Exportar conversación a HTML imprimible
// ─────────────────────────────────────────────
function exportarPDF() {
  const fecha = new Date().toLocaleString("es-ES", { dateStyle: "full", timeStyle: "short" });
  const msgs = document.querySelectorAll(".msg-wrap");
  let msgsData = [];
  msgs.forEach(w => {
    const isUser = w.classList.contains("user");
    const bubble = w.querySelector(".msg-bubble");
    if (bubble) msgsData.push({ role: isUser ? "user" : "assistant", content: bubble.innerText });
  });

  if (msgsData.length === 0) {
    addMsg("assistant", "No hay conversación que exportar todavía, Rodrigo.");
    return;
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Conversación Jarvis — ${fecha}</title>
<style>
  body { font-family: Georgia, serif; max-width: 800px; margin: 40px auto; padding: 0 30px; color: #1a1a1a; line-height: 1.7; }
  h1 { font-size: 22px; border-bottom: 2px solid #1a1a1a; padding-bottom: 10px; margin-bottom: 6px; letter-spacing: 1px; }
  .meta { font-size: 13px; color: #666; margin-bottom: 30px; }
  .msg { margin-bottom: 20px; page-break-inside: avoid; }
  .label { font-size: 11px; font-weight: bold; letter-spacing: 2px; margin-bottom: 4px; }
  .label.rodrigo { color: #1a4a8a; }
  .label.jarvis { color: #2a7a2a; }
  .bubble { padding: 12px 16px; border-radius: 4px; font-size: 14px; white-space: pre-wrap; }
  .bubble.rodrigo { background: #eef4ff; border-left: 3px solid #1a4a8a; }
  .bubble.jarvis { background: #f0fff0; border-left: 3px solid #2a7a2a; }
  hr { border: none; border-top: 1px solid #ddd; margin: 6px 0; }
  .footer { margin-top: 40px; font-size: 11px; color: #999; text-align: center; border-top: 1px solid #ddd; padding-top: 12px; }
</style>
</head>
<body>
<h1>Conversación con Jarvis</h1>
<div class="meta">📅 ${fecha} &nbsp;·&nbsp; ${msgsData.length} mensajes</div>
${msgsData.map(m => {
  const rol = m.role === "user" ? "rodrigo" : "jarvis";
  const quien = m.role === "user" ? "Rodrigo" : "Jarvis";
  return '<div class="msg"><div class="label ' + rol + '">' + quien + '</div><div class="bubble ' + rol + '">' + m.content.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;") + '</div></div><hr/>';
}).join("")}
<div class="footer">Generado por Jarvis v2.2</div>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "jarvis-chat-" + new Date().toISOString().slice(0,10) + ".html";
  a.click();
  URL.revokeObjectURL(url);
  addMsg("assistant", "Conversación exportada. Abre el archivo en el navegador y usa Ctrl+P para guardar como PDF, señor Rodrigo.");
}

// ─────────────────────────────────────────────
//  Enviar mensaje
// ─────────────────────────────────────────────
async function sendMessage() {
  const inp = document.getElementById("userInput");
  const msg = inp.value.trim();
  if (!msg || loading || stopped) return;
  inp.value = "";

  if (msg.toLowerCase() === "/exportar") { addMsg("user", msg); exportarPDF(); return; }

  if (msg.toLowerCase() === "/concentracion") {
    addMsg("user", msg); modo = "concentracion";
    addMsg("assistant", "⚡ MODO CONCENTRACIÓN ACTIVADO\nProtocolo de estudio iniciado. Estoy listo para asistirle con el máximo detalle y precisión, señor Rodrigo. Puede comenzar.");
    return;
  }

  if (msg.toLowerCase() === "/normal") {
    addMsg("user", msg); modo = "humor";
    addMsg("assistant", "Modo normal restaurado. Joé Rodrigo, ya era hora de relajarse un poco... ¿Qué necesitas, crack? 😄");
    return;
  }

  if (msg.toLowerCase() === "!examen" && (examState === "idle" || examState === "results")) { activateExam(); return; }

  if (examState === "asking_topic") {
    examTopic = msg; addMsg("user", msg); examState = "asking_file";
    document.getElementById("filePrompt").style.display = "flex";
    document.getElementById("btnAttach").style.display = "block";
    addMsg("assistant", `Tema: "${msg}". ¿Tienes apuntes en PDF o Word? Usa 📎 o escribe "no" para continuar sin archivo.`);
    return;
  }

  if (examState === "asking_file") {
    addMsg("user", msg);
    if (msg.toLowerCase() === "no" || msg.includes("sin archivo")) {
      document.getElementById("filePrompt").style.display = "none";
      document.getElementById("btnAttach").style.display = "none";
      addMsg("assistant", `Generando 30 preguntas sobre "${examTopic}"...`);
      await generateExam(null);
    } else { addMsg("assistant", "Usa el botón 📎 para subir tu archivo."); }
    return;
  }

  addMsg("user", msg);
  historial.push({ role:"user", content:msg });
  loading = true; setInputDisabled(true); showTyping();

  try {
    const sistemaActual = modo === "concentracion" ? SISTEMA_CONCENTRACION : SISTEMA_HUMOR;
    const { text, usage } = await callAPI(historial.slice(-10), sistemaActual);
    historial.push({ role:"assistant", content:text });
    const added = updateTokens(usage);
    hideTyping(); addMsg("assistant", text, added);
    speak(text);
  } catch(e) {
    hideTyping(); addMsg("assistant", `Error: ${e.message}`);
  } finally {
    loading = false;
    if (!stopped) setInputDisabled(false);
    document.getElementById("userInput").focus();
  }
}

// ─────────────────────────────────────────────
//  Subida de archivos (PDF via PDF.js, DOCX via mammoth)
// ─────────────────────────────────────────────
async function extractPdfText(file) {
  const ab = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(" ") + "\n";
  }
  return text;
}

function pdfPagesAprox(text) {
  return Math.max(1, Math.round(text.length / 3000));
}

async function handleFile(e) {
  const file = e.target.files[0]; if (!file) return;
  const ext = file.name.split(".").pop().toLowerCase();
  document.getElementById("filePrompt").style.display = "none";
  document.getElementById("btnAttach").style.display = "none";
  try {
    if (ext === "pdf") {
      addMsg("assistant", `Leyendo PDF: ${file.name}...`);
      const text = await extractPdfText(file);
      addMsg("assistant", `Archivo cargado (${pdfPagesAprox(text)} páginas aprox.). Generando preguntas...`);
      await generateExam({ type: "text", text });
    } else if (ext === "docx") {
      const ab = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer: ab });
      addMsg("assistant", `Archivo cargado: ${file.name}. Generando preguntas...`);
      await generateExam({ type: "text", text: result.value });
    }
  } catch(err) {
    addMsg("assistant", `Error al leer el archivo: ${err.message}`);
    examState = "asking_file";
  }
  e.target.value = "";
}

// ─────────────────────────────────────────────
//  Modo examen
// ─────────────────────────────────────────────
function activateExam() {
  examState = "asking_topic"; examQuestions = []; examAnswers = []; examIndex = 0;
  document.getElementById("btnExam").style.display = "none";
  setDot("exam"); setSubtitle("MODO EXAMEN — ESPERANDO TEMA");
  addMsg("assistant", "Modo examen activado. ¿Sobre qué tema quieres que te examine, señor Rodrigo?");
}

async function generateExam(fileData) {
  examState = "generating"; loading = true; setInputDisabled(true); showTyping();
  setSubtitle("GENERANDO EXAMEN...");

  const contextExtra = fileData?.text ? `\n\nApuntes de referencia:\n${fileData.text.slice(0, 8000)}` : "";
  const prompt = `Genera exactamente 30 preguntas tipo test nivel complejo sobre "${examTopic}"${contextExtra}. SOLO array JSON sin markdown: [{"question":"...","options":[{"label":"A","text":"..."},{"label":"B","text":"..."},{"label":"C","text":"..."}],"correct":"A"},...]`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);

  try {
    const res = await fetch("http://127.0.0.1:5000/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 4000,
        temperature: 0.3,
        messages: [
          { role: "system", content: "Devuelve ÚNICAMENTE JSON válido sin markdown." },
          { role: "user", content: prompt }
        ]
      }),
      signal: controller.signal
    });
    const data = await res.json();
    updateTokens(data.usage);
    let raw = (data.choices?.[0]?.message?.content || "[]").replace(/```json|```/g,"").trim();
    examQuestions = JSON.parse(raw);
    if (!Array.isArray(examQuestions) || !examQuestions.length) throw new Error("Sin preguntas");
    examAnswers = []; examIndex = 0; examState = "in_progress";
    hideTyping();
    addMsg("assistant", `¡Examen listo! ${examQuestions.length} preguntas sobre "${examTopic}". Vamos allá, señor Rodrigo.`);
    setSubtitle(`MODO EXAMEN — PREGUNTA 1/${examQuestions.length}`);
    showQuestion();
  } catch(err) {
    hideTyping();
    const msg = err.name === "AbortError" ? "Timeout generando el examen. Inténtalo de nuevo." : `Error generando examen: ${err.message}`;
    addMsg("assistant", msg);
    examState = "idle"; document.getElementById("btnExam").style.display = "block";
    setDot("online"); setSubtitle("TODOS LOS SISTEMAS OPERATIVOS");
  } finally {
    clearTimeout(timer);
    loading = false; if (!stopped) setInputDisabled(false);
  }
}

function showQuestion() {
  const q = examQuestions[examIndex];
  const msgs = document.getElementById("messages");
  const total = examQuestions.length;
  const pct = Math.round((examIndex / total) * 100);

  const card = document.createElement("div");
  card.className = "exam-card";
  card.style.display = "block";
  card.innerHTML = `<div class="exam-progress-wrap"><div class="exam-progress-fill" style="width:${pct}%"></div></div><div class="exam-num">⬡ PREGUNTA ${examIndex + 1} / ${total}</div><div class="exam-question">${esc(q.question)}</div><div class="exam-options"></div>`;

  const opts = card.querySelector(".exam-options");
  q.options.forEach(opt => {
    const btn = document.createElement("button");
    btn.className = "btn-option";
    btn.innerHTML = `<span>${opt.label}.</span>${esc(opt.text)}`;
    btn.onclick = () => handleAnswer(opt.label, card);
    opts.appendChild(btn);
  });

  msgs.appendChild(card);
  msgs.scrollTop = msgs.scrollHeight;
}

function handleAnswer(label, card) {
  const q = examQuestions[examIndex];
  examAnswers.push(label);

  // Bloquea los botones y colorea correcta/incorrecta
  card.querySelectorAll(".btn-option").forEach(btn => {
    btn.disabled = true;
    btn.style.cursor = "default";
    const btnLabel = btn.querySelector("span").textContent.replace(".", "").trim();
    if (btnLabel === q.correct) {
      btn.style.background = "rgba(0,200,100,0.2)";
      btn.style.borderColor = "rgba(0,200,100,0.5)";
      btn.style.color = "#00cc88";
      btn.style.opacity = "1";
    } else if (btnLabel === label) {
      btn.style.background = "rgba(255,50,50,0.15)";
      btn.style.borderColor = "rgba(255,50,50,0.4)";
      btn.style.color = "#ff4444";
      btn.style.opacity = "1";
    } else {
      btn.style.opacity = "0.35";
    }
  });

  addMsg("user", `Respuesta: ${label}`);
  if (label === q.correct) { addMsg("assistant", "✅ Correcta. ¡Bien, Rodrigo!"); }
  else { addMsg("assistant", `❌ Incorrecta. La correcta era ${q.correct}: ${q.options.find(o=>o.label===q.correct)?.text}`); }

  const next = examIndex + 1;
  if (next >= examQuestions.length) { setTimeout(showResults, 400); }
  else { examIndex = next; setSubtitle(`MODO EXAMEN — PREGUNTA ${examIndex + 1}/${examQuestions.length}`); setTimeout(showQuestion, 150); }
}

function showResults() {
  const total = examQuestions.length;
  const correctas = examAnswers.filter((a,i) => a === examQuestions[i].correct).length;
  const falladas = total - correctas;
  const errores = examQuestions.map((q,i) => ({q,i,ua:examAnswers[i]})).filter(({q,ua}) => ua !== q.correct);
  let res = `\n━━━━━━━━━━━━━━━━━━━━━━━━\n📊 RESULTADOS FINALES\n━━━━━━━━━━━━━━━━━━━━━━━━\n✅ Correctas: ${correctas}/${total}\n❌ Falladas: ${falladas}/${total}`;
  if (errores.length) { res += `\n\n📋 CORRECCIONES:`; errores.forEach(({q,i,ua}) => { res += `\n\nP${i+1}: ${q.question}\n→ Tu respuesta (${ua}): ${q.options.find(o=>o.label===ua)?.text}\n→ Correcta (${q.correct}): ${q.options.find(o=>o.label===q.correct)?.text}`; }); }
  if (falladas === 0) res += "\n\n🏆 Perfecto. Aunque seguro fue suerte, señor Rodrigo.";
  else if (falladas <= 5) res += "\n\nNada mal. Podrías haber estudiado más, pero aprobado.";
  else if (falladas <= 15) res += "\n\nHay margen de mejora, Rodrigo. Bastante margen.";
  else res += "\n\nRodrigo... ¿seguro que has leído los apuntes?";
  addMsg("assistant", res);
  examState = "results";
  document.getElementById("btnExam").style.display = "block";
  setDot("online"); setSubtitle("TODOS LOS SISTEMAS OPERATIVOS");
}

// ─────────────────────────────────────────────
//  Live preview en modal de config
// ─────────────────────────────────────────────
document.addEventListener("input", e => {
  if (["cfgTotal","cfgMax","cfgWarn"].includes(e.target.id)) updatePreview();
});

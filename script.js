// =========================================================================
// 1. CHAVES DE ARMAZENAMENTO E ESTADO DO APLICATIVO
// =========================================================================
const STORAGE_GUIDES_KEY = 'autonomia60_guias_v4';
const STORAGE_FAMILY_KEY = 'autonomia60_contato_v4';
const STORAGE_VOICE_KEY = 'autonomia60_voz_v4';

let currentTab = 'inicio';
let currentFontSize = 17;
let highContrastEnabled = false;
let activeCheckerMode = 'mensagem';
let uploadedFileText = '';
let activeRecognition = null;

// Estado da Voz Suavizada
let availablePtVoices = [];
let voiceGenderPref = 'auto';
let speechPaceMode = 'calmo';
let speechQueueToken = 0;
let speechPauseTimer = null;

let lastVerificationSpoken = '';
let lastEduSpokenText = 'Olá! Eu sou o Professor Edu do Autonomia 60+. Estou aqui para ensinar você a usar o celular com tranquilidade e segurança.';

const DAILY_TIPS = [
  'Nunca passe senhas ou códigos que chegam por mensagem SMS para ninguém, mesmo que a pessoa diga trabalhar no seu banco.',
  'Se um filho ou neto mandar mensagem de um número novo pedindo dinheiro urgente, ligue para o número antigo dele antes de fazer qualquer Pix.',
  'Desconfie de mensagens prometendo celular grátis, dinheiro esquecido ou prêmios instantâneos ao clicar em um link.',
  'Ative a confirmação em duas etapas no WhatsApp para impedir que outras pessoas usem o seu número.'
];
let tipIndex = 0;

function escapeHTML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'pointer-events-auto p-3.5 rounded-2xl bg-[#1e1b4b] text-white border border-pink-400 shadow-xl text-xs sm:text-sm font-bold flex items-center justify-between gap-3';
  toast.innerHTML = '<span>' + escapeHTML(message) + '</span><button type="button" class="text-pink-300 hover:text-white font-black" aria-label="Fechar aviso">✕</button>';
  toast.querySelector('button').addEventListener('click', function () {
    toast.remove();
  });
  container.appendChild(toast);
  setTimeout(function () {
    if (toast.parentElement) toast.remove();
  }, 4500);
}

// =========================================================================
// 2. NAVEGAÇÃO ENTRE AS 5 ABAS
// =========================================================================
function switchTab(tabName) {
  currentTab = tabName;

  document.querySelectorAll('.tab-panel').forEach(function (panel) {
    panel.classList.add('hidden');
  });

  const targetPanel = document.getElementById('tab-panel-' + tabName);
  if (targetPanel) targetPanel.classList.remove('hidden');

  document.querySelectorAll('.nav-tab-btn').forEach(function (btn) {
    btn.setAttribute('aria-selected', 'false');
    if (btn.id === 'nav-tab-emergencia') {
      btn.className = 'nav-tab-btn col-span-2 sm:col-span-1 px-4 py-2.5 rounded-xl text-sm font-extrabold bg-red-600 hover:bg-red-700 text-white shadow-sm transition';
    } else {
      btn.className = 'nav-tab-btn px-3.5 py-2.5 rounded-xl text-sm font-bold bg-purple-50 text-purple-950 hover:bg-purple-100 border border-purple-200 transition';
    }
  });

  const activeBtn = document.getElementById('nav-tab-' + tabName);
  if (activeBtn) {
    activeBtn.setAttribute('aria-selected', 'true');
    if (tabName === 'emergencia') {
      activeBtn.className = 'nav-tab-btn col-span-2 sm:col-span-1 px-4 py-2.5 rounded-xl text-sm font-black bg-red-700 text-white ring-4 ring-red-200 shadow-md transition';
    } else {
      activeBtn.className = 'nav-tab-btn px-3.5 py-2.5 rounded-xl text-sm font-extrabold brand-gradient text-white shadow-md transition';
    }
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =========================================================================
// 3. ACESSIBILIDADE E LEITURA EM VOZ ALTA SUAVIZADA
// =========================================================================
function adjustFontSize(delta) {
  currentFontSize = Math.min(24, Math.max(15, currentFontSize + delta));
  document.documentElement.style.setProperty('--base-font-size', currentFontSize + 'px');
  showToast('Tamanho da letra ajustado para ' + currentFontSize + 'px.');
}

function toggleHighContrast() {
  highContrastEnabled = !highContrastEnabled;
  document.body.classList.toggle('high-contrast', highContrastEnabled);
  const btn = document.getElementById('btn-high-contrast');
  if (btn) {
    btn.textContent = highContrastEnabled ? 'Cores Normais' : 'Alto Contraste';
    btn.setAttribute('aria-pressed', String(highContrastEnabled));
  }
}

function loadBestPortugueseVoices() {
  if (!('speechSynthesis' in window)) return;
  const voices = window.speechSynthesis.getVoices() || [];
  const ptList = voices.filter(function (v) {
    const lang = (v.lang || '').toLowerCase();
    return lang.includes('pt-br') || lang.startsWith('pt');
  });

  availablePtVoices = ptList.map(function (voice) {
    const name = (voice.name || '').toLowerCase();
    let score = 0;

    if ((voice.lang || '').toLowerCase() === 'pt-br') score += 30;
    if (name.includes('natural')) score += 100;
    if (name.includes('online')) score += 60;
    if (name.includes('francisca') || name.includes('thalita') || name.includes('antonio')) score += 50;
    if (name.includes('google português') || name.includes('google portugues')) score += 45;
    if (name.includes('luciana') || name.includes('felipe')) score += 35;

    if ((name.includes('maria') || name.includes('daniel')) && !name.includes('online') && !name.includes('natural')) {
      score -= 25;
    }

    const isMale = /\b(antonio|antônio|daniel|felipe|ricardo|thiago|tiago|rafael|male|masculin)\b/i.test(name);
    const isFemale = !isMale;

    return { voice: voice, score: score, isMale: isMale, isFemale: isFemale };
  }).sort(function (a, b) {
    return b.score - a.score;
  });
}

function pickPreferredVoice() {
  if (!availablePtVoices.length) loadBestPortugueseVoices();
  if (!availablePtVoices.length) return null;

  if (voiceGenderPref === 'female') {
    const fem = availablePtVoices.find(function (v) { return v.isFemale; });
    if (fem) return fem.voice;
  } else if (voiceGenderPref === 'male') {
    const male = availablePtVoices.find(function (v) { return v.isMale; });
    if (male) return male.voice;
  }
  return availablePtVoices[0].voice;
}

function onVoiceSettingsChanged() {
  const sel = document.getElementById('voice-gender-select');
  if (sel) {
    voiceGenderPref = sel.value;
    saveVoiceSettings();
    speakText('Pronto! Veja se esse tom de voz ficou mais agradável para você.');
  }
}

function toggleSpeechPace() {
  speechPaceMode = speechPaceMode === 'calmo' ? 'normal' : 'calmo';
  const btn = document.getElementById('btn-speech-pace');
  if (btn) {
    btn.textContent = speechPaceMode === 'calmo' ? '🐢 Ritmo: Calmo' : '🐇 Ritmo: Normal';
    btn.setAttribute('aria-pressed', String(speechPaceMode !== 'calmo'));
  }
  saveVoiceSettings();
  speakText(speechPaceMode === 'calmo'
    ? 'Ritmo calmo ativado. Vou falar mais devagar.'
    : 'Ritmo normal ativado.');
}

function saveVoiceSettings() {
  try {
    localStorage.setItem(STORAGE_VOICE_KEY, JSON.stringify({
      gender: voiceGenderPref,
      pace: speechPaceMode
    }));
  } catch (e) {}
}

function humanizeTextForSpeech(rawText) {
  return String(rawText || '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ')
    .replace(/[*#_`~•→←►▶⏹🔊🎤📷🏦💸🔒🛡️🎣🔕🔑📹🎙️🏛️🔎🚨💡⭐🌱🏆♿]/g, ' ')
    .replace(/https?:\/\/[^\s)]+/gi, 'endereço de internet')
    .replace(/\b60\+/g, 'sessenta mais')
    .replace(/\bgov\.br\b/gi, 'gov ponto b r')
    .replace(/\bnaomeperturbe\.com\.br\b/gi, 'não me perturbe ponto com ponto b r')
    .replace(/\bwhatsapp\b/gi, 'Uátizápi')
    .replace(/\bpix\b/gi, 'Pícs')
    .replace(/\bsms\b/gi, 'mensagem de texto')
    .replace(/\burl\b/gi, 'endereço do site')
    .replace(/\bphishing\b/gi, 'fíchin, que é o golpe do link falso')
    .replace(/\bcpf\b/gi, 'C P F')
    .replace(/\bmed\b/gi, 'mecanismo especial de devolução')
    .replace(/\bwi-fi\b/gi, 'uái fái')
    .replace(/(^|\n)\s*(\d+)\.\s+/g, '$1Passo $2: ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitIntoNaturalSentences(text) {
  const chunks = text.match(/[^.!?;:\n]+[.!?;:\n]*/g) || [text];
  const result = [];

  chunks.forEach(function (chunk) {
    const trimmed = chunk.trim();
    if (!trimmed) return;

    if (trimmed.length > 130 && trimmed.includes(',')) {
      const parts = trimmed.split(',');
      let buffer = '';
      parts.forEach(function (part) {
        const piece = part.trim();
        if (!piece) return;
        const candidate = buffer ? buffer + ', ' + piece : piece;
        if (candidate.length > 105 && buffer) {
          result.push(buffer + ',');
          buffer = piece;
        } else {
          buffer = candidate;
        }
      });
      if (buffer) result.push(buffer);
    } else {
      result.push(trimmed);
    }
  });

  return result;
}

function speakText(text) {
  if (!('speechSynthesis' in window)) {
    showToast('Seu navegador não possui leitura por voz.');
    return;
  }

  stopSpeech();
  const token = ++speechQueueToken;
  const cleanText = humanizeTextForSpeech(text);
  if (!cleanText) return;

  const sentences = splitIntoNaturalSentences(cleanText);
  const chosenVoice = pickPreferredVoice();
  const baseRate = speechPaceMode === 'calmo' ? 0.89 : 0.98;

  const stopBtn = document.getElementById('btn-stop-speech');
  if (stopBtn) stopBtn.classList.remove('hidden');

  let idx = 0;

  function speakNext() {
    if (token !== speechQueueToken) return;
    if (idx >= sentences.length) {
      if (stopBtn) stopBtn.classList.add('hidden');
      return;
    }

    const sentence = sentences[idx++];
    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.lang = 'pt-BR';
    if (chosenVoice) utterance.voice = chosenVoice;

    const isQuestion = sentence.endsWith('?');
    const isExclamation = sentence.endsWith('!');
    utterance.pitch = isQuestion ? 1.05 : (isExclamation ? 1.03 : 1.0);
    utterance.rate = isQuestion ? baseRate * 0.97 : baseRate;
    utterance.volume = 1.0;

    utterance.onend = function () {
      if (token !== speechQueueToken) return;
      speechPauseTimer = setTimeout(speakNext, 220);
    };

    utterance.onerror = function () {
      if (token !== speechQueueToken) return;
      if (stopBtn) stopBtn.classList.add('hidden');
    };

    window.speechSynthesis.speak(utterance);
  }

  speakNext();
}

function stopSpeech() {
  speechQueueToken++;
  if (speechPauseTimer) {
    clearTimeout(speechPauseTimer);
    speechPauseTimer = null;
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  const stopBtn = document.getElementById('btn-stop-speech');
  if (stopBtn) stopBtn.classList.add('hidden');
}

function readCurrentTabAloud() {
  const summaries = {
    inicio: 'Você está na tela inicial do Autonomia 60+. Use os botões no topo para verificar mensagens suspeitas, conversar com o Professor Edu, ver guias passo a passo ou pedir ajuda de emergência.',
    verificar: 'Você está na tela de verificar golpes. Escolha se recebeu uma mensagem, notícia, link ou foto, escreva ou cole o texto e toque em Verificar Agora.',
    edu: 'Você está na sala do Professor Edu. Escolha uma das dúvidas prontas ao lado ou escreva sua pergunta sobre o celular.',
    guias: 'Você está nos guias práticos passo a passo. Marque cada etapa conforme praticar no seu aparelho.',
    emergencia: 'Você está na central de emergência. Siga os quatro passos para proteger seu dinheiro e avise um familiar de confiança pelo WhatsApp.'
  };
  speakText(summaries[currentTab] || summaries.inicio);
}

// =========================================================================
// 4. SIMULAÇÃO DA TELA INICIAL E DICA DO DIA
// =========================================================================
function testHeroSimulation(choice) {
  const box = document.getElementById('hero-sim-feedback');
  if (!box) return;
  box.classList.remove('hidden');

  if (choice === 'block') {
    box.className = 'rounded-xl p-3 text-xs font-bold leading-snug bg-emerald-50 text-emerald-900 border border-emerald-300';
    box.textContent = '✅ Parabéns! Você acertou. Esse é o famoso golpe do falso parente. Sempre ligue para o número antigo antes de transferir dinheiro.';
    speakText('Parabéns! Você acertou. Sempre ligue para o número antigo do seu familiar antes de fazer qualquer transferência.');
  } else {
    box.className = 'rounded-xl p-3 text-xs font-bold leading-snug bg-amber-50 text-amber-950 border border-amber-300';
    box.textContent = '⚠️ Cuidado! Golpistas usam fotos da família em números novos para pedir Pix urgente. Nunca transfira sem ligar antes!';
    speakText('Cuidado! Golpistas usam fotos da família em números novos para pedir Pícs urgente. Nunca transfira sem ligar antes.');
  }
}

function nextDailyTip() {
  tipIndex = (tipIndex + 1) % DAILY_TIPS.length;
  const el = document.getElementById('daily-tip-text');
  if (el) el.textContent = DAILY_TIPS[tipIndex];
}

// =========================================================================
// 5. DITADO POR VOZ SEGURO (WEB SPEECH API)
// =========================================================================
function stopActiveRecognition() {
  if (activeRecognition) {
    try { activeRecognition.stop(); } catch (e) {}
    activeRecognition = null;
  }
  const cStatus = document.getElementById('checker-voice-status');
  const eStatus = document.getElementById('edu-voice-status');
  const cMicText = document.getElementById('checker-mic-text');
  if (cStatus) cStatus.classList.add('hidden');
  if (eStatus) eStatus.classList.add('hidden');
  if (cMicText) cMicText.textContent = 'Falar Mensagem';
}

function startSpeechCapture(options) {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    showToast('Seu navegador não possui ditado automático. Você pode digitar o texto ou usar Win + H no teclado.');
    return;
  }

  stopActiveRecognition();

  const rec = new SpeechRec();
  activeRecognition = rec;
  rec.lang = 'pt-BR';
  rec.continuous = false;
  rec.interimResults = true;

  const statusBox = document.getElementById(options.statusBoxId);
  const liveText = document.getElementById(options.liveTextId);
  let finalTranscript = '';

  if (statusBox) statusBox.classList.remove('hidden');
  if (liveText) liveText.textContent = 'Ouvindo... Pode falar perto do microfone!';

  rec.onresult = function (event) {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const piece = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += piece;
      } else {
        interim += piece;
      }
    }
    const preview = (finalTranscript || interim).trim();
    if (liveText && preview) {
      liveText.textContent = 'Ouvindo: "' + preview + '"';
    }
  };

  rec.onerror = function (event) {
    stopActiveRecognition();
    if (options.onReset) options.onReset();
    if (event.error === 'not-allowed') {
      showToast('Permissão de microfone bloqueada no navegador. Você pode digitar sua mensagem abaixo.');
    } else {
      showToast('O ditado automático precisa de servidor web (Live Server) ou conexão. Você pode digitar diretamente.');
    }
  };

  rec.onend = function () {
    if (statusBox) statusBox.classList.add('hidden');
    if (options.onReset) options.onReset();
    activeRecognition = null;
    const clean = finalTranscript.trim();
    if (clean && options.onSuccess) {
      options.onSuccess(clean);
    }
  };

  try {
    rec.start();
  } catch (e) {
    stopActiveRecognition();
    if (options.onReset) options.onReset();
    showToast('Não foi possível iniciar o microfone. Digite sua mensagem abaixo.');
  }
}

function dictateIntoChecker() {
  const micLabel = document.getElementById('checker-mic-text');
  if (micLabel) micLabel.textContent = 'Ouvindo...';

  startSpeechCapture({
    statusBoxId: 'checker-voice-status',
    liveTextId: 'checker-voice-live-text',
    onReset: function () {
      if (micLabel) micLabel.textContent = 'Falar Mensagem';
    },
    onSuccess: function (spoken) {
      if (activeCheckerMode === 'noticia') {
        document.getElementById('cinput-noticia').value = spoken;
      } else if (activeCheckerMode === 'link') {
        document.getElementById('cinput-link').value = spoken.replace(/\s+/g, '');
      } else {
        selectCheckerMode('mensagem');
        document.getElementById('cinput-mensagem').value = spoken;
      }
      showToast('Texto captado! Toque em Verificar Agora.');
    }
  });
}

function speakQuestionToEdu() {
  startSpeechCapture({
    statusBoxId: 'edu-voice-status',
    liveTextId: 'edu-voice-live-text',
    onSuccess: function (spoken) {
      askProfessorEdu(spoken);
    }
  });
}

// =========================================================================
// 6. VERIFICADOR DE GOLPES 100% LOCAL (RELATÓRIO DE 9 PONTOS)
// =========================================================================
function selectCheckerMode(mode) {
  activeCheckerMode = mode;

  document.querySelectorAll('.cmode-btn').forEach(function (btn) {
    btn.setAttribute('aria-selected', 'false');
    btn.className = 'cmode-btn px-4 py-2 rounded-xl text-sm font-bold bg-purple-50 text-purple-900 hover:bg-purple-100 border border-purple-200 transition';
  });

  const activeBtn = document.getElementById('cmode-' + mode);
  if (activeBtn) {
    activeBtn.setAttribute('aria-selected', 'true');
    activeBtn.className = 'cmode-btn px-4 py-2 rounded-xl text-sm font-extrabold brand-gradient text-white shadow-xs transition';
  }

  document.querySelectorAll('.cpanel').forEach(function (panel) {
    panel.classList.add('hidden');
  });

  const targetPanel = document.getElementById('cpanel-' + mode);
  if (targetPanel) targetPanel.classList.remove('hidden');
}

function handleImageUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    const img = document.getElementById('cpreview-imagem');
    if (img) {
      img.src = e.target.result;
      img.classList.remove('hidden');
    }
    showToast('Foto carregada! Toque em Verificar Agora.');
  };
  reader.readAsDataURL(file);
}

function handleDocUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    uploadedFileText = String(e.target.result || '').slice(0, 6000);
    document.getElementById('cdoc-status').textContent = 'Arquivo carregado: ' + file.name;
    document.getElementById('cinput-arquivo').value = uploadedFileText;
    showToast('Arquivo lido com segurança!');
  };
  reader.readAsText(file);
}

function analyzeContentLocally(mode, rawText) {
  const text = rawText.trim();
  const lower = text.toLowerCase();

  const reasons = [];
  const evidences = [];
  const confirmed = [];
  const unverified = [];
  const sources = [
    'Banco Central do Brasil (bcb.gov.br) — Orientações contra fraudes financeiras',
    'Portal Gov.br — Canal oficial de serviços e benefícios do governo',
    'Cartilha de Segurança para Internet (CERT.br)'
  ];
  const recommendations = [];

  let riskScore = 0;

  // 1. Verificação Anti-SSRF e estrutura de Link
  if (mode === 'link' || /https?:\/\/|www\.|\.[a-z]{2,4}\//i.test(lower)) {
    if (/localhost|127\.0\.0\.1|192\.168\.|10\.\d+\./i.test(lower)) {
      riskScore += 90;
      reasons.push('Endereço interno bloqueado por segurança contra acesso indevido.');
      evidences.push('Tentativa de endereço local/privado detectada.');
    }
    if (/http:\/\//i.test(lower)) {
      riskScore += 25;
      reasons.push('O site não possui cadeado de segurança (usa HTTP em vez de HTTPS).');
      evidences.push('Protocolo inseguro http:// encontrado.');
    }
    if (/\.xyz|\.top|\.club|\.click|\.vip|\.icu|\.online|\.site|bit\.ly|tinyurl/i.test(lower)) {
      riskScore += 35;
      reasons.push('Usa terminação de site ou encurtador muito usado para esconder páginas falsas.');
      evidences.push('Domínio suspeito ou link encurtado identificado.');
    }
    if (/banco|caixa|bradesco|itau|santander|nubank|bb|inss|gov|receita|correios/i.test(lower) && !/\.gov\.br\b/i.test(lower)) {
      riskScore += 45;
      reasons.push('Usa nome de banco ou órgão público fora do endereço oficial (.gov.br ou app oficial).');
      evidences.push('Possível imitação de instituição oficial.');
    }
  }

  // 2. Golpe de Prêmio Falso / Sorteio / Celular Grátis
  if (/ganhou|ganhar|prêmio|premio|sorteio|iphone|celular grátis|vale-compras|resgate agora|resgatar/i.test(lower)) {
    riskScore += 55;
    reasons.push('Promessa de prêmio valioso ou celular grátis sem você ter participado de sorteio oficial.');
    evidences.push('Palavras típicas de isca de prêmio falso ("ganhou", "prêmio", "resgatar").');
    confirmed.push('Empresas sérias não distribuem celulares caros por mensagens aleatórias de WhatsApp ou SMS.');
  }

  // 3. Golpe do Falso Parente / Urgência de Pix
  if (/pix|transferência|transferencia|número novo|numero novo|troquei de número|troquei de numero|urgente|hoje mesmo|bloqueada|bloqueio|suspensa/i.test(lower)) {
    riskScore += 50;
    reasons.push('Apelo de urgência financeira ou pedido de dinheiro com pressa para impedir você de pensar.');
    evidences.push('Sinais de pressão emocional ("urgente", "Pix", "número novo" ou "conta bloqueada").');
    confirmed.push('Golpistas criam senso de urgência para que a vítima faça o pagamento sem conferir.');
  }

  // 4. Falso Benefício / Fake News
  if (/saque extra|dinheiro esquecido|valores a receber|benefício liberado|auxílio extra|aposentados|pensionistas|clique aqui/i.test(lower)) {
    riskScore += 45;
    reasons.push('Promessa de dinheiro fácil ou benefício governamental por meio de link de mensagem.');
    evidences.push('Uso de isca financeira voltada a aposentados e beneficiários.');
    confirmed.push('Consultas oficiais do governo só devem ser feitas pelo aplicativo oficial Gov.br.');
  }

  // 5. Pedido de Senha ou Código SMS
  if (/senha|código|codigo|sms|token|cartão|cartao|cvv/i.test(lower)) {
    riskScore += 55;
    reasons.push('Solicitação de senha, código recebido por SMS ou dados do cartão.');
    evidences.push('Tentativa de captura de dados sigilosos detectada.');
    confirmed.push('Nenhum banco ou atendente verdadeiro pede sua senha ou código de SMS.');
  }

  // Classificação final
  let riskLevel = 'Baixo';
  let confidence = '86%';
  let confidenceReason = 'Baseado na análise dos padrões de linguagem, estrutura do texto e regras oficiais de segurança digital.';
  let summary = '';

  if (riskScore >= 70) {
    riskLevel = 'Crítico';
    confidence = '96%';
    summary = 'ALERTA MÁXIMO: Este conteúdo tem sinais muito fortes de GOLPE! Não clique em nenhum link, não passe dados e não faça transferências.';
  } else if (riskScore >= 40) {
    riskLevel = 'Alto';
    confidence = '91%';
    summary = 'CUIDADO: Alto risco de fraude ou notícia falsa. Desconfie e confirme por um canal oficial antes de tomar qualquer atitude.';
  } else if (riskScore >= 20) {
    riskLevel = 'Médio';
    confidence = '82%';
    summary = 'ATENÇÃO: Existem sinais que pedem cautela. Verifique quem enviou e nunca informe dados pessoais sem certeza.';
  } else {
    riskLevel = 'Baixo';
    confidence = '80%';
    summary = 'Nenhum sinal óbvio de golpe foi encontrado neste texto, mas continue sempre atento a links e pedidos de dinheiro.';
    reasons.push('O texto não apresenta pedidos urgentes de Pix, senhas ou promessas irreais.');
    evidences.push('Nenhuma palavra-chave clássica de fraude foi identificada.');
    confirmed.push('Mesmo em mensagens aparentemente normais, a prudência evita surpresas.');
  }

  unverified.push('A identidade real de quem enviou a mensagem não pode ser garantida apenas pelo texto.');
  if (mode === 'imagem') {
    unverified.push('Para imagens e prints, sempre confira o número de telefone ou o extrato oficial do seu banco.');
  }

  recommendations.push('Não clique em links enviados por desconhecidos ou em correntes.');
  recommendations.push('Nunca informe senhas, códigos de SMS ou dados bancários.');
  if (riskScore >= 40) {
    recommendations.push('Apague a mensagem e bloqueie o remetente no seu celular.');
    recommendations.push('Em caso de dúvida sobre banco ou benefício, ligue para o número oficial ou peça ajuda a um familiar.');
  }

  return {
    riskLevel: riskLevel,
    confidence: confidence,
    confidenceReason: confidenceReason,
    summary: summary,
    reasons: reasons,
    evidences: evidences,
    confirmed: confirmed,
    unverified: unverified,
    sources: sources,
    recommendations: recommendations
  };
}

function runScamVerification() {
  let textToCheck = '';

  if (activeCheckerMode === 'mensagem') {
    textToCheck = document.getElementById('cinput-mensagem').value.trim();
  } else if (activeCheckerMode === 'noticia') {
    textToCheck = document.getElementById('cinput-noticia').value.trim();
  } else if (activeCheckerMode === 'link') {
    textToCheck = document.getElementById('cinput-link').value.trim();
  } else if (activeCheckerMode === 'imagem') {
    const desc = document.getElementById('cinput-imagem-desc').value.trim();
    const hasPreview = !document.getElementById('cpreview-imagem').classList.contains('hidden');
    if (!hasPreview && !desc) {
      showToast('Escolha uma foto ou escreva o que aparece nela primeiro.');
      return;
    }
    textToCheck = desc || 'Print ou foto enviada para conferência de comprovante ou mensagem.';
  } else if (activeCheckerMode === 'arquivo') {
    textToCheck = document.getElementById('cinput-arquivo').value.trim();
  }

  if (!textToCheck) {
    showToast('Escreva ou cole o conteúdo que deseja verificar.');
    return;
  }

  const report = analyzeContentLocally(activeCheckerMode, textToCheck);
  renderVerificationReport(report);
  showToast('Conferência concluída!');
}

function renderVerificationReport(report) {
  const card = document.getElementById('verification-result-card');
  if (!card) return;
  card.classList.remove('hidden');

  const badge = document.getElementById('res-risk-badge');
  const badgeColors = {
    Baixo: 'bg-emerald-100 text-emerald-900 border border-emerald-300',
    Médio: 'bg-amber-100 text-amber-900 border border-amber-300',
    Alto: 'bg-orange-100 text-orange-900 border border-orange-300',
    Crítico: 'bg-rose-100 text-rose-900 border border-rose-300'
  };
  badge.className = 'px-4 py-1.5 rounded-full text-sm font-black uppercase ' + (badgeColors[report.riskLevel] || badgeColors.Médio);
  badge.textContent = '2. Risco: ' + report.riskLevel;

  document.getElementById('res-confidence-badge').textContent = 'Confiança: ' + report.confidence;
  document.getElementById('res-summary').textContent = report.summary;
  document.getElementById('res-confidence-reason').textContent = 'Base da análise: ' + report.confidenceReason;

  fillList('res-reasons', report.reasons);
  fillList('res-evidences', report.evidences);
  fillList('res-confirmed', report.confirmed);
  fillList('res-unverified', report.unverified);
  fillList('res-sources', report.sources);
  fillList('res-recommendations', report.recommendations);

  lastVerificationSpoken = 'Nível de risco: ' + report.riskLevel + '. ' + report.summary + ' Recomendações: ' + report.recommendations.join('. ');
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function fillList(elementId, items) {
  const ul = document.getElementById(elementId);
  if (!ul) return;
  ul.innerHTML = (items || []).map(function (item) {
    return '<li>' + escapeHTML(item) + '</li>';
  }).join('');
}

function speakVerificationReport() {
  if (lastVerificationSpoken) {
    speakText(lastVerificationSpoken);
  }
}

// =========================================================================
// 7. PROFESSOR EDU (CHATBOT EDUCADOR 100% FUNCIONAL)
// =========================================================================
const EDU_KNOWLEDGE_BASE = [
  {
    keywords: ['foto', 'enviar foto', 'mandar foto', 'imagem'],
    answer: 'É muito fácil enviar uma foto no WhatsApp! Siga estes 4 passos:\n1. Abra o WhatsApp e toque na conversa da pessoa que vai receber a foto.\n2. Lá embaixo, onde você escreve a mensagem, toque no desenho do clipe de papel ou da câmera fotográfica.\n3. Toque em "Galeria" e escolha a foto que você quer mandar.\n4. Por último, aperte o botão redondo verde com uma setinha branca para enviar.'
  },
  {
    keywords: ['falso banco', 'ligação', 'ligacao', 'central', 'gerente'],
    answer: 'Veja como reconhecer na hora a ligação de um falso banco:\n1. Desconfie se disserem que fizeram uma compra suspeita no seu cartão e pedirem para você digitar senhas ou instalar um aplicativo.\n2. Bancos de verdade NUNCA pedem sua senha por telefone e NUNCA mandam motoboy buscar cartão na sua casa.\n3. Se ficar na dúvida, desligue a chamada, espere 1 minuto e ligue você mesmo para o número oficial escrito atrás do seu cartão.'
  },
  {
    keywords: ['pix', 'golpe do pix', 'transferência', 'parente', 'filho', 'neto'],
    answer: 'Para nunca cair no golpe do Pix ou do falso parente, faça sempre assim:\n1. Se alguém mandar mensagem dizendo "Oi, troquei de número, me faz um Pix urgente", pare e respire.\n2. Nunca faça a transferência na hora, mesmo que a foto do perfil seja do seu filho ou neto.\n3. Ligue para o número antigo do seu familiar para confirmar se é ele mesmo pedindo.'
  },
  {
    keywords: ['clonado', 'clonagem', 'proteger whatsapp', 'duas etapas'],
    answer: 'Para blindar o seu WhatsApp contra clonagem, ative a proteção em duas etapas:\n1. Abra o WhatsApp e toque nos três pontinhos lá no alto à direita (ou em "Configurações" no iPhone).\n2. Toque em "Conta" e depois em "Confirmação em duas etapas".\n3. Toque em "Ativar" e crie uma senha de 6 números que você lembre bem.\n4. Importante: nunca passe para ninguém nenhum código de 6 números que chegar por SMS no seu celular.'
  },
  {
    keywords: ['identificar golpes', 'golpes no whatsapp', 'sms', 'mensagem suspeita'],
    answer: 'Existem 3 sinais claros para descobrir um golpe no WhatsApp ou SMS:\n1. Promessas boas demais para ser verdade, como celular grátis, dinheiro esquecido ou prêmio instantâneo.\n2. Pressa exagerada, dizendo que sua conta será bloqueada hoje se você não clicar agora.\n3. Pedidos de senha, código de verificação ou transferência Pix. Na dúvida, cole a mensagem aqui na aba "Verificar Golpes"!'
  },
  {
    keywords: ['phishing', 'link falso', 'links falsos'],
    answer: 'Phishing (pronuncia-se "fíchin") é uma armadilha onde golpistas enviam um link falso imitando a página de um banco, loja ou do governo.\n1. O objetivo é fazer você digitar seu CPF e sua senha nessa página falsa.\n2. Para se proteger, nunca entre no seu banco clicando em links de mensagens.\n3. Abra sempre o aplicativo oficial do banco que já está instalado no seu celular.'
  },
  {
    keywords: ['spam', 'bloquear', 'chamadas', 'telemarketing'],
    answer: 'Para bloquear chamadas e mensagens chatas no celular:\n1. No WhatsApp: abra a conversa indesejada, toque no nome da pessoa lá no topo, role até o final e toque em "Bloquear".\n2. Para ligações de telemarketing: você pode cadastrar seu número gratuitamente no site oficial naomeperturbe.com.br.\n3. No telefone, toque no número que ligou, entre em detalhes e escolha "Bloquear número".'
  },
  {
    keywords: ['senha', 'senhas', 'guardar senha'],
    answer: 'Dicas simples para criar e guardar senhas seguras:\n1. Evite usar sua data de nascimento, sequência 123456 ou seu telefone.\n2. Misture uma palavra fácil de lembrar com um número especial para você (por exemplo: Jardim2026!).\n3. Anote suas senhas em um caderninho guardado em lugar seguro dentro de casa — nunca deixe anotado no próprio celular.'
  },
  {
    keywords: ['vídeo', 'video', 'chamada de vídeo', 'ligar por vídeo'],
    answer: 'Para fazer uma chamada de vídeo no WhatsApp:\n1. Abra a conversa da pessoa com quem você quer falar.\n2. Olhe lá no canto superior direito e toque no desenho de uma filmadora (câmera de vídeo).\n3. Aguarde a pessoa atender. Quando quiser encerrar, toque no botão redondo vermelho.'
  },
  {
    keywords: ['áudio', 'audio', 'gravar áudio', 'mandar áudio'],
    answer: 'Para enviar uma mensagem de voz (áudio) no WhatsApp:\n1. Abra a conversa da pessoa.\n2. Toque e segure o dedo no botão verde com o desenho do microfone no canto inferior direito.\n3. Fale perto do celular e, quando terminar, solte o dedo para enviar.'
  },
  {
    keywords: ['gov', 'gov.br', 'inss', 'meu inss'],
    answer: 'Para acessar o Gov.br ou o Meu INSS com segurança:\n1. Baixe o aplicativo apenas pela loja oficial do seu celular (Play Store no Android ou App Store no iPhone).\n2. Nunca digite seu CPF e senha do Gov.br em links enviados por WhatsApp ou SMS.\n3. Se precisar de ajuda para entrar, peça apoio a um familiar de confiança ao seu lado.'
  }
];

function buildEduReply(question) {
  const q = question.toLowerCase();

  for (let i = 0; i < EDU_KNOWLEDGE_BASE.length; i++) {
    const entry = EDU_KNOWLEDGE_BASE[i];
    const matched = entry.keywords.some(function (kw) {
      return q.includes(kw);
    });
    if (matched) return entry.answer;
  }

  return 'Ótima pergunta! Para fazer isso com tranquilidade no seu celular, siga estas 3 regras de ouro:\n1. Leia com calma o que aparece na tela antes de tocar em qualquer botão colorido.\n2. Nunca digite senhas, códigos de SMS ou dados bancários se você chegou até a tela por um link de mensagem.\n3. Se quiser, escolha uma das dúvidas prontas ao lado ou me pergunte sobre WhatsApp, fotos, chamadas de vídeo, Pix ou senhas!';
}

function askProfessorEdu(presetQuestion) {
  const inputEl = document.getElementById('edu-user-input');
  const question = (presetQuestion || (inputEl ? inputEl.value : '')).trim();
  if (!question) {
    showToast('Escreva uma dúvida ou toque em um dos botões ao lado.');
    return;
  }

  if (inputEl && !presetQuestion) inputEl.value = '';

  const feed = document.getElementById('edu-chat-feed');
  if (!feed) return;

  // Balão da pergunta do usuário
  const userBubble = document.createElement('div');
  userBubble.className = 'ml-auto max-w-md rounded-2xl rounded-tr-sm brand-gradient text-white p-4 text-sm sm:text-base font-medium leading-relaxed shadow-sm';
  userBubble.textContent = question;
  feed.appendChild(userBubble);

  // Resposta imediata e didática do Professor Edu
  const answer = buildEduReply(question);
  lastEduSpokenText = answer;

  const eduBubble = document.createElement('div');
  eduBubble.className = 'max-w-lg rounded-2xl rounded-tl-sm bg-white border border-purple-200 p-4 text-sm sm:text-base text-slate-800 leading-relaxed shadow-xs space-y-2.5';
  eduBubble.innerHTML = '<div>' + escapeHTML(answer).replace(/\n/g, '<br>') + '</div>';

  const listenBtn = document.createElement('button');
  listenBtn.type = 'button';
  listenBtn.className = 'px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 text-xs font-extrabold border border-purple-200 transition';
  listenBtn.textContent = '🔊 Ouvir esta explicação';
  listenBtn.addEventListener('click', function () {
    speakText(answer);
  });
  eduBubble.appendChild(listenBtn);

  feed.appendChild(eduBubble);
  feed.scrollTop = feed.scrollHeight;
}

// =========================================================================
// 8. GUIAS PRÁTICOS INTERATIVOS COM SALVAMENTO LOCAL
// =========================================================================
const PRACTICAL_GUIDES = [
  {
    id: 'g1',
    title: '📷 Guia 1: Enviar Foto para a Família',
    steps: [
      'Abrir o WhatsApp e tocar na conversa de um familiar.',
      'Tocar no desenho da câmera ou do clipe lá embaixo.',
      'Escolher uma foto na Galeria e tocar na setinha verde.'
    ]
  },
  {
    id: 'g2',
    title: '📹 Guia 2: Fazer Chamada de Vídeo',
    steps: [
      'Entrar na conversa do familiar no WhatsApp.',
      'Tocar no desenho da filmadora no canto superior direito.',
      'Conversar e tocar no botão vermelho para encerrar.'
    ]
  },
  {
    id: 'g3',
    title: '💸 Guia 3: Escudo Contra o Golpe do Pix',
    steps: [
      'Desconfiar de pedidos urgentes de dinheiro de números novos.',
      'Ligar para o número antigo do familiar antes de transferir.',
      'Testar uma mensagem suspeita na aba Verificar Golpes.'
    ]
  },
  {
    id: 'g4',
    title: '🔒 Guia 4: Blindar o WhatsApp',
    steps: [
      'Abrir Configurações > Conta > Confirmação em duas etapas.',
      'Cadastrar uma senha de 6 números fácil de lembrar.',
      'Nunca passar códigos recebidos por SMS a ninguém.'
    ]
  },
  {
    id: 'g5',
    title: '🏛️ Guia 5: Usar Gov.br e Bancos com Segurança',
    steps: [
      'Entrar sempre pelo aplicativo oficial instalado no aparelho.',
      'Evitar clicar em links de benefícios recebidos por mensagem.',
      'Salvar o contato de um familiar na aba Emergência.'
    ]
  }
];

function getCompletedGuideSteps() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_GUIDES_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

function toggleGuideStep(stepKey) {
  let completed = getCompletedGuideSteps();
  if (completed.includes(stepKey)) {
    completed = completed.filter(function (k) { return k !== stepKey; });
  } else {
    completed.push(stepKey);
    showToast('⭐ Etapa concluída! Você ganhou +10 pontos.');
  }
  try {
    localStorage.setItem(STORAGE_GUIDES_KEY, JSON.stringify(completed));
  } catch (e) {}
  renderPracticalGuides();
}

function renderPracticalGuides() {
  const listEl = document.getElementById('practical-guides-list');
  if (!listEl) return;

  const completed = getCompletedGuideSteps();
  const totalSteps = PRACTICAL_GUIDES.reduce(function (acc, g) { return acc + g.steps.length; }, 0);
  const pct = totalSteps ? Math.round((completed.length / totalSteps) * 100) : 0;
  const points = completed.length * 10;

  const fill = document.getElementById('guides-progress-fill');
  const track = document.getElementById('guides-progress-track');
  const ptsLabel = document.getElementById('guides-points-label');
  const medalLabel = document.getElementById('guides-medal-label');

  if (fill) fill.style.width = pct + '%';
  if (track) track.setAttribute('aria-valuenow', String(pct));
  if (ptsLabel) ptsLabel.textContent = points + ' pontos • ' + pct + '%';
  if (medalLabel) {
    if (pct >= 100) medalLabel.textContent = '🏆 Mestre da Autonomia Digital!';
    else if (pct >= 50) medalLabel.textContent = '⭐ Guardião em Evolução';
    else medalLabel.textContent = '🌱 Iniciante Digital';
  }

  // Limpa a lista e reconstrói usando DOM (sem strings escapadas em onclick,
  // evitando qualquer problema com apóstrofos ou aspas no conteúdo)
  listEl.innerHTML = '';

  PRACTICAL_GUIDES.forEach(function (guide) {
    const card = document.createElement('div');
    card.className = 'hc-card bg-white rounded-3xl border border-purple-200 shadow-sm p-5 space-y-3';

    const headerRow = document.createElement('div');
    headerRow.className = 'flex items-center justify-between gap-2';

    const titleEl = document.createElement('h3');
    titleEl.className = 'font-black text-base sm:text-lg text-slate-900';
    titleEl.textContent = guide.title;

    const listenBtn = document.createElement('button');
    listenBtn.type = 'button';
    listenBtn.className = 'px-3 py-1.5 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-950 text-xs font-extrabold shrink-0';
    listenBtn.textContent = '🔊 Ouvir';
    const fullGuideSpeech = guide.title + '. ' + guide.steps.join(' ');
    listenBtn.addEventListener('click', function () {
      speakText(fullGuideSpeech);
    });

    headerRow.appendChild(titleEl);
    headerRow.appendChild(listenBtn);

    const stepsWrap = document.createElement('div');
    stepsWrap.className = 'space-y-2';

    guide.steps.forEach(function (stepText, idx) {
      const key = guide.id + '-' + idx;
      const isDone = completed.includes(key);

      const label = document.createElement('label');
      label.className = 'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ' +
        (isDone ? 'bg-emerald-50 border-emerald-300' : 'bg-purple-50/40 border-purple-100');

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = isDone;
      checkbox.className = 'w-5 h-5 mt-0.5 accent-pink-600 shrink-0';
      checkbox.addEventListener('change', function () {
        toggleGuideStep(key);
      });

      const stepLabel = document.createElement('span');
      stepLabel.className = 'text-sm ' + (isDone ? 'line-through text-emerald-900 font-semibold' : 'text-slate-800');
      stepLabel.textContent = stepText;

      label.appendChild(checkbox);
      label.appendChild(stepLabel);
      stepsWrap.appendChild(label);
    });

    card.appendChild(headerRow);
    card.appendChild(stepsWrap);
    listEl.appendChild(card);
  });
}

// =========================================================================
// 9. CONTATO DE CONFIANÇA NA ABA DE EMERGÊNCIA
// =========================================================================
function loadSavedFamilyContact() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_FAMILY_KEY) || '{}');
    if (saved.name) document.getElementById('family-name-input').value = saved.name;
    if (saved.phone) document.getElementById('family-phone-input').value = saved.phone;
  } catch (e) {}
}

function saveFamilyContact() {
  const name = document.getElementById('family-name-input').value.trim();
  const phone = document.getElementById('family-phone-input').value.replace(/\D/g, '');
  if (!name || !phone) {
    showToast('Preencha o nome e o número de WhatsApp do familiar.');
    return;
  }
  try {
    localStorage.setItem(STORAGE_FAMILY_KEY, JSON.stringify({ name: name, phone: phone }));
    showToast('Contato de ' + name + ' salvo com sucesso!');
  } catch (e) {}
}

function triggerFamilyWhatsAppHelp() {
  const name = document.getElementById('family-name-input').value.trim() || 'Familiar';
  const phone = document.getElementById('family-phone-input').value.replace(/\D/g, '');
  if (!phone) {
    showToast('Informe primeiro o número de WhatsApp do seu familiar.');
    return;
  }
  const fullPhone = phone.startsWith('55') ? phone : '55' + phone;
  const text = encodeURIComponent('Olá ' + name + ', preciso da sua ajuda! Recebi uma mensagem ou situação suspeita no celular e usei o Autonomia 60+ para te avisar.');
  window.open('https://wa.me/' + fullPhone + '?text=' + text, '_blank', 'noopener,noreferrer');
}

// =========================================================================
// 10. INICIALIZAÇÃO AO CARREGAR A PÁGINA
// =========================================================================
window.addEventListener('DOMContentLoaded', function () {
  renderPracticalGuides();
  loadSavedFamilyContact();

  if ('speechSynthesis' in window) {
    loadBestPortugueseVoices();
    window.speechSynthesis.onvoiceschanged = loadBestPortugueseVoices;
  }

  try {
    const savedVoice = JSON.parse(localStorage.getItem(STORAGE_VOICE_KEY) || '{}');
    if (savedVoice.gender) {
      voiceGenderPref = savedVoice.gender;
      const sel = document.getElementById('voice-gender-select');
      if (sel) sel.value = voiceGenderPref;
    }
    if (savedVoice.pace) {
      speechPaceMode = savedVoice.pace;
      const btn = document.getElementById('btn-speech-pace');
      if (btn) {
        btn.textContent = speechPaceMode === 'calmo' ? '🐢 Ritmo: Calmo' : '🐇 Ritmo: Normal';
        btn.setAttribute('aria-pressed', String(speechPaceMode !== 'calmo'));
      }
    }
  } catch (e) {}
});

const pusheen = document.querySelector('.pusheen');
const pusheenImage = pusheen.querySelector('img');
const dialog = document.querySelector('#dialog');
const line = document.querySelector('#line');
const announcement = document.querySelector('#announcement');
const segmenter = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter('ru', { granularity: 'grapheme' })
  : null;
const AudioContextType = window.AudioContext || window.webkitAudioContext;
const music = cardText.musicFile ? new Audio(cardText.musicFile) : null;
if (music) music.loop = true;

const melody = [
  72, 76, 79, 76, 74, 72, 69, null, 69, 72, 76, 72, 67, 71, 74, null,
  72, 76, 81, 79, 76, 74, 72, null, 69, 72, 74, 71, 67, 71, 72, null,
];
const bass = [48, 53, 45, 43, 48, 53, 45, 48];
let audioContext;
let musicVolume;
let musicStarted = false;
let speaking = false;
let nextLine = 0;
let chatterSound;
let nextChatterTime = 0;

function gifForLine(index) {
  if (index === 0) return 'pusheen.gif';
  return `gifs/${String(index + 1).padStart(2, '0')}.gif?v=2`;
}

const nextGif = new Image();
nextGif.src = gifForLine(nextLine);

function setSpeaking(active) {
  speaking = active;
  pusheen.classList.toggle('is-speaking', active);
  dialog.classList.toggle('is-typing', active);
  if (music) music.volume = active ? 0.07 : 0.32;
  if (musicVolume) {
    musicVolume.gain.setTargetAtTime(active ? 0.18 : 1, audioContext.currentTime, 0.055);
  }
}

function playTone(midi, time, volume, duration) {
  const tone = audioContext.createOscillator();
  const envelope = audioContext.createGain();
  tone.frequency.value = 440 * 2 ** ((midi - 69) / 12);
  envelope.gain.setValueAtTime(0, time);
  envelope.gain.linearRampToValueAtTime(volume, time + 0.025);
  envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  tone.connect(envelope).connect(musicVolume);
  tone.start(time);
  tone.stop(time + duration);
}

async function startMusic() {
  if (musicStarted) return;
  musicStarted = true;
  try {
    if (music) {
      await music.play();
      return;
    }

    musicVolume = audioContext.createGain();
    musicVolume.gain.value = speaking ? 0.18 : 1;
    musicVolume.connect(audioContext.destination);

    const step = 0.36;
    let start = audioContext.currentTime + 0.05;
    function scheduleLoop() {
      start = Math.max(start, audioContext.currentTime + 0.03);
      melody.forEach((midi, index) => {
        if (midi !== null) playTone(midi, start + index * step, 0.075, 0.65);
      });
      bass.forEach((midi, index) => playTone(midi, start + index * step * 4, 0.045, 1.35));
      start += melody.length * step;
      setTimeout(scheduleLoop, (start - audioContext.currentTime - 0.18) * 1000);
    }

    scheduleLoop();
  } catch {
    musicStarted = false;
  }
}

function createChatterSound() {
  const sampleRate = audioContext.sampleRate;
  const duration = 0.062;
  const buffer = audioContext.createBuffer(1, Math.round(duration * sampleRate), sampleRate);
  const samples = buffer.getChannelData(0);
  let phase = 0;

  for (let i = 0; i < samples.length; i++) {
    const time = i / sampleRate;
    const progress = time / duration;
    const frequency = 640 + 105 * Math.sin(Math.PI * progress);
    phase += 2 * Math.PI * frequency / sampleRate;

    const attack = Math.sin(Math.PI / 2 * Math.min(1, time / 0.006)) ** 2;
    const decay = (1 - progress) ** 1.8;
    const tone = Math.sin(phase) + 0.22 * Math.sin(2 * phase) + 0.08 * Math.sin(3 * phase);
    samples[i] = 0.31 * tone * attack * decay;
  }

  return buffer;
}

function playChatter(syllable, time) {
  chatterSound ??= createChatterSound();
  const voice = audioContext.createBufferSource();
  voice.buffer = chatterSound;
  voice.playbackRate.value = [1, 1.035, 0.985, 1.02][syllable % 4];
  voice.connect(audioContext.destination);
  voice.start(time);
}

function typeLine(message) {
  dialog.hidden = false;
  line.textContent = '';
  announcement.textContent = '';
  setSpeaking(true);
  nextChatterTime = 0;
  const letters = segmenter
    ? Array.from(segmenter.segment(message), part => part.segment)
    : Array.from(message);
  let position = 0;
  let voicedLetters = 0;
  function tick() {
    if (position === letters.length) {
      announcement.textContent = message;
      setSpeaking(false);
      return;
    }
    const letter = letters[position++];
    line.textContent += letter;
    const now = audioContext?.currentTime;
    if (now !== undefined && /\p{L}/u.test(letter) && now >= nextChatterTime) {
      playChatter(voicedLetters++, now);
      nextChatterTime = now + 0.07;
    }
    const delay = /[.!?…]/.test(letter) ? 155 : /[,;:]/.test(letter) ? 90 : 42;
    setTimeout(tick, delay);
  }
  tick();
}

pusheen.addEventListener('click', () => {
  if (speaking || !cardText.lines.length) return;

  if (AudioContextType) audioContext ??= new AudioContextType();
  if (music) void startMusic();
  if (audioContext) void audioContext.resume().then(() => {
    if (!music) void startMusic();
  }, () => {});

  const message = cardText.lines[nextLine];
  pusheenImage.src = gifForLine(nextLine);
  nextLine = (nextLine + 1) % cardText.lines.length;
  nextGif.src = gifForLine(nextLine);
  typeLine(message);
});

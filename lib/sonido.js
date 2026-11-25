'use client';
// Alertas con sonido y vibración. Los celulares bloquean el audio hasta el primer toque,
// por eso "desbloquear()" se llama en cualquier clic de la pantalla.
let ctx = null;

export function desbloquear() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* sin audio */ }
}

function tono(freq, inicio, dur, vol = 0.25) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = 'square'; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, ctx.currentTime + inicio);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + inicio + dur);
  o.connect(g); g.connect(ctx.destination);
  o.start(ctx.currentTime + inicio); o.stop(ctx.currentTime + inicio + dur + 0.05);
}

// tipo: 'nuevo' (te llamaron), 'listo' (la pizza salió del horno), 'suave'
export function alerta(tipo = 'nuevo') {
  desbloquear();
  try {
    if (ctx) {
      if (tipo === 'nuevo') [0, 0.25, 0.5, 1.0, 1.25, 1.5].forEach((t, i) => tono(i % 3 === 2 ? 1320 : 990, t, 0.18));
      else if (tipo === 'listo') [0, 0.18, 0.36].forEach((t, i) => tono(660 + i * 220, t, 0.16));
      else tono(880, 0, 0.3, 0.15);
    }
  } catch { /* el navegador puede bloquear el audio */ }
  try { if (navigator.vibrate) navigator.vibrate(tipo === 'nuevo' ? [400, 150, 400, 150, 600] : [250, 100, 250]); } catch { }
}

// Mantiene la pantalla encendida (si el celular lo permite)
export async function pantallaEncendida() {
  try { if ('wakeLock' in navigator) return await navigator.wakeLock.request('screen'); } catch { }
  return null;
}

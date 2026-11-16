// Der Zeitplan der Rituale als reine Rechnung: kein `$`, nur Zahlen rein, Zahlen raus.
import type { Phase, Plan, Schalter, Tassen } from '../types'

export const MIN = 60_000
export const WASSER_MS = 30 * MIN
export const ARBEIT_MS = 80 * MIN
export const BEWEGEN_MS = 2 * MIN
export const ZEICHNEN_MS = 10 * MIN
/**
 * Ein Schluck, der während eines Blocks fällig wurde, kommt so lange nach dessen Ende:
 * nach «Stift weg» bleiben ein, zwei Minuten zum Fertigzeichnen, die er nicht stören soll.
 */
export const NACH_BLOCK_MS = 3 * MIN
/** Eine Lücke über diese Dauer heisst: Computer schlief oder Claude war zu. Dann frisch anfangen. */
export const WEG_MS = 15 * MIN
/** So lange ohne Tastatur und Maus heisst: niemand am Computer. Die Rituale ruhen. */
export const ABWESEND_MS = 25 * MIN
/** So lange bleibt eine unbeantwortete Wasser-Erinnerung über dem Eingabefeld stehen. */
export const WASSER_SICHTBAR_MS = 15 * MIN

export type Signal = 'wasser' | 'bewegen' | 'zeichnen' | 'stiftWeg'

export const SCHALTER_AN: Schalter = {
  wasser: true,
  bewegen: true,
  zeichnen: true,
  stiftWeg: true,
}

export const KEINE_TASSEN: Tassen = { tag: '', anzahl: 0 }

export function frisch(jetzt: number): Plan {
  return {
    phase: 'arbeit',
    start: jetzt,
    ende: jetzt + ARBEIT_MS,
    wasserFaellig: jetzt + WASSER_MS,
    wasserOffen: null,
    letzterTick: jetzt,
    weg: false,
  }
}

function block(p: Plan, phase: Phase, dauer: number, jetzt: number): Plan {
  return { ...p, phase, start: jetzt, ende: jetzt + dauer, wasserOffen: null }
}

/** Zurück an die Arbeit: neue 80 Minuten; ein aufgestauter Schluck kommt eine Minute später. */
export function zurArbeit(p: Plan, jetzt: number): Plan {
  return {
    ...p,
    phase: 'arbeit',
    start: jetzt,
    ende: jetzt + ARBEIT_MS,
    wasserFaellig:
      p.phase === 'arbeit'
        ? p.wasserFaellig
        : Math.max(p.wasserFaellig, jetzt + NACH_BLOCK_MS),
  }
}

/**
 * Ein Takt: rechnet den Plan auf `jetzt` vor und sagt, welche Erinnerungen
 * dabei fällig wurden. `leerlauf`: wie lange Tastatur und Maus schon ruhen.
 */
export function weiter(
  alt: Plan | null,
  s: Schalter,
  jetzt: number,
  leerlauf = 0,
): { plan: Plan; signale: Signal[] } {
  if (alt === null || jetzt - alt.letzterTick > WEG_MS || jetzt < alt.start) {
    return { plan: frisch(jetzt), signale: [] }
  }

  const signale: Signal[] = []
  // Das Lebenszeichen nur einmal pro Minute erneuern: spart Schreibzugriffe.
  let p: Plan = {
    ...alt,
    letzterTick: jetzt - alt.letzterTick >= MIN ? jetzt : alt.letzterTick,
  }

  // Niemand am Computer? Nur während der Arbeit gefragt: Bewegen und Zeichnen
  // laufen ohne Tastatur. Gezählt wird frühestens ab Beginn der Arbeitsphase,
  // sonst gälte die Zeichenpause schon als Abwesenheit.
  if (p.phase === 'arbeit') {
    const ruhe = Math.min(leerlauf, jetzt - p.start)
    if (ruhe >= ABWESEND_MS) {
      return { plan: { ...p, weg: true, wasserOffen: null }, signale: [] }
    }
    // Zurück: frischer 80-Minuten-Block, Wasser in 30 Minuten.
    if (p.weg) return { plan: frisch(jetzt), signale: [] }
  }

  // Arbeit vorbei: Pause beginnt mit dem ersten eingeschalteten Block.
  if (p.phase === 'arbeit' && jetzt >= p.ende) {
    if (s.bewegen) {
      p = block(p, 'bewegen', BEWEGEN_MS, jetzt)
      signale.push('bewegen')
    } else if (s.zeichnen) {
      p = block(p, 'zeichnen', ZEICHNEN_MS, jetzt)
      signale.push('zeichnen')
    } else {
      p = zurArbeit(p, jetzt)
    }
  }

  // Bewegen vorbei (oder ausgeschaltet): weiter zum Zeichnen oder zurück an die Arbeit.
  if (p.phase === 'bewegen' && (jetzt >= p.ende || !s.bewegen)) {
    if (s.zeichnen) {
      p = block(p, 'zeichnen', ZEICHNEN_MS, jetzt)
      signale.push('zeichnen')
    } else {
      p = zurArbeit(p, jetzt)
    }
  }

  // Zeichnen vorbei: «Stift weg», sofern die Zeit um ist und das Signal an.
  if (p.phase === 'zeichnen' && (jetzt >= p.ende || !s.zeichnen)) {
    const istUm = jetzt >= p.ende
    p = zurArbeit(p, jetzt)
    if (istUm && s.stiftWeg) signale.push('stiftWeg')
  }

  // Wasser kommt nur während der Arbeit; in einem Block wartet es.
  if (p.phase === 'arbeit' && jetzt >= p.wasserFaellig) {
    if (s.wasser) {
      signale.push('wasser')
      p = { ...p, wasserOffen: jetzt }
    }
    p = { ...p, wasserFaellig: jetzt + WASSER_MS }
  }

  if (
    p.wasserOffen !== null &&
    (p.phase !== 'arbeit' || !s.wasser || jetzt - p.wasserOffen > WASSER_SICHTBAR_MS)
  ) {
    p = { ...p, wasserOffen: null }
  }

  return { plan: p, signale }
}

// ── Tassen ──────────────────────────────────────────────────────────────

function zweistellig(n: number): string {
  return String(n).padStart(2, '0')
}

export function heute(jetzt: number): string {
  const d = new Date(jetzt)
  return `${d.getFullYear()}-${zweistellig(d.getMonth() + 1)}-${zweistellig(d.getDate())}`
}

export function tassenHeute(t: Tassen, jetzt: number): number {
  return t.tag === heute(jetzt) ? t.anzahl : 0
}

export function tasseDazu(t: Tassen, jetzt: number, um: number): Tassen {
  return { tag: heute(jetzt), anzahl: Math.max(0, tassenHeute(t, jetzt) + um) }
}

// ── Gelesenes aus dem Speicher prüfen ───────────────────────────────────

function istZahl(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x)
}

export function alsPlan(x: unknown): Plan | null {
  if (typeof x !== 'object' || x === null) return null
  const p = x as Record<string, unknown>
  const phaseOk = p.phase === 'arbeit' || p.phase === 'bewegen' || p.phase === 'zeichnen'
  if (
    !phaseOk ||
    !istZahl(p.start) ||
    !istZahl(p.ende) ||
    !istZahl(p.wasserFaellig) ||
    !istZahl(p.letzterTick) ||
    !(p.wasserOffen === null || istZahl(p.wasserOffen))
  ) {
    return null
  }
  return {
    phase: p.phase as Phase,
    start: p.start,
    ende: p.ende,
    wasserFaellig: p.wasserFaellig,
    wasserOffen: p.wasserOffen as number | null,
    letzterTick: p.letzterTick,
    // Ein Plan aus der Zeit vor der Abwesenheits-Erkennung kennt das Feld nicht.
    weg: p.weg === true,
  }
}

export function alsSchalter(x: unknown): Schalter {
  const p = typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : {}
  const ja = (k: keyof Schalter) => (typeof p[k] === 'boolean' ? (p[k] as boolean) : SCHALTER_AN[k])
  return { wasser: ja('wasser'), bewegen: ja('bewegen'), zeichnen: ja('zeichnen'), stiftWeg: ja('stiftWeg') }
}

/** Der Name für die Ansagen: getrimmt, höchstens 40 Zeichen, sonst leer. */
export function alsName(x: unknown): string {
  return typeof x === 'string' ? x.trim().replace(/\s+/g, ' ').slice(0, 40) : ''
}

export function alsTassen(x: unknown): Tassen {
  if (typeof x !== 'object' || x === null) return KEINE_TASSEN
  const p = x as Record<string, unknown>
  return typeof p.tag === 'string' && istZahl(p.anzahl) && p.anzahl >= 0
    ? { tag: p.tag, anzahl: Math.floor(p.anzahl) }
    : KEINE_TASSEN
}

// ── Zeit lesbar machen ─────────────────────────────────────────────────

/** «12 Min», unter einer Minute «unter 1 Min». */
export function minuten(ms: number): string {
  const m = Math.ceil(Math.max(0, ms) / MIN)
  return m <= 1 && ms < MIN ? 'unter 1 Min' : `${m} Min`
}

/** «1:35» */
export function uhr(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${zweistellig(s % 60)}`
}

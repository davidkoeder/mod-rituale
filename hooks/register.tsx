import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Plan, Schalter, Tassen } from '../types'
import {
  ABWESEND_MS,
  ARBEIT_MS,
  KEINE_TASSEN,
  MIN,
  NACH_BLOCK_MS,
  SCHALTER_AN,
  WASSER_MS,
  ZEICHNEN_MS,
  alsPlan,
  alsSchalter,
  alsName,
  alsTassen,
  frisch,
  minuten,
  tasseDazu,
  tassenHeute,
  uhr,
  weiter,
  zurArbeit,
} from './logik'
import type { Signal } from './logik'

type Dollar = EngineInterface
type Daten = { plan: Plan; schalter: Schalter; tassen: Tassen; name: string }

const PANE = 'rituale'
const TAKT_MS = 5_000
/** So oft fragt die Mod macOS, wie lange Tastatur und Maus schon ruhen. */
const LEERLAUF_ALLE_MS = 15_000

// Was die Anzeige liest. Die Wahrheit liegt in $.store (über Sitzungen hinweg);
// der Takt spiegelt sie hierher, damit Bedienfeld und Leiste neu zeichnen.
const planAtom = atom({ plugin: 'rituale', key: 'plan' } as const, null, { shape: 'plan-2' })
const erkennungAtom = atom({ plugin: 'rituale', key: 'erkennung' } as const, true)
const schalterAtom = atom({ plugin: 'rituale', key: 'schalter' } as const, SCHALTER_AN, {
  shape: 'schalter-1',
})
const tassenAtom = atom({ plugin: 'rituale', key: 'tassen' } as const, KEINE_TASSEN, {
  shape: 'tassen-1',
})
const jetztAtom = atom({ plugin: 'rituale', key: 'jetzt' } as const, 0)
/** Der Name für die Ansagen; leer heisst: ohne Namen. */
const nameAtom = atom({ plugin: 'rituale', key: 'name' } as const, '')

/** «Hallo Petra» mit Namen, «Hallo» ohne. */
const hallo = (name: string) => (name ? `Hallo ${name}` : 'Hallo')

/**
 * Jede Erinnerung: Text auf dem Bildschirm, eigener Ton, und danach sagt die
 * Mac-Stimme «Anna» den Satz laut, mit dem Namen aus dem Bedienfeld.
 * `nach` ist der Abstand vom Ton zur Stimme.
 */
const MELDUNG: Record<
  Signal,
  { text: string; klang: string; sprich: (name: string) => string; nach: number }
> = {
  wasser: {
    text: 'Ein Schluck warmes Wasser aus der Thermoskanne.',
    klang: 'sounds/wasser.wav',
    sprich: name => `${hallo(name)}, es ist wieder Zeit für einen Schluck Wasser`,
    nach: 900,
  },
  bewegen: {
    text: 'Pause: 2 Minuten bewegen.',
    klang: 'sounds/bewegen.wav',
    sprich: name =>
      `${hallo(name)}, Zeit, kurz zwei Minuten aufzustehen und den Körper zu spüren.`,
    nach: 1_300,
  },
  zeichnen: {
    text: '10 Minuten zeichnen, mit Block und Bleistift.',
    klang: 'sounds/zeichnen.wav',
    // Mit Bindestrichen liest die Stimme es als ein Wort, statt drei einzeln zu betonen.
    sprich: name => `${hallo(name)}, dein Zehn-Minuten-Zeichenmoment beginnt jetzt.`,
    nach: 1_000,
  },
  stiftWeg: {
    text: 'Stift weg.',
    klang: 'sounds/stiftweg.wav',
    sprich: name =>
      `${name ? `${name}, der` : 'Der'} Zeichenmoment ist vorbei, beende die Zeichnung in ein oder zwei Minuten.`,
    nach: 1_400,
  },
}
/** Die Mac-Stimme, die spricht: fest Anna. */
const STIMME = 'Anna'
const PROBE_FOLGE: Signal[] = ['wasser', 'bewegen', 'zeichnen', 'stiftWeg']
// Die Sätze sind länger geworden: genug Abstand, damit kein Ton in eine Ansage fällt.
const PROBE_ABSTAND_MS = 10_000

const gleich = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// Ein Schritt nach dem anderen: Takt und Knöpfe sollen sich nicht überholen.
let kette: Promise<unknown> = Promise.resolve()
function exklusiv(fn: () => Promise<void>): Promise<void> {
  const lauf = kette.then(fn, fn)
  kette = lauf.catch(() => undefined)
  return lauf
}

let letzterStatus = ''

async function laden($: Dollar) {
  const [plan, schalter, tassen, name] = await Promise.all([
    $.store.get('plan'),
    $.store.get('schalter'),
    $.store.get('tassen'),
    $.store.get('name'),
  ])
  return {
    plan: alsPlan(plan),
    schalter: alsSchalter(schalter),
    tassen: alsTassen(tassen),
    name: alsName(name),
  }
}

async function zeigen($: Dollar, d: Daten, jetzt: number) {
  if (!gleich(await read($, planAtom), d.plan)) await update($, planAtom, () => d.plan)
  if (!gleich(await read($, schalterAtom), d.schalter)) await update($, schalterAtom, () => d.schalter)
  if (!gleich(await read($, tassenAtom), d.tassen)) await update($, tassenAtom, () => d.tassen)
  if ((await read($, nameAtom)) !== d.name) await update($, nameAtom, () => d.name)
  await update($, jetztAtom, () => jetzt)
}

function statuszeile($: Dollar, d: Daten, jetzt: number) {
  const { plan: p, schalter: s } = d
  const teile: string[] = []
  if (p.weg) teile.push('ruht, niemand am Computer')
  else if (p.phase === 'bewegen') teile.push(`Bewegen, noch ${minuten(p.ende - jetzt)}`)
  else if (p.phase === 'zeichnen') teile.push(`Zeichnen, noch ${minuten(p.ende - jetzt)}`)
  else {
    if (s.wasser) teile.push(`Wasser in ${minuten(p.wasserFaellig - jetzt)}`)
    if (s.bewegen || s.zeichnen) teile.push(`Pause in ${minuten(p.ende - jetzt)}`)
  }
  const n = tassenHeute(d.tassen, jetzt)
  teile.push(`${n} ${n === 1 ? 'Tasse' : 'Tassen'}`)
  const text = `Rituale · ${teile.join(' · ')}`
  if (text !== letzterStatus) {
    letzterStatus = text
    $.ui.status(text)
  }
}

function melden($: Dollar, signal: Signal, name: string, istProbe = false) {
  const { text, klang, sprich, nach } = MELDUNG[signal]
  const zeile = istProbe ? `Probe · ${text}` : text
  $.ui.toast(zeile, { timeoutMs: 20_000 })
  $.audio.play({ asset: klang }).catch(() => undefined)
  $.ui.notify(zeile, { title: 'Rituale' }).catch(() => undefined)
  // Erst der Ton, dann die Stimme.
  $.clock.after(nach, () => {
    $.audio.speak(sprich(name), { voice: STIMME }).catch(() => undefined)
  })
}

// Probe: alle vier Signale nacheinander, im Abstand von 10 Sekunden. Ändert am Zeitplan nichts.
let probeBis = 0
async function probe($: Dollar) {
  const jetzt = await $.clock.now()
  if (jetzt < probeBis) return
  probeBis = jetzt + PROBE_FOLGE.length * PROBE_ABSTAND_MS
  const name = alsName(await $.store.get('name'))
  PROBE_FOLGE.forEach((signal, i) => {
    if (i === 0) melden($, signal, name, true)
    else $.clock.after(i * PROBE_ABSTAND_MS, () => melden($, signal, name, true))
  })
}

// Wie lange Tastatur und Maus ruhen: macOS führt die Zeit seit der letzten
// Eingabe als «HIDIdleTime» (in Nanosekunden). Gelesen alle 15 Sekunden.
let leerlaufMs = 0
let leerlaufUm = 0
let erkennungOk: boolean | null = null
async function leerlaufLesen($: Dollar, jetzt: number): Promise<number> {
  if (jetzt - leerlaufUm < LEERLAUF_ALLE_MS) return leerlaufMs
  leerlaufUm = jetzt
  let ms: number | null = null
  try {
    const r = await $.process.run(
      ['/usr/sbin/ioreg', '-r', '-c', 'IOHIDSystem', '-k', 'HIDIdleTime', '-d', '1'],
      { timeoutMs: 5_000 },
    )
    const treffer = /"HIDIdleTime" = (\d+)/.exec(r.stdout)
    if (r.exitCode === 0 && treffer) ms = Number(treffer[1] ?? 0) / 1e6
  } catch {
    ms = null
  }
  const ok = ms !== null
  if (ok !== erkennungOk) {
    erkennungOk = ok
    await update($, erkennungAtom, () => ok)
    await $.store.set('erkennung', ok ? 'ok' : 'fehlt')
  }
  // Ohne Erkennung gilt: immer jemand da (das alte Verhalten).
  leerlaufMs = ms ?? 0
  return leerlaufMs
}

/** Ein Takt: Plan vorrechnen, speichern, anzeigen, fällige Erinnerungen melden. */
function takt($: Dollar): Promise<void> {
  return exklusiv(async () => {
    const jetzt = await $.clock.now()
    const d = await laden($)
    const leerlauf = await leerlaufLesen($, jetzt)
    const { plan, signale } = weiter(d.plan, d.schalter, jetzt, leerlauf)
    if (!gleich(plan, d.plan)) await $.store.set('plan', plan)
    const neu = { ...d, plan }
    await zeigen($, neu, jetzt)
    statuszeile($, neu, jetzt)
    for (const signal of signale) melden($, signal, d.name)
  })
}

/** Für die Knöpfe: erst auf den Stand bringen, dann ändern, dann gleich wieder takten. */
async function aendern($: Dollar, fn: (d: Daten, jetzt: number) => Partial<Daten>) {
  await takt($)
  await exklusiv(async () => {
    const jetzt = await $.clock.now()
    const d = await laden($)
    const neu = fn({ ...d, plan: d.plan ?? frisch(jetzt) }, jetzt)
    if (neu.plan) await $.store.set('plan', neu.plan)
    if (neu.schalter) await $.store.set('schalter', neu.schalter)
    if (neu.tassen) await $.store.set('tassen', neu.tassen)
    if (neu.name !== undefined) await $.store.set('name', neu.name)
  })
  await takt($)
}

const umschalten = ($: Dollar, key: keyof Schalter) =>
  aendern($, (d, jetzt) => {
    const schalter = { ...d.schalter, [key]: !d.schalter[key] }
    // Wasser wieder an: der nächste Schluck in 30 Minuten, nicht sofort.
    const plan =
      key === 'wasser' && schalter.wasser ? { ...d.plan, wasserFaellig: jetzt + WASSER_MS } : d.plan
    return { schalter, plan }
  })
const pauseJetzt = ($: Dollar) =>
  aendern($, (d, jetzt) => (d.plan.phase === 'arbeit' ? { plan: { ...d.plan, ende: jetzt } } : {}))
const zurueckAnDieArbeit = ($: Dollar) => aendern($, (d, jetzt) => ({ plan: zurArbeit(d.plan, jetzt) }))
const getrunken = ($: Dollar) => aendern($, d => ({ plan: { ...d.plan, wasserOffen: null } }))
const tasse = ($: Dollar, um: number, schliessen = false) =>
  aendern($, (d, jetzt) => ({
    tassen: tasseDazu(d.tassen, jetzt, um),
    ...(schliessen ? { plan: { ...d.plan, wasserOffen: null } } : {}),
  }))
const nameSetzen = ($: Dollar, wert: string) => aendern($, () => ({ name: alsName(wert) }))

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'rituale',
      description: 'Zeigt die Rituale: Wasser, Bewegen, Zeichnen',
    })
    void $.ui.open({ id: PANE, title: 'Rituale' })
    await takt($)
    $.clock.every(TAKT_MS, () => {
      takt($).catch(() => undefined)
    })

    return next(e)
  })

  on('command.run', { command: 'rituale' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Rituale' })

    return { text: 'Rituale geöffnet.' }
  })

  // ── Das Bedienfeld ───────────────────────────────────────────────────

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const jetzt = await read($, jetztAtom)
    const gespeichert = await read($, planAtom)
    const s = await read($, schalterAtom)
    const t = await read($, tassenAtom)
    const erkennt = await read($, erkennungAtom)
    const name = await read($, nameAtom)

    if (jetzt === 0 || gespeichert === null) {
      return <Text dimColor>Rituale starten …</Text>
    }
    const p = gespeichert
    const n = tassenHeute(t, jetzt)
    const breite = Math.max(8, Math.min(28, e.props.bodyColumns - 2))

    const balken = (anteil: number) => {
      const voll = Math.round(Math.min(1, Math.max(0, anteil)) * breite)
      return '█'.repeat(voll) + '░'.repeat(breite - voll)
    }

    const knopf = (key: keyof Schalter, hotkey: string) => (
      <Button
        key={`schalter-${key}`}
        hotkey={hotkey}
        variant={s[key] ? 'primary' : 'secondary'}
        label={s[key] ? 'An' : 'Aus'}
        onPress={() => {
          void umschalten($, key)
        }}
      />
    )

    const zeile = (titel: string, zusatz: string, key: keyof Schalter, hotkey: string) => (
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={1}>
        <Text>
          <Text bold>{titel}</Text>
          <Text dimColor> {zusatz}</Text>
        </Text>
        {knopf(key, hotkey)}
      </Box>
    )

    // Wasser
    const pausenEnde = p.phase === 'bewegen' && s.zeichnen ? p.ende + ZEICHNEN_MS : p.ende
    const wasserText = !s.wasser
      ? 'Ausgeschaltet.'
      : p.weg
        ? 'Ruht, bis du zurück bist.'
        : p.phase !== 'arbeit' && p.wasserFaellig <= pausenEnde + NACH_BLOCK_MS
        ? 'Wartet, bis die Pause vorbei ist.'
        : `Nächster Schluck in ${minuten(p.wasserFaellig - jetzt)}.`

    // Arbeit oder laufender Block
    const pausenAn = s.bewegen || s.zeichnen
    const arbeit = p.weg ? (
      <Box flexDirection="column">
        <Text bold>Niemand am Computer</Text>
        <Text dimColor>
          Seit {String(ABWESEND_MS / MIN)} Minuten keine Eingabe. Die Rituale ruhen. Sobald du
          zurück bist, beginnt ein frischer 80-Minuten-Block.
        </Text>
      </Box>
    ) : p.phase === 'arbeit' ? (
        <Box flexDirection="column">
          <Text>
            <Text bold>Arbeit</Text>
            <Text dimColor>
              {' '}
              {Math.floor((jetzt - p.start) / MIN)} von {ARBEIT_MS / MIN} Min
            </Text>
          </Text>
          <Text color="claude">{balken((jetzt - p.start) / ARBEIT_MS)}</Text>
          <Text dimColor>
            {pausenAn ? `Pause in ${minuten(p.ende - jetzt)}.` : 'Pausen-Rituale ausgeschaltet.'}
          </Text>
          <Box flexDirection="row" gap={1} marginTop={1}>
            {pausenAn && (
              <Button key="pause-jetzt" hotkey="p" label="Pause jetzt" onPress={() => void pauseJetzt($)} />
            )}
            <Button key="neu-starten" hotkey="n" label="Neu starten" onPress={() => void zurueckAnDieArbeit($)} />
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Text>
            <Text bold color="success">
              {p.phase === 'bewegen' ? 'Bewegen' : 'Zeichnen mit Block und Bleistift'}
            </Text>
            <Text> noch {uhr(p.ende - jetzt)}</Text>
          </Text>
          <Text color="success">{balken((jetzt - p.start) / (p.ende - p.start))}</Text>
          <Box flexDirection="row" gap={1} marginTop={1}>
            <Button key="beenden" hotkey="e" label="Beenden" onPress={() => void zurueckAnDieArbeit($)} />
          </Box>
        </Box>
      )

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          {zeile('Wasser', 'alle 30 Min', 'wasser', 'w')}
          <Text dimColor>{wasserText}</Text>
          <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={1}>
            <Text>
              Tassen heute: <Text bold>{String(n)}</Text>
            </Text>
            <Box flexDirection="row" gap={1}>
              <Button key="tasse-weg" label="−1" onPress={() => void tasse($, -1)} />
              <Button key="tasse-dazu" hotkey="t" label="+1 Tasse" onPress={() => void tasse($, 1)} />
            </Box>
          </Box>
        </Box>

        {arbeit}

        <Box flexDirection="column">
          <Text bold>Pause nach 80 Min</Text>
          {zeile('Bewegen', '2 Min', 'bewegen', 'b')}
          {zeile('Zeichnen', '10 Min', 'zeichnen', 'z')}
          {zeile('Signal', '«Stift weg»', 'stiftWeg', 's')}
        </Box>

        <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={1}>
          <Text dimColor>Alle Signale anhören</Text>
          <Button key="probe" hotkey="h" label="Probe" onPress={() => void probe($)} />
        </Box>

        <Input
          key="name"
          label="Dein Name für die Ansagen"
          placeholder="Vorname, oder leer lassen"
          value={name}
          submitLabel="Speichern"
          onSubmit={wert => void nameSetzen($, wert)}
        />

        {!erkennt && (
          <Text dimColor>
            Ob jemand am Computer ist, kann die Mod hier nicht erkennen. Die Erinnerungen laufen
            deshalb auch weiter, wenn du weg bist.
          </Text>
        )}
      </Box>
    )
  })

  // ── Die Leiste über dem Eingabefeld: nur, wenn gerade etwas ansteht ──

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const p = await read($, planAtom)
    if (p === null || (p.phase === 'arbeit' && p.wasserOffen === null)) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)

    if (p.phase === 'arbeit') {
      return (
        <Box flexDirection="row" alignItems="center" gap={1} flexWrap="wrap">
          <Text>Ein Schluck warmes Wasser aus der Thermoskanne.</Text>
          <Button key="getrunken" variant="primary" label="Getrunken" onPress={() => void getrunken($)} />
          <Button key="tasse-leer" label="Tasse leer, +1" onPress={() => void tasse($, 1, true)} />
        </Box>
      )
    }

    const jetzt = await read($, jetztAtom)
    return (
      <Box flexDirection="row" alignItems="center" gap={1} flexWrap="wrap">
        <Text bold color="success">
          {p.phase === 'bewegen' ? 'Bewegen' : 'Zeichnen mit Block und Bleistift'}
        </Text>
        <Text>noch {uhr(p.ende - jetzt)}</Text>
        <Button key="band-beenden" label="Beenden" onPress={() => void zurueckAnDieArbeit($)} />
      </Box>
    )
  })
}

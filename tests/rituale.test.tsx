import { expect, mock, test } from 'claude-code/testing'

import { MIN, SCHALTER_AN, frisch, weiter } from '../hooks/logik'
import type { Signal } from '../hooks/logik'
import type { Plan, Schalter } from '../types'

/**
 * Lässt den Plan im 5-Sekunden-Takt laufen und sammelt die Signale mit Minute.
 * `leerlauf(t)`: wie lange Tastatur und Maus zur Zeit t schon ruhen.
 */
function laufen(
  bisMin: number,
  s: Schalter = SCHALTER_AN,
  plan: Plan = frisch(0),
  leerlauf: (t: number) => number = () => 0,
) {
  const signale: string[] = []
  let p = plan
  for (let t = 5_000; t <= bisMin * MIN; t += 5_000) {
    const r = weiter(p, s, t, leerlauf(t))
    p = r.plan
    for (const sig of r.signale) signale.push(`${sig}@${Math.floor(t / MIN)}`)
  }
  return { signale, plan: p }
}

test('ein ganzer Zyklus: Wasser wartet während der Pause', async () => {
  const { signale } = laufen(125)
  expect(signale).toEqual([
    'wasser@30',
    'wasser@60',
    'bewegen@80',
    'zeichnen@82',
    'stiftWeg@92',
    // fällig um 90, mitten im Zeichnen: kommt drei Minuten nach «Stift weg»
    'wasser@95',
    'wasser@125',
  ])
})

test('Bewegen aus: nach 80 Minuten direkt zeichnen', async () => {
  const { signale } = laufen(95, { ...SCHALTER_AN, bewegen: false })
  expect(signale).toEqual(['wasser@30', 'wasser@60', 'zeichnen@80', 'stiftWeg@90', 'wasser@93'])
})

test('jeder Schalter wirkt für sich', async () => {
  const ohneStift = laufen(95, { ...SCHALTER_AN, stiftWeg: false }).signale
  expect(ohneStift.includes('stiftWeg@92')).toBe(false)
  expect(ohneStift.includes('zeichnen@82')).toBe(true)

  const ohneWasser = laufen(95, { ...SCHALTER_AN, wasser: false }).signale
  expect(ohneWasser).toEqual(['bewegen@80', 'zeichnen@82', 'stiftWeg@92'])

  const ohnePause = laufen(170, { ...SCHALTER_AN, bewegen: false, zeichnen: false }).signale
  const nurWasser = ohnePause.every((s: string) => s.startsWith('wasser@'))
  expect(nurWasser).toBe(true)
})

test('Zeichnen ausgeschaltet während des Zeichnens: kein «Stift weg»', async () => {
  const mitten = laufen(85).plan
  expect(mitten.phase).toBe('zeichnen')
  const r = weiter(mitten, { ...SCHALTER_AN, zeichnen: false }, 85 * MIN + 5_000)
  expect(r.plan.phase).toBe('arbeit')
  expect(r.signale).toEqual([])
})

test('nach langer Lücke (Computer schlief) frisch anfangen, ohne Signalflut', async () => {
  const p = laufen(70).plan
  const r = weiter(p, SCHALTER_AN, 200 * MIN)
  expect(r.signale).toEqual([] as Signal[])
  expect(r.plan.phase).toBe('arbeit')
  expect(r.plan.ende).toBe(200 * MIN + 80 * MIN)
})

test('niemand am Computer: nach 25 Min still, bei Rückkehr frischer Block', async () => {
  // Letzte Eingabe bei Minute 10, zurück bei Minute 60.
  const leerlauf = (t: number) => (t < 10 * MIN || t >= 60 * MIN ? 0 : t - 10 * MIN)
  const { signale, plan } = laufen(125, SCHALTER_AN, frisch(0), leerlauf)
  // Wasser bei Minute 30 kommt noch (erst 20 Min Ruhe), ab Minute 35 still,
  // ab Minute 60 alles neu: Wasser 90, 120.
  expect(signale).toEqual(['wasser@30', 'wasser@90', 'wasser@120'])
  expect(plan.phase).toBe('arbeit')
  expect(plan.weg).toBe(false)
  expect(plan.ende).toBe(140 * MIN)
})

test('nachts: der ganze Abend und die Nacht bleiben still', async () => {
  // Letzte Eingabe bei Minute 5, danach bis Minute 600 niemand da.
  const { signale, plan } = laufen(600, SCHALTER_AN, frisch(0), t => Math.max(0, t - 5 * MIN))
  expect(signale).toEqual([])
  expect(plan.weg).toBe(true)
})

test('Zeichnen ohne Tastatur gilt nicht als Abwesenheit', async () => {
  // Letzte Eingabe bei Minute 80 (Pausenbeginn), danach zeichnet man auf Papier.
  const leerlauf = (t: number) => Math.max(0, t - 80 * MIN)
  const { signale, plan } = laufen(106, SCHALTER_AN, frisch(0), leerlauf)
  expect(signale).toEqual([
    'wasser@30',
    'wasser@60',
    'bewegen@80',
    'zeichnen@82',
    'stiftWeg@92',
    'wasser@95',
  ])
  expect(plan.weg).toBe(false)
  // Erst 25 Minuten nach «Stift weg» ohne Eingabe gilt man als weg.
  expect(laufen(118, SCHALTER_AN, frisch(0), leerlauf).plan.weg).toBe(true)
})

const PANE = {
  plugin: 'rituale',
  component: 'Pane',
  requestId: 'rituale',
  props: {
    title: 'Rituale',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('Bedienfeld: Schalter und Tassen, auf Terminal und Desktop', async ($, on) => {
  const uhrwerk = mock.clock(on, { now: Date.UTC(2026, 10, 16, 9, 0) })
  mock.store(on)
  const toasts: string[] = []
  on('command.register', () => ({ value: { command: 'rituale' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await uhrwerk.advance(30 * MIN + 5_000)
  expect(toasts).toEqual(['Ein Schluck warmes Wasser aus der Thermoskanne.'])

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Nächster Schluck in 30 Min/ })) !== undefined).toBe(true)

    await ui.press({ key: 'tasse-dazu' })
    expect((await ui.find({ type: 'Text', text: /^Tassen heute/ }))?.text).toBe(
      surface === 'terminal' ? 'Tassen heute: 1' : 'Tassen heute: 2',
    )

    await ui.press({ key: 'schalter-wasser' })
    expect((await ui.find({ key: 'schalter-wasser' }))?.text).toBe('Aus')
    await ui.press({ key: 'schalter-wasser' })
    expect((await ui.find({ key: 'schalter-wasser' }))?.text).toBe('An')
    await ui.unmount()
  }
})

test('Probe: alle vier Signale mit Ton und Stimme, Zeitplan bleibt', async ($, on) => {
  const uhrwerk = mock.clock(on, { now: Date.UTC(2026, 10, 16, 9, 0) })
  mock.store(on)
  const toasts: string[] = []
  const klaenge: string[] = []
  const gesagt: string[] = []
  on('command.register', () => ({ value: { command: 'rituale' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('audio.play', (_, e) => {
    klaenge.push(String(e.clip.asset))
    return { value: undefined }
  })
  on('audio.speak', (_, e) => {
    gesagt.push(e.text)
    return { value: { via: 'system' as const } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'probe' })
  await uhrwerk.advance(35_000)
  // Der Zeitplan läuft unberührt weiter: noch immer Arbeit, keine Pause ausgelöst.
  const arbeit = await ui.find({ type: 'Text', text: /^Pause in 80 Min/ })
  await ui.unmount()

  expect(klaenge).toEqual([
    'sounds/wasser.wav',
    'sounds/bewegen.wav',
    'sounds/zeichnen.wav',
    'sounds/stiftweg.wav',
  ])
  expect(gesagt).toEqual([
    // Noch kein Name eingetragen: die Ansagen kommen ohne Namen.
    'Hallo, es ist wieder Zeit für einen Schluck Wasser',
    'Hallo, Zeit, kurz zwei Minuten aufzustehen und den Körper zu spüren.',
    'Hallo, dein Zehn-Minuten-Zeichenmoment beginnt jetzt.',
    'Der Zeichenmoment ist vorbei, beende die Zeichnung in ein oder zwei Minuten.',
  ])
  expect(toasts.every((t: string) => t.startsWith('Probe · '))).toBe(true)
  expect(arbeit !== undefined).toBe(true)
})

test('Bedienfeld zeigt «Niemand am Computer» und kehrt bei Eingabe zurück', async ($, on) => {
  const uhrwerk = mock.clock(on, { now: Date.UTC(2026, 10, 16, 9, 0) })
  mock.store(on)
  let ruheNs = 0
  on('command.register', () => ({ value: { command: 'rituale' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', () => ({
    value: {
      exitCode: 0,
      stdout: `  |   "HIDIdleTime" = ${ruheNs}\n`,
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /nicht erkennen/ })) === undefined).toBe(true)

  // 30 Minuten niemand da
  ruheNs = 30 * MIN * 1e6
  await uhrwerk.advance(30 * MIN)
  expect((await ui.find({ type: 'Text', text: /^Niemand am Computer$/ })) !== undefined).toBe(true)

  // zurück: frischer Block
  ruheNs = 2_000_000_000
  await uhrwerk.advance(20_000)
  expect((await ui.find({ type: 'Text', text: /^Pause in 80 Min/ })) !== undefined).toBe(true)
  await ui.unmount()
})

test('Name im Bedienfeld eintragen: die Ansagen sprechen ihn', async ($, on) => {
  const uhrwerk = mock.clock(on, { now: Date.UTC(2026, 10, 16, 9, 0) })
  mock.store(on)
  const gesagt: string[] = []
  on('command.register', () => ({ value: { command: 'rituale' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('audio.speak', (_, e) => {
    gesagt.push(e.text)
    return { value: { via: 'system' as const } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.input({ key: 'name', text: '  Petra  ' })
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'probe' })
  await uhrwerk.advance(35_000)
  await ui.unmount()

  expect(gesagt).toEqual([
    'Hallo Petra, es ist wieder Zeit für einen Schluck Wasser',
    'Hallo Petra, Zeit, kurz zwei Minuten aufzustehen und den Körper zu spüren.',
    'Hallo Petra, dein Zehn-Minuten-Zeichenmoment beginnt jetzt.',
    'Petra, der Zeichenmoment ist vorbei, beende die Zeichnung in ein oder zwei Minuten.',
  ])
})

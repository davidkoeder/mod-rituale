/** Was gerade läuft: Arbeit oder einer der beiden Pausenblöcke. */
export type Phase = 'arbeit' | 'bewegen' | 'zeichnen'

/** Der Zeitplan, alle Zeiten in Millisekunden seit 1970. */
export type Plan = {
  phase: Phase
  /** Beginn der laufenden Phase. */
  start: number
  /** Ende der laufenden Phase (Arbeit: Beginn der nächsten Pause). */
  ende: number
  /** Wann der nächste Schluck fällig ist. Wartet, solange ein Block läuft. */
  wasserFaellig: number
  /** Wann die offene Wasser-Erinnerung kam, oder null, wenn keine offen ist. */
  wasserOffen: number | null
  /** Letztes Lebenszeichen: Eine lange Lücke heisst, der Computer schlief. */
  letzterTick: number
  /** Niemand am Computer (25 Min ohne Tastatur und Maus): Die Rituale ruhen. */
  weg: boolean
}

/** Ein Schalter pro Erinnerung. */
export type Schalter = {
  wasser: boolean
  bewegen: boolean
  zeichnen: boolean
  stiftWeg: boolean
}

/** Tassen an einem Tag (JJJJ-MM-TT). */
export type Tassen = { tag: string; anzahl: number }

declare module 'claude-code' {
  interface PluginState {
    rituale: {
      plan: Shaped<Plan | null>
      schalter: Shaped<Schalter>
      tassen: Shaped<Tassen>
      jetzt: number
      /** Ob die Mod lesen kann, wie lange Tastatur und Maus schon ruhen. */
      erkennung: boolean
      /** Der Name für die Ansagen; leer heisst: ohne Namen. */
      name: string
    }
  }
}

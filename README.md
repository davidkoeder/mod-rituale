# Rituale

Eine Mod für Claude Code, die dich beim Arbeiten an kleine Rituale erinnert: trinken, bewegen, zeichnen.

Eine **Mod** ist eine kleine Erweiterung, die Claude Code um eigene Funktionen ergänzt. Diese hier zeigt ein Bedienfeld neben dem Chat und meldet sich mit Ton, Text und Stimme.

## Was die Mod macht

- **Wasser:** Alle 30 Minuten erinnert sie dich an einen Schluck warmes Wasser. Die Tassen zählst du selbst im Bedienfeld mit (+1 Tasse). Jeden Tag beginnt der Zähler wieder bei null.
- **Pause nach 80 Minuten:** Zuerst 2 Minuten bewegen, dann 10 Minuten zeichnen mit Block und Bleistift, dann das Signal «Stift weg».
- **Wasser wartet:** Fällt ein Schluck in die Pause, kommt er erst 3 Minuten nach ihrem Ende. So bleibt nach «Stift weg» Zeit zum Fertigzeichnen.
- **Jede Erinnerung** kommt mit eigenem Ton, kurzer Textmeldung, einer Mitteilung von macOS und einer Ansage der Mac-Stimme «Anna».
- **Eigene Schalter:** Wasser, Bewegen, Zeichnen und «Stift weg» lassen sich einzeln ein- und ausschalten.
- **Niemand am Computer:** Nach 25 Minuten ohne Tastatur und Maus ruhen die Rituale, zum Beispiel über Mittag oder nachts. Sobald du zurück bist, beginnt ein frischer 80-Minuten-Block. Bewegen und Zeichnen zählen nicht als Abwesenheit.

## Was die Mod auf deinem Computer tut, und was nicht

Sie tut:

- Sie läuft nur innerhalb von Claude Code, und nur, solange es offen ist.
- Sie fragt macOS alle 15 Sekunden, wie lange Tastatur und Maus schon unberührt sind. Was du tippst, liest sie nicht.
- Sie spielt ihre eigenen Töne ab und lässt die eingebaute Mac-Stimme sprechen.
- Sie merkt sich Schalter, Tassen, Zeitplan und deinen Namen in einer kleinen Datei von Claude Code.

Sie tut nicht:

- Sie greift nicht aufs Internet zu.
- Sie liest keine Dokumente, Mails oder sonstigen Dateien.
- Sie schickt von sich aus nichts an Claude.

Der ganze Code liegt offen in diesem Paket. Du kannst ihn vor der Installation ansehen.

## Voraussetzungen

- **Claude Code**, in der Claude-Desktop-App (Tab «Code») oder im Terminal.
- **Ein Mac.** Unter Windows oder Linux kommen nur die Textmeldungen, ohne Töne, ohne Stimme und ohne Erkennung, ob jemand am Computer ist.
- **Die deutsche Stimme «Anna».** Fehlt sie, bleibt die Ansage stumm, Töne und Texte kommen trotzdem. Nachladen kannst du sie in den Systemeinstellungen unter «Bedienungshilfen» → «Gesprochene Inhalte» → «Systemstimme» → «Stimmen verwalten…».

## Installieren

Installiert wird über einen **Marktplatz**: eine Art Verzeichnis, aus dem Claude Code Erweiterungen lädt. Dieses Paket ist sein eigener kleiner Marktplatz.

**In der Claude-Desktop-App:** Klick auf das + neben dem Eingabefeld, dann «Plugins». Wähle «Add marketplace» und gib `davidkoeder/rituale` ein. Danach «Add plugin» und «rituale» wählen.

**Im Terminal**, in Claude Code:

```
/plugin install rituale --marketplace davidkoeder/rituale
```

Die Frage nach dem neuen Marktplatz mit `y` bestätigen, dann den Bereich wählen («user» heisst: in allen deinen Sitzungen).

## Einrichten

1. **Bedienfeld öffnen:** Es öffnet sich beim Start von selbst. Hast du es geschlossen, tipp `/rituale` ins Eingabefeld.
2. **Deinen Namen eintragen:** Ganz unten im Bedienfeld steht «Dein Name für die Ansagen». Vornamen eintragen und «Speichern» klicken. Dann sagt die Stimme zum Beispiel «Hallo Petra, es ist wieder Zeit für einen Schluck Wasser». Lässt du das Feld leer, kommen die Ansagen ohne Namen. Ändern kannst du den Namen jederzeit.
3. **Probe:** Der Knopf «Probe» spielt alle vier Signale nacheinander ab. So hörst du, ob Ton und Stimme ankommen.

## Bedienung auf einen Blick

| Knopf | Was er tut |
| --- | --- |
| An / Aus | schaltet eine Erinnerung ein oder aus |
| +1 Tasse / −1 | zählt deine Tassen für heute |
| Pause jetzt | startet die Pause sofort |
| Neu starten | beginnt einen frischen 80-Minuten-Block |
| Beenden | beendet Bewegen oder Zeichnen vorzeitig |
| Getrunken / Tasse leer, +1 | bestätigt die Wasser-Erinnerung über dem Eingabefeld |
| Probe | spielt alle Signale zum Anhören ab |

Sind mehrere Claude-Code-Sitzungen offen, teilen sie sich einen Zeitplan, die Tassen und die Schalter.

---

Konzept und Inhalt: David Koeder. Gebaut in Co-Creation mit Claude (Anthropic).
Stand: November 2026.

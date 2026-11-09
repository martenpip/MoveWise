# Accessibility

What was checked, how, and what was not. Automated and manual results are listed separately.

## Automated

- **axe-core 4.10** (`scripts/axe-audit.mjs`, WCAG 2 A and AA, WCAG 2.1 A and AA and best-practice rules): 74 page states (Home, Play and bot selection, the Trainer game screen, the results card, Game Review with results and a selected move, saved game, Analysis, Mistake Notebook, Puzzles, Academy course and lesson, Profile, Settings including the Trainer voice settings), in the dark and light themes, at 1280 and 360 px width. Result after fixes: **0 violations**. axe-core is not a project dependency; the script documents how to run it. The first pass found 10 distinct issues (unnamed image-role on captured-piece lists, invalid definition lists on Profile, missing level-one headings on game screens, a heading-order jump on Analysis and in the Trainer panel, and a scrollable table that keyboard users could not reach). All were fixed without changing the look.
- **Contrast audit** (`npm run test:contrast`): no text below WCAG AA on the main screens, including Notebook and the Trainer, in both themes.
- **Keyboard audit** (`npm run audit:keyboard`): tabbing through Home, Play, Games, Notebook, Puzzles, Academy (including a lesson), Profile and Settings in both themes, 428 focus stops, each with an accessible name and a visible focus indicator; the board can be operated with the keyboard (arrows and Enter) and has a label; a live region exists for announcements; with reduced motion requested no animation or transition longer than 0.05 s remains.
- **Layout** (`npm run test:e2e:viewports`): 234 page checks at 360, 375, 390, 768, 1024, 1100, 1101, 1280 and 1920 px in both themes, no horizontal overflow, no page errors.

## Manual

- Keyboard play of a complete move on the board and the Trainer warning buttons were exercised with keyboard events in a real Chromium (the scripts above drive real key presses). That is automation of the keyboard, not a person using it.
- Move verdicts in Game Review do not rely on colour: each class has a text label and a glyph (best, good, "?!" inaccuracy, "?" mistake, "??" blunder) and the legend names them.
- Dialogs: the app uses the browser's own confirmation dialog for destructive actions, which is accessible by default; there are no custom modal dialogs.

## Not done

- **No screen reader was used.** Not NVDA, JAWS, VoiceOver or TalkBack. Labels and roles are present and axe passes, but how the app sounds has not been listened to.
- No testing on real touch devices, with browser zoom to 400 percent, with forced-colours mode, or with switch access or voice control.
- axe finds only a portion of possible issues; passing it is not a claim of full WCAG conformance.

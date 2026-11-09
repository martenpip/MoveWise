# Play with Trainer and spoken coaching

## What the Trainer does

On the Play page you choose **Normal game** or **Play with Trainer**. A normal game is never interrupted. In a Trainer game:

- **Before you play a move,** the Trainer checks it with the local engine (Stockfish if available, otherwise the built-in engine). It speaks up only for a serious blunder: the move must lose at least 15 points of winning chances, the position must not already be hopeless, and the search must have reached a minimum depth. You then choose **Let me reconsider** (the move is not played) or **Play the move anyway**. If the engine is unavailable or did not search long enough to judge, the Trainer says so and does not comment.
- **After your move and the bot's move,** it comments on key moments only (captures, checks, mates, new threats), in short sentences. In the Beginner style it explains the idea; in the Concise style it states the facts.
- **At the end,** it says what happened and offers a game review.

Trainer games are always practice. They never change your MoveWise Rating, whatever the bot level, and are stored with `mode: trainer`. The Profile shows them in a separate group.

The check is an engine judgement, not a proof. The wording avoids "you will lose" and says what the engine prefers.

## Spoken coaching

Speech is **off by default**. It uses only the browser's built-in Web Speech API (`speechSynthesis`). No audio or text is sent to a cloud service by MoveWise, and the app never selects a voice that streams from a server: voices the browser marks as remote are hidden and counted ("1 voice that streams from a server was left out"). If no installed voice exists, the Trainer works in writing and says so.

Settings (Settings page, "Trainer voice"):

- switch speech on or off;
- male or female preference;
- the voice list (installed English voices only) and a Preview button;
- volume (separate from the sound-effects volume);
- Replay the latest message, and Stop.

**Making the voice sound less robotic.** MoveWise can only use the voices already installed on your device, and phones often default to the plainest one. On an iPhone or iPad, open Settings, Accessibility, Spoken Content, Voices, English, and download an Enhanced or Premium voice; on Windows, add a Natural voice in Settings, Time and language, Speech; on Android, install a high-quality voice in the device's text-to-speech settings. Then choose it in the voice list. Voices of this kind are listed first when you have not picked one. MoveWise will not use voices that stream from a server, because that would send your games to a speech service.

**Why speech stops when you move.** Advice describes one position. When you make a move, take one back or the opponent replies, the old advice is stopped on purpose so it never talks about a board that no longer exists. Turn spoken coaching off in Settings if you prefer silence.

Voice choice: an explicit pick wins. Otherwise the app matches the gender preference using the voice name (browsers do not expose a gender field, so this is a name-based guess and is described that way). If no voice matches, it uses the closest available English voice and tells you it is not an exact match.

Behaviour: one message is spoken at a time. A new message cancels the previous one. Starting a new move, taking back, leaving the page, or turning speech off cancels speech, and late callbacks from a cancelled message are ignored. Only important messages are spoken: warnings, the welcome and the result, comments on your own mistakes and blunders, the bot's checks, captures and mates, and new threats against you. Other comments are shown as text only.

## What has and has not been verified

Verified in automated browser tests:
- With a **fake speech synthesiser** (`tests/e2e/trainer.mjs`): voice listing, hiding of server-streamed voices, gender matching, volume, a new message cancelling the previous one, silence when speech is off, the written text always shown, persistence across reload.
- With the **real browser speech API** (`tests/e2e/voice-real.mjs`, headless Chromium, which exposes the API but has **no installed voices**): the app says that no voices are installed, lists none, cannot preview, keeps the written coaching, throws nothing and sends nothing out. A browser with no speech API at all gets the same fallback with its own message.
- Unit tests (`tests/trainer.test.ts`) cover voice choice, remote-voice exclusion, one utterance at a time and ignoring late callbacks from cancelled speech.
- Reading the code: the only place text reaches speech is `SpeechSynthesis.speak` with a voice the browser marked as a local service. There is no network code in the speech path.

**Not verified:** anything that needs real installed voices. No real voice was played, previewed or listened to in this project: the test machine has no speech engine and none could be installed. How voices are named and ordered, whether the male and female guess picks the right voice, volume on a real engine, and whether a voice marked "local" by a browser really stays on the device, all differ between Windows, macOS, Android, iOS and Linux and remain **untested on real devices**. Firefox and Safari were not available either. Please try Settings, "Trainer and spoken coaching", Preview voice on your own device before relying on it, and report the browser and voice list if it misbehaves.

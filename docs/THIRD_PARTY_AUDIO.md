# Third-party audio

The cue sounds of the web app (`apps/web/public/sounds/`, played by `apps/web/src/features/haptics/`) are recordings by Kenney, released under Creative Commons Zero (CC0 1.0, public domain dedication): <http://creativecommons.org/publicdomain/zero/1.0/>. Crediting Kenney is optional under CC0; it is done here so each file can be traced. Each pack's `License.txt` states the CC0 dedication. Both packs were retrieved on 2026-11-22.

| Cue                                 | File in the app   | Pack and version     | Original file      | Source page                                 |
| ----------------------------------- | ----------------- | -------------------- | ------------------ | ------------------------------------------- |
| `select`, a choice of an item       | `select-v2.wav`   | Interface Sounds 1.0 | `tick_004`         | <https://kenney.nl/assets/interface-sounds> |
| `press`, the Record button          | `press-v2.wav`    | Interface Sounds 1.0 | `click_005`        | <https://kenney.nl/assets/interface-sounds> |
| `correct`, a right answer           | `correct-v2.wav`  | Interface Sounds 1.0 | `confirmation_004` | <https://kenney.nl/assets/interface-sounds> |
| `wrong`, a wrong answer             | `wrong-v2.wav`    | Interface Sounds 1.0 | `question_001`     | <https://kenney.nl/assets/interface-sounds> |
| `lessonComplete`, a finished lesson | `complete-v2.m4a` | Music Jingles        | `jingles_PIZZI01`  | <https://kenney.nl/assets/music-jingles>    |

The app's files are converted from the originals and not edited otherwise: mono 44.1 kHz 16-bit WAV, peak-normalised with ffmpeg (`volume` by the difference between the original's `volumedetect` peak and the target) to -3 dBFS for `select`, `press` and `correct`, and -9 dBFS for `wrong`, which stays the quietest cue; the jingle is AAC at 96 kb/s in an MP4 container, raised to -3 dBFS with a limiter at 0.7. The `-v1` files peaked at -12 to -16 dBFS and were played at gain 0.5 (so -18 to -22 dBFS), which a TV's speakers did not reproduce; `-v2` plays at gain 1. The originals are not kept in this repository. A changed recording is a new file with the next version in its name (`select-v3.wav`), because the service worker keeps `/sounds/` by path.

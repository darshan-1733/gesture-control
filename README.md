# Gesture Control (web version)

Real-time hand gesture recognition that runs entirely in the browser. MediaPipe Hand
Landmarker finds 21 points on your hand, a small rule-based classifier names one of five
gestures (Open Palm, Fist, Thumbs Up, Peace, Pointing), and the gesture drives a slide deck
and a volume control on the page. No server, no build step, no cost.

The classifier is a line-for-line port of `gesture_control/rules.py` from the Python
version of this project, and `tests/run.mjs` checks that both give identical answers.

## Run it on your computer

The camera only works on `https://` pages or `localhost`, so do not just double-click
`index.html`. From this folder run:

```
python -m http.server 8000
```

then open http://localhost:8000 in Chrome or Edge and press **Start camera**.
(The first start downloads the hand model, about 7 MB, and needs internet.)

## Put it online for free

Any static host works, and all of them give you `https://`, which the camera needs.

**GitHub Pages:** push this folder to a repository, open Settings, then Pages, choose the
`main` branch and the `/ (root)` folder, and save. Your site appears at
`https://<your-username>.github.io/<repository>/`.

**Netlify Drop:** go to app.netlify.com/drop and drag this folder onto the page.

## Run it fully offline (optional)

Download `hand_landmarker.task` from
https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
and save it in the `models/` folder. The page uses it automatically when present.
The MediaPipe library itself still loads from the jsDelivr CDN.

## Tests

```
node tests/run.mjs
```

Requires Node 18 or newer. Compares the JavaScript classifier with Python results on 384
hands, and tests smoothing, cooldowns, slide limits and volume steps.

## Files

```
index.html        page structure
style.css         light and dark themes, responsive layout
js/gestures.js    gesture rules and majority-vote smoother (pure, tested)
js/controller.js  gesture to action mapping, cooldowns, deck and volume logic (pure, tested)
js/app.js         camera, MediaPipe, drawing, and the demo page
tests/            Node tests and the Python-generated reference cases
```

## Limits

- A web page cannot press your computer's media or arrow keys, so it controls only the slides
  and audio on this page. The Python version controls the whole system.
- One hand, roughly upright and facing the camera. Strong backlight lowers accuracy.
- Works in current Chrome, Edge and Firefox on desktop. Mobile browsers work but are slower.

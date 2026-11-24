# Gesture Control (web version 2)

Real-time hand gesture recognition that runs entirely in the browser. MediaPipe Hand
Landmarker finds 21 points on your hand, a small rule-based classifier names one of five
gestures (Open Palm, Fist, Thumbs Up, Peace, Pointing), and the gesture drives three modes.
No server, no build step, no cost. Video is processed on the device and never uploaded.

## Modes

| Mode | What you do |
|---|---|
| **Control** | Peace: next slide. Pointing: previous slide. Thumbs Up and Fist: volume up and down. Open Palm: rest. |
| **Air draw** | Point with one finger to draw. Fist lifts the pen. Peace changes colour. Hold Open Palm for 1 second to clear. Thumbs Up saves a PNG. |
| **Rock Paper Scissors** | Fist is rock, Open Palm is paper, Peace is scissors. Press Play round, wait for the countdown, and show your move when it says Shoot. The computer picks its move before the countdown, so it cannot react to yours. |

## Run it on your computer

The camera only works on `https://` pages or `localhost`, so do not double-click
`index.html`. In this folder run:

```
python -m http.server 8000
```

then open http://localhost:8000 in Chrome or Edge and press **Start camera**.
The first start downloads the hand model (about 7 MB), so it needs internet.

## Put it online for free

Upload all the files in this folder to a GitHub repository, then open
Settings, Pages, choose the `main` branch and `/ (root)`, and save.

## Files

```
index.html     page structure
style.css      light and dark themes, responsive layout
app.js         camera, MediaPipe, drawing, and the three modes
gestures.js    gesture rules and majority-vote smoother (pure logic)
controller.js  gesture to action mapping, cooldowns, slide and volume logic (pure logic)
draw.js        air-draw pen: smoothing, colour change, hold-to-clear, save (pure logic)
game.js        rock-paper-scissors rules and round timing (pure logic)
```

The gesture rules are a line-for-line port of the Python version of this project. They were
checked against the Python classifier on 384 test hands and gave identical answers.

## Limits

- A web page cannot press your computer's media or arrow keys, so Control mode drives the
  slides and audio on this page. The Python desktop version controls the whole system.
- One hand, roughly upright and facing the camera. Strong backlight lowers accuracy.
- Works in current Chrome, Edge and Firefox on desktop. Mobile browsers work but are slower.

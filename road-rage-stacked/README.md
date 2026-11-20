# Martian Motor Mayhem — sprite stacked

The Road Rage event from [`road-rage/`](../road-rage/), drawn with sprite stacking instead of three.js. Same freeway, same rules. Cars, rivals, traffic, barriers, lamps, buildings, and the overpasses are stacks of flat slices, turned in place and lifted one pixel at a time.

Everything on screen is drawn in code. There is no build step and no image files to load. Paths are relative, so the folder can be copied under a subpath of a site.

## Run it

From this folder:

```bash
python3 -m http.server 8648
```

Open http://localhost:8648

The page is an ES module, so it needs a local server. The view is a 384×216 pixel buffer scaled with nearest-neighbor to fill the window or the iframe it sits in.

## Controls

| Key | Action |
| --- | --- |
| W | Throttle |
| S | Brake. Hold it from a stop to reverse. |
| A | Steer left |
| D | Steer right |
| Q | Drift left. The rear steps out, grip drops, and the boost meter fills while you hold it. |
| E | Drift right. Same, the other way. |
| Space | Boost, while the meter has charge |
| F | Fullscreen |
| Esc | Pause. Resume or Quit. Quit returns to the start menu. |
| F8 | Stacking debug. Cycles squash, turn, and spacing on a sample car and prints the pixel checks. |

Enter also starts a run from the menu or the results screen.

## Road Rage rules

- The clock starts at 60 seconds. The target is 8 takedowns.
- Rivals race with you. Ram them into a barrier, into traffic, or just break them apart to score a takedown.
- Each takedown before the target adds 10 seconds. Once the target is met, the clock stops getting gifts. Keep driving for bonus score until time runs out or the car is wrecked.
- Clearing the target is a win, even if the bonus run ends in a wreck. Running out of time or totaling the car before 8 is a loss.
- Two-way traffic. A head-on with traffic totals the car. A sideswipe or a rear-end launches that car and fills the boost meter.
- Rival hits and wall hits damage the hull. The damage bar fills as the car comes apart. Empty hull is game over.
- Rival contact is heavy: you scrub speed and take damage, but those cars stay on the road. Traffic bumps are the wild ones. They pop, spin, and leave the lane.

## Checks

```bash
node tests/stack.test.mjs
node tests/drive.test.mjs
```

The stack test pastes slices by hand (squash 1, turn 0) and compares every pixel, then checks spacing 0, the circle heading, and a single outline around the finished stack. The drive test holds A, D, Q, and E and checks the nose, the rear kick, the boost fill, and the skid marks.

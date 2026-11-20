# Martian Motor Mayhem — sprite stacked

The Road Rage event from [`road-rage/`](../road-rage/), drawn with sprite stacking instead of three.js. The camera stays north-up and a little ahead of the car. World distance is squashed, so the elevated freeway reads as a tilted top-down. The road is an endless ribbon with curves, lane changes, merges, and overpasses. The strip at the bottom left is progress along that road.

Everything on screen is drawn in code. There is no build step and no image files to load. Paths are relative, so the folder can be copied under a subpath of a site.

## Run it

From this folder:

```bash
python3 -m http.server 8648
```

Open http://localhost:8648

The page is an ES module, so it needs a local server. The view is a 384×216 pixel buffer scaled with nearest-neighbor to fill the window or the iframe it sits in. Press F for fullscreen.

Stacks use a squash of 0.75 and one pixel of slice spacing.

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
| F8 | Stacking debug. Cycles squash, turn, and spacing on the hero car and prints the pixel checks. |

Enter also starts a run from the menu or the results screen.

Steering eases in, loosens at low speed, and tightens as you go faster. Off the drift the car plants and settles. Q and E stay loose on purpose.

## Road Rage rules

- The clock starts at 60 seconds. The target is 8 takedowns.
- Rivals race with you and rubber-band hard enough that boost alone will not drop them. They boost to catch up and ease off when they are in front. If you pull more than about 60 m ahead, or nobody is in front of you for 3 seconds, two of them drop back in off the top of the screen, a little slower than you. Two or three stay in fighting range.
- Ram them into a barrier, into traffic, or just break them apart to score a takedown.
- Each takedown before the target adds 10 seconds. Once the target is met, the clock stops getting gifts. Keep driving for bonus score until time runs out or the car is wrecked.
- Clearing the target is a win, even if the bonus run ends in a wreck. Running out of time or totaling the car before 8 is a loss.
- Two-way traffic. A head-on with traffic totals the car. A sideswipe or a rear-end launches that car and fills the boost meter.
- Rival hits and wall hits damage the hull, slower than they used to. The damage bar along the bottom fills as the car comes apart. Empty hull is game over.
- The strip at the bottom left is progress up the freeway, not a lap map. You are the arrow. Red marks are rivals.

## Cars

Shapes use each car's published length, width, height, and wheelbase. Overhangs place the axles, hood, cabin, and tail where that car's side view puts them. Nothing in the game uses a brand name or a logo.

| In the game | Based on | Length × width × height | Wheelbase |
| --- | --- | --- | --- |
| Coupe (you) | Porsche 911 Carrera (992) | 4.519 × 1.852 × 1.298 m | 2.450 m |
| Wide coupe | Nissan GT-R (R35) | 4.710 × 1.895 × 1.370 m | 2.780 m |
| Muscle | Dodge Challenger | 5.027 × 1.923 × 1.460 m | 2.946 m |
| Rotary coupe | Mazda RX-7 (FD) | 4.285 × 1.760 × 1.230 m | 2.425 m |
| Fastback | Ford Mustang fastback (S550) | 4.788 × 1.916 × 1.381 m | 2.720 m |
| Liftback | Toyota Supra (A90) | 4.379 × 1.854 × 1.292 m | 2.470 m |
| Sedan | Toyota Camry | 4.885 × 1.840 × 1.445 m | 2.825 m |
| Hatchback | Volkswagen Golf | 4.284 × 1.789 × 1.456 m | 2.636 m |
| Pickup | Ford F-150 SuperCrew | 5.885 × 2.029 × 1.961 m | 3.683 m |
| Van | Mercedes-Benz Sprinter | 5.932 × 2.020 × 2.620 m | 3.665 m |
| Box truck | Isuzu N-series cab-over proportions | 7.4 × 2.4 × 3.2 m | 3.4 m |

## Checks

```bash
node tests/stack.test.mjs
node tests/drive.test.mjs
```

The stack test pastes slices by hand (squash 1, turn 0) and compares every pixel, then checks spacing 0, the circle heading, and a single outline around the finished stack. The drive test holds A, D, Q, and E and checks the nose, the rear kick, the boost fill, and the skid marks. It also holds a turn and checks that the yaw rate does not oscillate or overshoot when you let go.

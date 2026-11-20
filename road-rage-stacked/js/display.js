// Low internal resolution, scaled up in CSS with nearest-neighbor.
// Spy Hunter view: world +X is screen right, world +Z is straight up the screen.
// The ground is not squashed. Stacks use a mild squash and a short spacing so
// a car still shows a little height from overhead.
export const VIEW_W = 384;
export const VIEW_H = 216;
export const PX = 8;
export const SQUASH = 0.9;
export const SPACING = 0.55;
export const LIFT = 2;
// Player sits in the lower third. The road ahead fills the screen above them.
export const PLAYER_SCREEN = 0.7;

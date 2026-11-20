// Positive steer and positive drift are left turns: the nose rotates toward
// the driver's left. The 3D build had A/D backwards (positive yaw is a left
// turn, and that build mapped D to positive yaw).

export function readPad(keys) {
  const steer = (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0);
  const drift = (keys.has('KeyQ') ? 1 : 0) - (keys.has('KeyE') ? 1 : 0);
  return {
    throttle: keys.has('KeyW'),
    brake: keys.has('KeyS'),
    steer,
    drift,
    boost: keys.has('Space'),
  };
}

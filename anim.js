// Public animation API used by the game and co-op. The timeline is separated
// from the pose/rig tables so its timing can be regression-tested independently.
export { createAnim, BLEND } from './animation-timeline.js';

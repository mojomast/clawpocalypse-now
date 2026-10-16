# Hero rig animation

The game remains plain browser ES modules: no build step is needed. Serve the
repository with `python3 -m http.server 48791` and open
`http://localhost:48791/index.html`.

## Coordinate and authoring conventions

- Author poses facing right. Mirror the **whole** composed rig to face left;
  do not negate individual joint angles or mirror weapons separately.
- Part pivots and attachment coordinates use source-image pixels. A child's
  origin must coincide with its parent's **rendered, scaled** attachment.
- `farm` / `shin` are rotations relative to the upper arm / thigh, not world
  angles. Elbows flex in the negative direction; knees flex positively.
- `_b` always means the camera-far limb, not the screen-left limb. Mirroring
  does not exchange camera-near and camera-far layers.
- A weapon rotates at its handle, relative to its holding forearm. A deliberate
  backswing is not a backwards grip. The staff is double-ended; a flexible cable
  and articulated nunchaku are not rigid blades.
- `FOOT_Y` is the contact line in rig coordinates. Jump height belongs to the
  game entity, not the pose. Walking and kicks can lift a swing foot while the
  support foot remains grounded; downed bodies are not standing poses.

## Source art constraints

The repository contains the generated `hero-rigs.js` but does **not** contain
`assets/heroes/MANIFEST.md` or the generator named in its header. Keep any code
calibration documented and do not silently regenerate from an absent source.
Hair, coat panels, and several held weapons are baked into the part PNGs. Their
secondary motion must preserve the part's joint/hand connection; they cannot be
treated as independently articulated sprites without splitting the source art.

## Review

Baseline sheets in `before/` must remain immutable. Capture comparisons using
the same renderer, scale, camera, background, and sampling rules. Static contact
sheets show silhouette, grip, and layering; they do not alone prove temporal
smoothness or absence of world-space foot sliding. Review animation sequences
and actual gameplay as well as the numerical rig checks.

The initial raw-preview sheets are retained in commit `ee2b48c`. The canonical
`before/` sheets were recaptured from an isolated, untouched `bcec2ee` worktree
using the same tagged-pose drawing path as gameplay, with the ground guide at
`FOOT_Y`. The manifest records that source revision. The after renderer keeps
original cell positions and appends newly authored states, so the comparison is
not misleading when run poses are added.

`node check-animation.mjs` checks state selection, every attack's exact impact
hold and completed recovery, hit-stop freezing, and world-space support locks
through 3,840 walk/run frames across both facings. Distance-driven gait avoids
cycling feet against a wall. Locks release at a new support phase, a facing
change, a teleport, or an unreachable recoil; they never stretch a limb.

Art remains unchanged. The shin and foot are one rigid cutout, so foot contact
can rock between heel and toe rather than independently articulating an ankle.
Head/wrist settling provides overlapping motion; baked-in hair and coat panels
are not independently simulated. Numerical attachment checks do not alone
establish pixel-perfect seam continuity—review the rendered sheets as well.

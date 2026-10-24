# Custom fixed-step capsule physics

The game uses Three.js for rendering and a purpose-built fixed-step character controller instead of a general rigid-body engine. The comedy depends on a tall, top-heavy capsule that slides, bonks, and recovers predictably; a full physics engine would add bundle weight, tuning surface, and nondeterminism for a set of interactions we do not need. The world is therefore two capsule spheres against oriented boxes and capped cylinders, with kinematic platforms and explicit hazard impulses.

**Consequences:** no stacking crates or free tumbling bodies; collision shapes must be authored alongside visuals; every new hazard needs a matching collider and a unit-testable behavior. The trade is a 60 fps budget, deterministic tests, and complete control over game feel.

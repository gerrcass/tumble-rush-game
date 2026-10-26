# Course sections are relocatable modules

The M2 Course authored five sections at absolute z coordinates and translated
the whole lap by a fixed offset. M3 needs each lap to compose a different
three-of-five middle sequence, so the unit of authorship becomes a **Section
Module**: it owns its geometry, colliders, checkpoint, waypoints, sign, and
difficulty weight, and it starts and ends at the same height so any legal order
is playable. A route planner owns the z cursor, inter-module gaps, lap offsets,
finish position, and the final checkpoint.

**Consequences:** new sections must be height-neutral at their boundaries and
provide their own waypoint chain; the exact 174/358 M2 lengths become route
ranges; the planner, not an individual section, is the only place that knows
where the finish gate is. This is more plumbing than a fixed course, but it is
what makes "different every time" a grammar rather than a promise.

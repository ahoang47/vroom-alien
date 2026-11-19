# Open world from OpenStreetMap

## Why OSM
A real street grid for free; real cities have the alleys, freeways and odd junctions that make Road Rage fun.

## What OSM gives you
Road geometry, lane counts, building footprints, some heights. No detailed 3D models.

## Pipeline notes
- Import with Blender-OSM, a Godot community OSM importer, or a custom script that turns ways into road meshes.
- **Cleanup is the real work**: messy junctions, gaps, wrong elevations at overpasses. Budget a cleanup pass or write snap/smooth rules.
- **Start small**: one district of a few square km to prove the pipeline before scaling.
- **Edit for fun**: add ramps, shortcuts, jumps and wider lanes on top of the real layout.
- Each district can favor a car class (tight downtown for nimble cars, wide freeways for brawlers).

## Candidate area
South Bay / LA: freeways, PCH, Palos Verdes hills, dense downtown blocks.

## License
OSM data is ODbL: credit "© OpenStreetMap contributors" in-game and review the share-alike terms for derived databases before shipping.

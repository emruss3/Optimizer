# Layout task (test of a pretrained model; no tools beyond reading the brief and writing the answer)

You are given one brief: a residential site (boundary, what lies beyond each edge, the program) and three approved
plans on similar sites as examples. Lay out the site the way a civil engineer would for that program.

Rules of the test
- Read ONLY this file and your brief. Do not list, search or open any other file or directory, and do not run code
  or shell commands. Other files hold the answer; touching them voids the test. Work the geometry out yourself.
- Produce 3 alternative layouts that differ in a real way (access point, drive pattern or building arrangement).
- Each layout has: drives (centrelines of internal drives, alleys or new streets; assume about 24 ft of pavement),
  buildings (rectangles) and parking fields (rectangles of surface parking; omit when the product parks in garages
  or on driveways, as the examples show).
- Buildings lie inside the boundary, do not overlap each other and do not sit on a drive. Drives form one connected
  network and reach the street frontage when the site has one. Every building is served by a drive (or fronts the
  street). Parking fields sit along drives and do not overlap buildings.
- The units of all buildings add up to the program's unit count.
- Take building sizes, units per building, spacing, street setback and amount of parking from what the examples show
  for this product and density, adapted to this site's shape and edges. The examples are context, not a template.

Write the answer as JSON to the output path you were given, exactly in this form (feet, the brief's site frame;
angle_deg is the direction of the rectangle's length, 0 = along x, counter-clockwise, 0 to 180):

{"samples": [
  {"drives": [[[x, y], [x, y], ...], ...],
   "buildings": [{"type": "townhome_row", "cx": 0, "cy": 0, "length": 100, "depth": 40, "angle_deg": 0, "units": 5}, ...],
   "parking": [{"cx": 0, "cy": 0, "length": 120, "depth": 18, "angle_deg": 0}, ...]},
  {...}, {...}]}

Building types: detached, townhome_row, cottage_court, garden_walk_up, stacked_flats, podium, wrap, tuck_under.
Reply with one line when the file is written.

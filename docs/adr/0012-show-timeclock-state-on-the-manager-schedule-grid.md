# Show timeclock state inline on the manager schedule grid

The manager schedule grid overlays Time Entry state on each published Shift tile: an open Time Entry shows an "on clock" chip with the clock-in time, a closed Time Entry shows worked time with a variance marker when it diverges from scheduled time by more than ten minutes, and a published shift that ended more than fifteen minutes ago without any punch shows a "no punch" chip. Shifts that are not yet published and future shifts stay visually unchanged.

Timeclock state is operational truth layered on top of the published plan, not a planning signal: it appears only for the latest Published Schedule of the week, superseded versions are ignored, and draft-only shifts never show punch state because Workers can only start work on published Shifts. Keeping planning surfaces calm while surfacing live operations in the same grid lets a Manager run the floor and plan the week from one screen without a separate timeclock tool.

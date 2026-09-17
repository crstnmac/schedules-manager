# Importing a schedule from CSV

1. Create the location, positions, and workers in jooling. Assigned shifts match workers by email. A blank worker email creates an open shift.
2. Open the workweek in **Schedule**, then choose **More schedule actions → Import shifts from CSV**.
3. Upload a Sling CSV, a supported HotSchedules ShiftTimes CSV, or the first sheet of a When I Work schedule XLSX. You can also download the row-per-shift template with `date`, `start_time`, `end_time`, `position`, `worker_email`, and optional `note`. Template dates are `YYYY-MM-DD`; times are local to the selected location and use 24-hour `HH:MM` or `h:mm AM/PM`. An end time before the start time means the shift ends the next day.
4. Upload the CSV and **Preview**. The preview checks the workweek, dates, times, position names, active worker emails, assignment access, unavailability, and duplicates. Correct every reported line before importing.
5. Choose **Import**. All rows are added to the selected workweek's draft together. Existing shifts remain untouched, and workers see no new shifts until you publish the schedule.

The importer also accepts a [Sling schedule export](https://support.toasttab.com/en/article/Sling-by-Toast-Create-a-Schedule) in its calendar-style CSV layout. It reads shift times, position, and source location from each populated date cell. Scheduled workers match by a unique full name among active workers in the workplace; ambiguous or missing names fail preview. Unassigned and available shifts import as open shifts. Filter the Sling export to one source location and choose the destination jooling location before uploading. Imports with multiple source locations fail preview to avoid silently merging them.

An export whose date cells contain no shifts reports a specific error. The supported Sling cell format is `9:00 AM - 5:00 PM • 8h` followed by `Position • Location` on the next line. Other cell layouts produce line-level preview errors rather than guessed shifts.

## When I Work

In the web Scheduler, choose **Export Schedule** for the desired day or week. Its [official export guide](https://help.wheniwork.com/articles/exporting-schedules/) shows the menu and export options. The downloaded spreadsheet has a shift list on its **first sheet** and a totals sheet after it. Upload the XLSX directly; the importer reads the first sheet only. The list must identify date, start time, end time, and position. It accepts employee email or a unique employee name. If a custom export uses other column labels, save the first sheet as CSV and rename those four headers to match the template. Preview will report any unmatched workers or positions.

## HotSchedules / Fourth WFM ShiftTimes

The [official ShiftTimes export instructions](https://help.hotschedules.com/hc/en-us/articles/21353648812685-November-16th-2023-Release-Note-WFM-UK-Scheduling-Improved-Method-of-Assigning-Shifts-on-Tablet-Devices-Employee-Hours-Worked-and-Shift-Times-Exports-Maximum-Hours-Per-Day-Restrictions) show **Reporting → Employee Hours Worked Export → ShiftTimes**. The manager may need the **View Employee Hours Worked Export** permission. This export can contain **pay rates**, so keep the original private. Jooling's importer reads only employee name, department, location, and date-labeled Shift1/Shift2 time cells; it does not import pay rates. The supported date-column layout has headers such as `21/09/2026 Shift1` and cells such as `09:00 - 17:00`. Because Fourth products and custom exports vary, preview rejects unreadable cells instead of guessing. For other layouts, copy the shift list into the row-per-shift template and preview it.

## Workers first

In **Workers → Import**, upload a worker CSV or XLSX with an email column plus optional name, position, and location. Common aliases such as `First Name`, `Surname`, `Employee Email`, `Department`, and `Job Site` are supported. The import creates invitations; workers become active after accepting. A schedule export with names but no emails cannot safely create accounts for them. Invite workers, confirm their names, then preview the schedule import. The importer rejects duplicate names, mismatched email and name, and multiple source locations.

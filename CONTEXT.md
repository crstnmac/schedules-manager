# Hourly Scheduling

This context covers planning and communicating work for hourly teams in any industry. It exists to give every worker and manager a single, dependable understanding of scheduled work.

## Language

**Workplace**:
A business that uses the product to organize hourly work across one or more locations.
_Avoid_: Customer, tenant, account, organization

**Location**:
A physical place of work operated by a Workplace.
_Avoid_: Store, branch, site, restaurant

**Worker**:
A person employed by a Workplace to perform scheduled, hourly work at one or more Locations.
_Avoid_: User, staff member, resource

**Manager**:
A person authorized by a Workplace to plan and communicate work for one or more Locations.
_Avoid_: Administrator, scheduler

**Employment**:
The relationship connecting a Worker to a Workplace and authorizing work at one or more Locations and Positions. A person with multiple jobs has a separate Employment at each Workplace.
_Avoid_: Employee account, membership

**Schedule**:
The authoritative collection of planned Shifts for one Location during one workweek.
_Avoid_: Roster, calendar, timetable

**Successor Draft**:
An unpublished replacement being prepared from the current Published Schedule. Its changes remain invisible to Workers until published atomically as the next Schedule Version.
_Avoid_: Working copy, revision, update

**Shift**:
A period of work assigned to a Worker at a Location, normally associated with a Position.
_Avoid_: Slot, booking, event

**Daily Roster**:
The workers and Shifts planned for a Location on a particular day.
_Avoid_: Schedule, staff list

**Schedule Template**:
A named reusable set of Shift skeletons for one Location, including Position, times, and optional Employment, that a Manager can apply to a draft workweek.
_Avoid_: Recurrence, pattern, saved week

**Attendance Mark**:
A Manager's operational note on a published Shift for a workday: late, no-show, or sick. It does not change the Published Schedule or Time Entry.
_Avoid_: Timesheet status, punch correction, attendance record

**Unavailability**:
A hard constraint stating when a Worker cannot be scheduled. A Manager may override it only by recording a reason.
_Avoid_: Availability, preference, free time

**Work Preference**:
A Worker's non-binding preference about when or where to work.
_Avoid_: Availability, unavailability

**Time-off Request**:
A Worker's request not to be scheduled during a specified period.
_Avoid_: Leave, availability

**Published Schedule**:
A Schedule version formally communicated to affected Workers and treated as the current source of truth.
_Avoid_: Final schedule, live schedule

**Schedule Version**:
An immutable snapshot of a Schedule created by publication. A newer Schedule Version may supersede it but never alter it.
_Avoid_: Revision, copy, backup

**Schedule Change**:
A difference between consecutive Schedule Versions that affects one or more Workers.
_Avoid_: Update, edit

**Material Schedule Change**:
A Schedule Change that adds a Shift or substantially changes when or where a Worker is expected to work.
_Avoid_: Edit, correction

**Notice Window**:
The Workplace-defined period before a Shift during which a Material Schedule Change requires Shift Acceptance from the affected Worker.
_Avoid_: Lock period, cutoff

**Acknowledgement**:
A Worker's confirmation that they have seen a Published Schedule or Schedule Change. It does not express consent, availability, or acceptance of responsibility.
_Avoid_: Read receipt, approval, acceptance

**Delivery Status**:
The communication state of a Published Schedule or Schedule Change: Sent, Delivered, or Acknowledged.
_Avoid_: Notification status, read status

**Shift Acceptance**:
A Worker's explicit agreement to work a proposed new or materially changed Shift.
_Avoid_: Acknowledgement, read receipt, approval

**Time Entry**:
A Worker's record of started and finished work for an assigned Shift, started and ended by the Worker from the mobile app.
_Avoid_: Clock-in, punch, timesheet

**Shift Swap**:
A Worker-to-Worker agreement to exchange two assigned Shifts. It takes effect only when the counterpart agrees and a Manager approves; until then each Worker keeps their own Shift.
_Avoid_: Trade, exchange

**Open Shift**:
A Shift that needs a Worker and may be offered for pickup.
_Avoid_: Available shift, empty shift

**Shift Release**:
A Worker's request to give up an assigned Shift. The original Worker remains responsible until a replacement is found and approved by a Manager.
_Avoid_: Drop, cancellation

**Shift Pickup**:
A Worker's request or agreement to take an Open Shift or released Shift.
_Avoid_: Claim, assignment

**Worker Group**:
A named set of Employments a Manager uses to filter who appears on a Schedule.
_Avoid_: Department, tag, team

**Shift Tag**:
A label a Manager attaches to a Shift so the Schedule can be filtered by that label.
_Avoid_: Group, section

**Leave Type**:
A Workplace category of Time-off Request, such as vacation or sick.
_Avoid_: PTO type, leave code

**PTO Balance**:
The remaining Time-off minutes of one Leave Type for one Employment.
_Avoid_: Accrual, allowance bank

**Time Block**:
A named start and end time a Manager reuses when creating Shifts.
_Avoid_: Day part, template

**Day Part**:
A named time-of-day window used to filter Shifts on the Schedule.
_Avoid_: Time block, meal period as a stored type

**Shift Template**:
A reusable Shift skeleton for one Position and time range that a Manager applies to a single cell.
_Avoid_: Schedule Template, recurrence

**Break**:
A pause recorded on a Time Entry that does not count as worked time.
_Avoid_: Clock-out, unpaid interval as the record name

**Timesheet Approval**:
A Manager's decision that a completed Time Entry is accepted for hours.
_Avoid_: Punch approval, Attendance Mark

**Wage Rate**:
The hourly pay in cents recorded on an Employment.
_Avoid_: Salary, payroll rate

**Labor Cost**:
The estimated pay for scheduled or worked minutes, including overtime.
_Avoid_: Payroll, labor percentage as the whole concept

**Daily Sales**:
A Location's recorded sales amount for one date, used to compute labor percentage.
_Avoid_: POS sync, ticket total

**Geofence**:
A circular distance around a Location that a Worker must be inside to start a Time Entry.
_Avoid_: GPS lock

**Kiosk**:
A shared Location clock that identifies a Worker by PIN rather than a personal session.
_Avoid_: Tablet mode, time clock terminal

**Shift Task**:
A checklist item a Worker completes on a Shift.
_Avoid_: Todo, SOP

**Auto-assign**:
Filling unassigned draft Shifts from eligible Employments without a Manager picking each person.
_Avoid_: AI scheduling

**Announcement**:
A Workplace-wide notice from a Manager to Workers.
_Avoid_: Newsfeed, social post

**Workplace Message**:
A written exchange between Employments at one Workplace.
_Avoid_: Chat, SMS, DM as the record name

**Employment Document**:
A named record or link attached to an Employment.
_Avoid_: HR file, attachment blob

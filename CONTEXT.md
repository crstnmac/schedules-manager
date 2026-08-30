# Restaurant Scheduling

This context covers planning and communicating work for hourly teams in independent full-service restaurants. It exists to give every worker and manager a single, dependable understanding of scheduled work.

## Language

**Workplace**:
A full-service restaurant business that uses the product to organize work across one or more locations.
_Avoid_: Customer, tenant, account, organization

**Location**:
A physical restaurant operated by a Workplace.
_Avoid_: Store, branch, site

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

**Position**:
The kind of work a Worker is expected to perform during a Shift, such as server, cook, or bartender.
_Avoid_: Role, job

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

**Open Shift**:
A Shift that needs a Worker and may be offered for pickup.
_Avoid_: Available shift, empty shift

**Shift Release**:
A Worker's request to give up an assigned Shift. The original Worker remains responsible until a replacement is found and approved by a Manager.
_Avoid_: Drop, cancellation

**Shift Pickup**:
A Worker's request or agreement to take an Open Shift or released Shift.
_Avoid_: Claim, assignment

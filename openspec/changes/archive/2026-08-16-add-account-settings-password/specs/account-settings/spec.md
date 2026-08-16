## Purpose

Gives an authenticated user a settings area, reachable from the dashboard header, where they can manage their own account — starting with changing their password.

## ADDED Requirements

### Requirement: Settings area is reachable from the dashboard header
The system SHALL provide a dropdown, triggered by the user's email in the dashboard header, containing a link to the settings area and the sign-out action.

#### Scenario: Opening the account dropdown
- **WHEN** an authenticated user clicks their email in the dashboard header
- **THEN** the system shows a dropdown containing a "Settings" link and a "Sign out" action

#### Scenario: Navigating to settings
- **WHEN** an authenticated user selects "Settings" from the dropdown
- **THEN** the system navigates to the settings area

### Requirement: Settings area requires an active session
The system SHALL deny access to the settings area when no valid session is present, consistent with other protected dashboard routes.

#### Scenario: Unauthenticated access redirected
- **GIVEN** no active session
- **WHEN** a request is made to any settings route
- **THEN** the system redirects to the login page instead of rendering the settings page

### Requirement: User can change their password
The system SHALL allow an authenticated user to change their password by submitting their current password and a new password, and SHALL reject the change if the current password does not match the account's stored password.

#### Scenario: Successful password change
- **GIVEN** an authenticated user on the password settings tab
- **WHEN** they submit their correct current password and a valid new password
- **THEN** the system updates the stored password hash and shows a success confirmation

#### Scenario: Incorrect current password rejected
- **GIVEN** an authenticated user on the password settings tab
- **WHEN** they submit an incorrect current password
- **THEN** the system rejects the change with an error and does not modify the stored password

#### Scenario: New password fails validation
- **GIVEN** an authenticated user on the password settings tab
- **WHEN** they submit a correct current password but a new password that does not meet minimum requirements (e.g. below minimum length)
- **THEN** the system rejects the submission with a validation error and does not modify the stored password

### Requirement: Active session remains valid after password change
The system SHALL re-establish the current session's validity after a successful password change so the user is not logged out on their current device.

#### Scenario: Session continues after password change
- **GIVEN** an authenticated user with an active session
- **WHEN** they successfully change their password
- **THEN** their current session remains authenticated and they can continue navigating the dashboard without re-entering credentials

### Requirement: Password change does not affect other sessions
The system is not required to invalidate the user's other active sessions (other devices/browsers) when a password change occurs.

#### Scenario: Other device session unaffected
- **GIVEN** a user is logged in on two different devices
- **WHEN** they change their password from one device
- **THEN** the session on the other device remains active and is not forced to re-authenticate

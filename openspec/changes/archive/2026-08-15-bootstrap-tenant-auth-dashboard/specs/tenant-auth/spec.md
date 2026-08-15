## Purpose

Lets a person create a tenant account and authenticate into it with email and password, establishing the session that scopes all further tenant-owned data access.

## ADDED Requirements

### Requirement: Registration creates one tenant and one user
The system SHALL, on successful registration, create exactly one `tenant` record and one `user` record linked 1:1, storing a hashed password (never plaintext).

#### Scenario: Successful registration
- **GIVEN** no account exists for the submitted email
- **WHEN** a person submits a valid email and password to the registration form
- **THEN** the system creates one tenant and one user, hashes the password, and starts an authenticated session for the new tenant

#### Scenario: Duplicate email rejected
- **GIVEN** an account already exists for the submitted email
- **WHEN** a person submits that email to the registration form
- **THEN** the system rejects the registration and does not create a duplicate tenant or user

#### Scenario: Invalid input rejected
- **GIVEN** the registration form is submitted
- **WHEN** the email is not a valid email format or the password is below the minimum length
- **THEN** the system rejects the submission with a validation error and creates no records

### Requirement: Login authenticates via email and password
The system SHALL authenticate a person by verifying their submitted password against the stored hash for the given email, and establish a session on success.

#### Scenario: Successful login
- **GIVEN** a registered user
- **WHEN** they submit their correct email and password
- **THEN** the system establishes a session and redirects to the dashboard

#### Scenario: Invalid credentials rejected
- **GIVEN** the login form is submitted
- **WHEN** the email is not registered or the password does not match
- **THEN** the system rejects the login with a generic error that does not reveal which field was incorrect

### Requirement: Session identifies the acting tenant
The system SHALL embed `userId` and `tenantId` in the session token issued at login, and every authenticated request SHALL derive the acting tenant from this session rather than from client-supplied input.

#### Scenario: Session carries tenant identity
- **GIVEN** an authenticated session
- **WHEN** any authenticated request is made
- **THEN** the tenant context used for data access is read from the session token, not from request parameters, query strings, or headers

### Requirement: Protected routes require an active session
The system SHALL deny access to authenticated-only routes when no valid session is present.

#### Scenario: Redirect to login
- **GIVEN** no active session
- **WHEN** a request is made to the dashboard or any project workspace route
- **THEN** the system redirects to the login page instead of rendering the requested page

### Requirement: Logout ends the session
The system SHALL invalidate the active session on logout.

#### Scenario: Successful logout
- **GIVEN** an active session
- **WHEN** the person logs out
- **THEN** the session is invalidated and a subsequent request to a protected route redirects to login

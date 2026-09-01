## Purpose

Lets a tenant attach an image, picked from their local computer, to an entry — uploading it to the tenant's own configured Cloudinary account and storing the resulting asset's metadata as the field's value.

## ADDED Requirements

### Requirement: Image is a selectable widget type
The system SHALL offer `image` as a widget type when a tenant adds or edits a field, alongside the existing supported set, with configuration for a maximum file size and a set of allowed image formats.

#### Scenario: Field created with the image widget
- **GIVEN** a tenant is editing a collection they own
- **WHEN** they add a field with key `cover`, label `Cover image`, and widget `image`
- **THEN** the system creates the field on that collection, positioned last

#### Scenario: Field configuration accepts size and format limits
- **GIVEN** a tenant is configuring a field with widget `image`
- **WHEN** they set a maximum file size and a list of allowed formats and submit
- **THEN** the system saves that configuration on the field

#### Scenario: Field configuration is optional
- **GIVEN** a tenant is configuring a field with widget `image`
- **WHEN** they submit the field with no size or format limits set
- **THEN** the system saves the field with no constraint beyond selecting an image file

### Requirement: Image field only accepts a local file
The system SHALL let the author pick an image file from their local device for an `image` field, and SHALL NOT offer entering a remote image URL.

#### Scenario: Local file picker offered
- **GIVEN** an entry editor with an `image` field
- **WHEN** the field's editor renders
- **THEN** the author is offered a way to pick a file from their local device

#### Scenario: Remote URL entry is not offered
- **GIVEN** an entry editor with an `image` field
- **WHEN** the field's editor renders
- **THEN** no control for entering a remote image URL is present

### Requirement: Upload is blocked when Cloudinary is not configured
The system SHALL check, at the moment the author triggers an image upload, whether the tenant has a saved Cloudinary configuration, and SHALL warn the author and not attempt the upload when none exists.

#### Scenario: Upload attempted with no configuration saved
- **GIVEN** a tenant with no Cloudinary configuration saved
- **WHEN** an author picks a file on an `image` field and triggers the upload
- **THEN** the system shows a warning that Cloudinary is not configured and does not contact Cloudinary

#### Scenario: No warning before the upload is triggered
- **GIVEN** a tenant with no Cloudinary configuration saved
- **WHEN** an author picks a file on an `image` field but has not yet triggered the upload
- **THEN** the system shows no configuration warning

### Requirement: Upload is preceded by a live connection check
The system SHALL verify the tenant's saved Cloudinary credentials by contacting Cloudinary immediately before attempting an upload, rather than relying solely on a previously recorded check result, and SHALL NOT attempt the upload when that verification fails.

#### Scenario: Verification succeeds
- **GIVEN** a tenant with a saved Cloudinary configuration that authenticates successfully
- **WHEN** an author triggers an image upload
- **THEN** the system verifies the connection, then proceeds to upload the file

#### Scenario: Verification fails
- **GIVEN** a tenant with a saved Cloudinary configuration that fails to authenticate
- **WHEN** an author triggers an image upload
- **THEN** the system shows an error that the connection could not be verified and does not attempt the upload

#### Scenario: A stale prior success does not skip verification
- **GIVEN** a tenant whose most recent recorded connection check succeeded, but whose credentials have since stopped working
- **WHEN** an author triggers an image upload
- **THEN** the system re-verifies the connection rather than trusting the recorded result, and blocks the upload on the fresh failure

### Requirement: Picked file is validated against the field's constraints
The system SHALL reject a picked file that exceeds the field's configured maximum size or is not among its configured allowed formats, both before and independent of any client-side check.

#### Scenario: Oversized file rejected
- **GIVEN** an `image` field configured with a maximum file size
- **WHEN** an author uploads a file larger than that maximum, bypassing any client-side check
- **THEN** the system rejects the upload with an error and stores nothing

#### Scenario: Disallowed format rejected
- **GIVEN** an `image` field configured with a specific set of allowed formats
- **WHEN** an author uploads a file in a format outside that set, bypassing any client-side check
- **THEN** the system rejects the upload with an error and stores nothing

#### Scenario: Unconfigured field accepts any image
- **GIVEN** an `image` field with no size or format limits configured
- **WHEN** an author uploads an image file
- **THEN** the system does not reject the upload on size or format grounds

### Requirement: Uploaded image is stored as Cloudinary asset metadata
The system SHALL store an `image` field's value as the uploaded asset's Cloudinary metadata — including its secure URL, its public identifier, its dimensions, its format, and its size — rather than a bare URL string.

#### Scenario: Successful upload populates the field
- **GIVEN** an author picks a valid image file on an `image` field and triggers the upload
- **WHEN** the upload to Cloudinary succeeds
- **THEN** the system stores the asset's secure URL, public identifier, width, height, format, and byte size as the field's value

#### Scenario: Upload failure leaves the field unset
- **GIVEN** an author triggers an image upload
- **WHEN** the upload to Cloudinary fails for a reason other than a configuration or connection problem
- **THEN** the system shows an error and the field's value is not changed

### Requirement: Replacing an image removes the previous asset from Cloudinary
The system SHALL attempt to delete an `image` field's previously uploaded asset from the tenant's Cloudinary account when it is replaced by a new upload, and SHALL NOT block saving the new image or surface a blocking error when that deletion fails.

#### Scenario: Replacing a previous image deletes it
- **GIVEN** an `image` field already holding a successfully uploaded image
- **WHEN** the author uploads a new image on that field and it succeeds
- **THEN** the system stores the new asset's metadata as the field's value and attempts to delete the previous asset from Cloudinary

#### Scenario: Cleanup failure does not block the replacement
- **GIVEN** an `image` field already holding a successfully uploaded image
- **WHEN** the author uploads a new image that succeeds, but deleting the previous asset from Cloudinary fails
- **THEN** the field's value still reflects the new image, and no blocking error is shown to the author

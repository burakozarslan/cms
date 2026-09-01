## 1. Project rename — service layer

- [x] 1.1 Add `updateProject(tenantId, projectId, input)` to `src/lib/projects/service.ts`: parse `{ name }` with the existing `projectNameSchema`, load the project scoped by `tenantId`, return the same not-found result used by other project lookups if missing, update only the `name` column, and return the refreshed project.
- [x] 1.2 Write unit tests for `updateProject`: successful rename, empty/whitespace name rejected, unknown/foreign project id rejected, slug and id unchanged after rename.

## 2. Collection rename — service layer

- [x] 2.1 Add `updateCollection(tenantId, projectId, collectionId, input)` to `src/lib/collections/service.ts`: parse `{ name }` with the existing `collectionNameSchema`, load the collection scoped by `tenantId` and `projectId`, return the same not-found result used by other collection lookups if missing, update only the `name` column, and return the refreshed collection.
- [x] 2.2 Write unit tests for `updateCollection`: successful rename, empty/whitespace name rejected, collection id belonging to a different project rejected, slug and id unchanged after rename.

## 3. Server actions

- [x] 3.1 Add `updateProjectAction` to `src/app/dashboard/actions.ts`, following `createProjectAction`'s conventions: accept project id + form data, call `updateProject`, revalidate the dashboard path on success, return the same field-error shape on failure.
- [x] 3.2 Add `updateCollectionAction` to `src/app/dashboard/[projectId]/actions.ts`, following `createCollectionAction`'s conventions: accept project id + collection id + form data, call `updateCollection`, revalidate the project workspace path on success, return the same field-error shape on failure.

## 4. Project card UI

- [x] 4.1 In `src/app/dashboard/page.tsx`, add an "Edit"/"Rename" toggle button next to each project card's existing Delete button, following the toggle-to-inline-form pattern used in `field-list.tsx`.
- [x] 4.2 When toggled, render an inline form (text input pre-filled with current name, Save/Cancel) in place of the name display, submitting to `updateProjectAction` and rendering validation errors inline.
- [x] 4.3 Verify Cancel dismisses the form without submitting, and Save with a valid name updates the displayed name without a full page reload feel (revalidation should be seamless).

## 5. Collection card UI

- [x] 5.1 In `src/app/dashboard/[projectId]/page.tsx`, add the same "Edit"/"Rename" toggle button next to each collection card's existing Delete button.
- [x] 5.2 Wire the inline form to `updateCollectionAction`, mirroring the project card's behavior (pre-filled input, Save/Cancel, inline validation errors).
- [x] 5.3 Verify Cancel and Save behavior matches the project card implementation.

## 6. Verification

- [x] 6.1 Manually test renaming a project and a collection end-to-end in the running app: name updates, slug/id/URL unchanged, associated collections/entries untouched.
- [x] 6.2 Manually verify a rename attempt against another tenant's project/collection (e.g. via direct id manipulation) is denied.
- [x] 6.3 Run the full test suite and confirm no regressions in existing project/collection create/delete tests.
</content>

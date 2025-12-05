

## Scope Analysis

Application List Display

applicants-newapplicants-in-progressapplicants-pendingapplicants-completeapplicants-incomplete

☐ Data table displaying applications with columns: Applicant name, Type, Submitted, Affiliate, and additional columns specific to status

☐ Clickable applicant names navigating to detail view

☐ Row-level navigation via arrow icons

☐ Display of application types (Individual, Business, Joint, Trust, Foundation)

☐ Timestamp display with relative and absolute formats

☐ Empty state handling for missing data (blank cells for Affiliate, Sales rep)

☐ Multi-line notes field expansion for "In progress" status

☐ Text truncation with ellipsis for overflow content in Affiliate column

☐ Full-width table expansion when content doesn't fit

⏬ Pagination controls (low priority - show only if needed with 100+ records per design note, delay until end per epic)

✅ Header with logo, search, contact info, navigation (already completed)

✅ Footer with copyright and legal links (already completed)

❓ How many applications load initially before pagination is required?

❓ What displays when a status tab has zero applications?

❓ Are entire rows clickable in addition to arrow icons?

❓ How does the table adapt for mobile (card layout, scrollable, column hiding)?

Status-Based Filtering

applicants-newapplicants-in-progressapplicants-pendingapplicants-completeapplicants-incomplete

⏬ Five status filter tabs: New, In progress, Pending client, Complete, Incomplete with active/inactive states (low priority - delay until end per epic)

⏬ Tab interaction to switch between application status views (low priority - delay until end per epic)

❓ On mobile, do tabs scroll horizontally, stack vertically, or convert to dropdown?

Column Sorting

applicants-newapplicants-in-progressapplicants-pendingapplicants-completeapplicants-incomplete

⏬ Sortable columns with arrow indicators on Submitted, Last activity, Last complete, Client time, Completed (low priority - delay until end per epic)

⏬ Toggle sort order (ascending/descending) on column header click (low priority - delay until end per epic)

Application Details: Personal Information

application-application-details

☐ Page title with applicant name and type (e.g., "James Allen Smith – Individual")

☐ Status badge display (e.g., "In review") with color coding

☐ Breadcrumb navigation: Applications > Application details

☐ Personal section with three columns: Details (name, gender, DOB, residential address), Contact details (email, phone, mailing address), Employment (position, employer, beneficial owner)

☐ Display of Canadian address format with province and postal code

☐ Beneficiaries section showing designated beneficiaries

❓ Is gender selection required or optional?

❓ How are international addresses handled outside Canada/US?

❓ What validation rules apply to postal codes for different countries?

Application Details: Security and Compliance

application-application-details

☐ Security section with political exposure status and source of funds

☐ Source of funds with multiple selection support (Personal savings, Business profits displayed as bullet list)

☐ Political exposure indicator: "Not a politically exposed person"

❓ What are all the possible source of funds options?

❓ What are the validation requirements for politically exposed persons?

Application Details: Identity Verification

application-application-details

☐ Document type selection with three options: Passport, Driver's license, Citizenship card (pill-shaped toggles)

☐ Full passport image display with zoom capability (click to enlarge to full-screen, click again to return per design note)

☐ Radio button selection for primary identification document

☐ Supporting document section with expandable dropdown

☐ Utility bill document display showing account number, service details, charges

☐ Radio button selection for supporting documents

☐ Multiple document upload and display capability

❓ What file formats are accepted for document uploads (PDF, JPG, PNG)?

❓ What are the file size limits for document uploads?

❓ Is there a document approval/rejection workflow after upload?

❓ How are document versions tracked if applicant uploads corrections?

Application Details: Marketing Preferences

application-application-details

☐ Marketing section with three columns capturing: Newsletter opt-in, Additional interests, Referral source ("How did you learn about SWP?"), Familiarity level, Initial intent with SWP, Investment amount

☐ CRM integration for marketing preferences (critical per design note: "Ensure these are all tied to marketing needs in CRM")

☐ Referral source tracking with options including "Friend"

☐ Initial intent capture: "Buy and store with SWP"

☐ Additional interests including crypto payment preferences

☐ Newsletter subscription status display

❓ Which CRM system is being integrated?

❓ What are the exact field mappings to CRM?

❓ What are all the options for "How did you learn about SWP?"

❓ What are the Familiarity level options (currently shows "Not selected")?

❓ What are the Investment amount range options (currently shows "Not selected")?

Application Details: Tab Navigation

application-application-detailsapplication-checksapplication-mapapplication-salesapplication-agreement-fixedapplication-notesapplication-agreement-rateapplication-agreement-customapplication-agreement-fixed-sentapplication-agreement-fixed-signed

☐ Six-tab navigation system: Application, Checks, Location, Sales, Agreement, Notes

☐ Active tab indicated with dark blue background and white text

☐ Inactive tabs with white background and dark blue border

☐ Tab state persistence when switching between sections

❓ Must tabs be completed in order, or can users jump around?

❓ Do unsaved changes trigger warnings when switching tabs?

Application Details: Workflow Actions

application-application-details

☐ "Continue to Checks" button - primary action to progress workflow

☐ "Request additional info" button - secondary action for requesting more information from applicant

❓ What happens to current tab's data when continuing to next step without explicit save?

❓ What validation is required before "Continue to Checks" can be clicked?

World Check Integration

application-checks

☐ World Check card display for every applicant (per design note)

☐ Preliminary status display (e.g., "No concerns")

☐ SWP-defined risk rating selector with three options: Low risk, Medium risk, High risk (segmented control style)

☐ "View in World Check" button opening external World-Check interface for case management

☐ Risk rating workflow: Emma/Moni use external World-Check to create/manage cases, then return to enter risk rating in SWP system (per design note)

☐ Duplicate applicant handling: reference previous application's World-Check case if possible, or flag for manual handling if person recognized but can't reference (per design note)

❓ Is risk rating selection required before continuing to next step?

❓ Should there be validation that World Check has been viewed before allowing risk rating?

❓ How does the system detect duplicate applicants for case referencing?

TruthFinder Integration

application-checks

⏬ TruthFinder card display for American applicants only (low priority - delay until end per epic)

⏬ TruthFinder status tracking with four options: Not run, Run nothing found, Run no matched individual, Run results downloaded (low priority - delay until end per epic)

⏬ "View in TruthFinder" button for external system access (low priority - delay until end per epic)

❓ What happens to the TruthFinder card for non-American applicants - is it hidden entirely?

Compliance Checks: Document Display

application-checks

☐ Passport image display on Checks screen with click-to-enlarge functionality (click once to full-screen, click again to return per design note)

☐ Display of passport biographical data and document details

☐ Machine-readable zone display at bottom of passport

❓ Should passport display zoom/pan controls when enlarged?

Compliance Checks: Workflow Actions

application-checks

☐ "Continue to Location" button - progress to next workflow step

☐ "Deny application" button - reject application workflow

❓ What happens when "Deny application" is clicked - modal confirmation, immediate action, or redirect to denial form?

Location Verification

application-map

⏬ Map display showing applicant's residential address with street view (low priority - delay until end per epic)

⏬ Address verification status indicator with checkmark icon and "Residential address verified" text (low priority - delay until end per epic)

⏬ Map search control with magnifying glass icon for address location adjustment (low priority - delay until end per epic)

⏬ Standard map controls for zoom, pan, street view (low priority - delay until end per epic)

☐ "Continue to Sales" button - progress to next step

☐ "Request residential address" button - request address correction from applicant

❓ What determines when user needs to "Request residential address" vs. continuing when address is already verified?

❓ What map provider is being used (design note indicates "Google Maps?" with uncertainty)?

Sales Assignment

application-sales

☐ Applicant information display with three questions: Already spoke to a sales rep?, Is the applicant from the Cayman Islands?, How did you learn about SWP?

☐ Sales rep assignment dropdown (empty state shown)

☐ Referrer assignment dropdown (empty state shown)

☐ Account number text input field (empty state shown)

☐ Sales rep status table showing workload distribution with columns: Rep, Month (monthly assignment count), Year (yearly assignment count), Latest (most recent account number)

☐ "Continue to Agreement" button - progress to next workflow step

☐ Possibly related existing clients section with matching algorithm based on name, address, phone, email, DOB (per design note)

☐ Clickable links to related client profiles with arrow icons

❓ Is the sales rep dropdown pre-populated with reps from the status table?

❓ Are any Assignment fields required before proceeding?

❓ Are rep names in the status table clickable?

❓ How does Month/Year count update when new application is assigned?

❓ Is the affiliate field populated automatically or manually entered?

Agreement: Pricing Configuration

application-agreement-fixedapplication-agreement-rateapplication-agreement-custom

☐ Pricing type selection with three options: Rate, Fixed fee, Custom (pill-shaped segmented control)

☐ Progressive disclosure: second-level options appear only after first option selected (per design note)

☐ Fixed fee pricing: yearly fixed fee amount input with $ prefix and "/ year" suffix

☐ Rate pricing: rate presets toggle (Standard/Custom) with five metal percentage inputs (Gold, Silver, Platinum, Palladium, Rhodium) with % suffix

☐ Standard preset: pre-filled, non-editable percentage values from https://swpcayman.com/storage/segregated (per design note)

☐ Custom preset: blank, editable percentage fields for manual entry (per design note)

☐ Custom pricing: upload button for manually created PDF agreement with informational alert explaining manual process

☐ Download icon button for agreement preview/draft (visible on fixed and rate options)

☐ "Finalize and send agreement to applicant" button with right arrow - primary action for all pricing types

❓ What happens when switching from Custom preset back to Standard after entering custom values?

❓ What validation rules apply to percentage values (minimum, maximum, decimal places)?

❓ What file format validation occurs when uploading custom agreements?

❓ Can users save draft without finalizing?

❓ Is there a preview step before sending agreement?

Agreement: Sent State

application-agreement-fixed-sent

☐ Status badge update to "Pending signature" after agreement sent

☐ Read-only state: all fields across all screens become non-editable after sending (per design note)

☐ Field transformation: action buttons removed, input fields replaced with static text displays (per design note)

☐ Download application button styled as secondary action (gold border, white background) replacing previous primary action

☐ Application appears in "pending client" list on main screen (per design note)

☐ Small download icon button removed (per design note)

❓ Is there a workflow to recall/cancel a sent application?

❓ What happens to unsaved changes when application transitions to sent state?

Agreement: Signed State

application-agreement-fixed-signed

☐ Status badge update to "Complete" with green background after signing

☐ "Signed application" card with "View the signed application" button to open signed PDF (per design note)

☐ "Download application" button with download icon for retrieving signed document

☐ Read-only state maintained: entire application remains uneditable (per design note)

☐ Application moves to "complete" group on main screen (per design note)

❓ Does "View the signed application" open in new tab, modal, or inline viewer?

❓ Is there document version tracking for the signed PDF?

❓ Can users navigate back to edit if they notice an error after signing?

Application Notes

application-notes

☐ Notes section with textarea labeled "Optional, internal notes"

☐ Note field labeled "Note" with full-width multi-line input

☐ Note population to "Notes" column on main Applicants screen (per design note)

☐ Internal-only notes (not visible to applicants)

❓ Is there a character limit for notes field?

❓ When is the note saved - on blur, tab change, or explicit save?

❓ Is there unsaved changes warning when navigating away?

❓ Are notes version-tracked or audit-logged?

❓ What permissions are required to view/edit notes?

Request Additional Information

application-application-details-request-info

☐ Modal dialog with "Request additional information" title and close button

☐ "Reason for request" dropdown with predefined options: ID expired, ID altered, No ID but selfie, ID not readable, POA is older than 3 months, Address on POA does not match, No date shown on POA, No name shown on POA, No address shown on POA, Cannot accept Driver's License as proof of address, Cannot accept outside of an envelope, PO Box address issue, Custom

☐ Custom option reveals additional text field for entering custom email text (per design note)

☐ Pre-built email templates for each predefined reason (per design note)

☐ "Send to applicant" button - primary action to send request via email

☐ "Cancel" button - close modal without sending

☐ Modal close (X) button - same behavior as Cancel

❓ What is the exact character limit for custom reason text?

❓ Should there be confirmation dialog after clicking "Send to applicant"?

❓ Can multiple reasons be selected, or only one?

❓ Is draft saved if user closes modal?

❓ Is there email preview before sending?

❓ Where is request history tracked/visible?

Remaining Questions

❓ What are keyboard navigation patterns for tabs and interactive elements?

❓ Are there defined focus states for accessibility?

❓ What ARIA labels are needed for screen readers?

❓ How do real-time updates work (e.g., "5 min ago" timestamps auto-updating)?

❓ What error handling is implemented for network failures?

❓ What loading states are shown during data fetching and form submissions?

❓ Which fields across all screens are required vs. optional?

❓ What triggers application status changes (New → In progress → Pending client → Complete/Incomplete)?

❓ Who has permissions to change application statuses?

❓ Is there an audit trail for all application changes?

❓ How are applicant notifications delivered (email, SMS, in-app)?
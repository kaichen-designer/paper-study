## Requirements

### Requirement: PDF Upload

The system SHALL allow an authenticated user to upload a PDF file to create a new paper entry in their library.

#### Scenario: Successful upload creates a paper entry

- **WHEN** an authenticated user selects a local PDF file and confirms upload
- **THEN** the system SHALL store the file and create a corresponding paper record visible in the user's library

#### Scenario: Non-PDF file is rejected

- **WHEN** a user attempts to upload a file that is not a valid PDF
- **THEN** the system SHALL reject the upload and display an error message without creating a paper record

### Requirement: PDF Rendering and Pagination

The system SHALL render an uploaded PDF's pages and allow the user to navigate between pages.

#### Scenario: Open a paper and view first page

- **WHEN** a user opens a paper from their library
- **THEN** the system SHALL render the first page of the PDF within the reading view

#### Scenario: Navigate to next page

- **WHEN** a user triggers "next page" while viewing page N of a paper with more than N pages
- **THEN** the system SHALL render page N+1

### Requirement: Text Selection Extraction

The system SHALL extract the underlying text content for a user's on-page text selection.

#### Scenario: Extract text from a selection

- **WHEN** a user selects a region of text on a rendered PDF page
- **THEN** the system SHALL extract the corresponding text content from that page for downstream use (e.g. translation)

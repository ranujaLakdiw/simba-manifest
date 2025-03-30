# Simba Car Hire - Daily Manifest Uploader V2 🚗💨

## Overview

Welcome to the Simba Car Hire Daily Manifest Uploader! This tool streamlines the process of handling the daily vehicle pickup manifest. Instead of manual data entry or complex imports, staff can simply upload the standard daily manifest Excel file through a user-friendly web page.

The tool automatically:
1. Reads the relevant data from the Excel file.
2. Cleans and formats the information.
3. Sorts the pickups logically.
4. Updates the central **'Pickup List'** Google Sheet.
5. Includes smart features like duplicate prevention and automatic data clearing for new days.

**Goal:** To save time, reduce errors, and ensure the 'Pickup List' Google Sheet is always up-to-date with the latest manifest data.

## Features ✨

* **Easy File Upload:** Simple web interface to upload `.xls` or `.xlsx` manifest files.
* **Smart Parsing:** Automatically finds and processes data from sheets containing `"Pick"` in their name.
* **Data Cleaning:** Removes unnecessary columns and formats key fields like `'Rego (ready)'`, `'Arrival'`, and `'Items / Notes'`.
* **Automatic Sorting:** Sorts pickups chronologically by `'Time'`, with `'Res.'` number as a secondary sort key.
* **Direct Google Sheet Integration:** Pushes the processed data directly into the designated `'Pickup List'` or `'Tomorrow'` Google Sheet.
* **Progress Indicator:** Visual loader shows the progress of the upload process.
* **New Day Data Handling:** Automatically clears the *previous* day's data when a manifest for a *new* `'Pickup Date'` is uploaded.
* **Duplicate Prevention:** Avoids adding entries with the same `'Res.'` (Reservation) number already present for the current day.
* **Task Management Ready:** Sets a default `'Task'` status and adds a dropdown data validation list (`Not Assigned`, `Available`, `Photos Taken`, `Completed`, `Maintenance`) to the sheet for easy status tracking.
* **Auto Uppercase (Sheet-side):** Automatically converts anything typed into the `'Rego (ready)'` column directly in the Google Sheet to uppercase.

## Demo / Screenshots 📸

*(Replace the placeholder filenames with your actual image paths/URLs)*

**1. Upload Interface:** Shows the main screen where users select the file.
![Upload Interface](placeholder_upload_interface.png "Web page interface for file selection")

**2. Loading Animation:** The screen shown during file processing and upload.
![Loader Animation](placeholder_loader.gif "Loading animation with progress percentage")

**3. Google Sheet Result:** The `'Pickup List'` Google Sheet after a successful upload.
![Google Sheet Result](placeholder_sheet_result.png "Updated Google Sheet with sorted data and task dropdowns")

## How It Works ⚙️

The system consists of two main parts: a frontend web page and a Google Apps Script backend.

1. **Frontend (HTML, CSS, JavaScript - `manifestWrangler.js`)**
    * User selects the daily manifest Excel file via the webpage (`index.html`).
    * JavaScript uses the `SheetJS` library (`xlsx.full.min.js`) to read the file *in the browser*.
    * It identifies sheets with `"Pick"` in the name.
    * Data is extracted, cleaned (removing columns, processing Rego, Arrival, Items), and formatted.
    * The cleaned data is sorted by `'Time'` and then `'Res.'`.
    * The script displays a loader animation.
    * It sends the data row-by-row (with a 2-second delay between rows) via `Workspace` `POST` requests to the Google Apps Script Web App URL.
    * A final request signal (`Sort=true`) is sent *after* all data rows.
    * Upon completion, it shows a success message and reloads the page.

2. **Backend (Google Apps Script - `Code.gs`)**
    * The script is deployed as a Web App, providing an HTTPS endpoint (`doPost`).
    * It uses `PropertiesService` to securely store and retrieve the ID of the target Google Sheet.
    * `LockService` prevents issues if multiple uploads happen simultaneously.
    * When data is received (`doPost`):
        * It reads the headers (Row 2) and existing data (Row 3 onwards) from the `'Pickup List'` sheet.
        * **Date Check:** Compares the incoming `'Pickup Date'` to the date in the *first* existing data row (Row 3). If they differ, it assumes a new day's manifest is being uploaded and **clears all previous data** (from Row 3 down) and their data validations before proceeding.
        * **Duplicate Check:** Checks if the incoming `'Res.'` number already exists in the current data set. If it's a duplicate, the row is skipped.
        * **Data Mapping:** Maps the incoming data fields to the corresponding columns based on the header row.
        * **'Task' Column Handling:** Determines the initial `'Task'` value based on an incoming `'Status'` field (if provided, e.g., `'hired'`/`'returned'` -> `'Completed'`, `'maintenance'` -> `'Maintenance'`, otherwise `'Not Assigned'`).
        * **Append Row:** Adds the processed `newRow` data to the next available row in the sheet.
        * **Data Validation:** Applies a dropdown list (`Not Assigned`, `Available`, etc.) to the newly added `'Task'` cell.
        * **Sorting Signal:** If the incoming data includes `Sort=true`, the script *sorts* the existing data range (Row 3 down to last row) by the first column (`#`) instead of adding the row.
        * Returns a JSON response (`success`, `duplicate`, or `error`) to the frontend.
    * An `onEdit` trigger runs automatically whenever the Google Sheet is edited manually. If Column H (`'Rego (ready)'`) is edited in Row 3 or below, it converts the entered value to uppercase.

## Setup Instructions 🛠️

Follow these steps to get the uploader working:

1.  **Prepare Google Sheet:**
    * Create a new Google Sheet or use an existing one.
    * Rename one sheet to **`Pickup List`** (can add `Tomorrow` sheet too, but not compulsary).
    * In the `Pickup List` sheet, set up your **Header Row in Row 2**. The column names *must exactly match* the data fields expected by the Apps Script and sent by the frontend (e.g., `#`, `Time`, `Res.`, `Name`, `Vehicle Type`, `Rego (ready)`, `Arrival`, `Items / Notes`, `Task`, etc.). Data will start appearing from Row 3.

2.  **Deploy Google Apps Script:**
    * Open your Google Sheet.
    * Go to **`Extensions > Apps Script`**.
    * Delete any boilerplate code and paste the entire content of the provided Google Apps Script (`Code.gs`) into the editor.
    * **Run Initial Setup:**
        * In the editor toolbar, select the function `intialSetup` from the dropdown list.
        * Click **`Run ▶️`**.
        * **Authorize the script:** You'll be asked to grant permissions. Review the permissions (it will need access to Google Sheets and Script properties) and allow them. This step stores your Sheet ID so the script knows where to write data.
    * **Deploy as Web App:**
        * Click the **`Deploy`** button (top right) > **`New deployment`**.
        * Click the Gear icon ⚙️ next to "Select type" and choose **`Web app`**.
        * Fill in the deployment configuration:
            * *Description:* `Simba Manifest Uploader Endpoint V2` (or similar)
            * *Execute as:* **`Me`** (Your Google Account)
            * *Who has access:* Choose carefully:
                * `Anyone` - Easiest, but the URL is public (though unguessable).
                * `Anyone within [Your Organization]` - More secure if all users are within your Google Workspace domain.
                * `Only myself` - Only for testing.
        * Click **`Deploy`**.
        * **Copy the Web app URL**. You'll need this for the frontend. Click **`Done`**.
        * *(Note: If you update the script code later, you need to create a **New deployment** again to make the changes live).*

3.  **Configure Frontend:**
    * Place the `index.html`, `alchemy.css`, and `manifestWrangler.js` files together in a folder.
    * Open `manifestWrangler.js` in a text editor.
    * Find the line defining the `SCRIPT_URL_TODAY` constant:
        ```javascript
        const SCRIPT_URL_TODAY = 'YOUR_WEB_APP_URL_HERE';
        ```
    * Replace `'YOUR_WEB_APP_URL_HERE'` with the **Web app URL** you copied during the Apps Script deployment. Make sure it's enclosed in single quotes. Save the file.

4.  **Host Frontend:**
    * Upload the folder containing `index.html`, `alchemy.css`, and the *updated* `manifestWrangler.js` to a web hosting provider (like GitHub Pages, Netlify, Vercel, or your company's web server).
    * Alternatively, for testing, you can run a simple local web server from that folder.

## Usage Guide 📖

1.  Navigate to the URL where you hosted the frontend files (`index.html`).
2.  You will see the "Simba Car Hire Manifest" card.
3.  Click the file input area ("Choose File" or similar).
4.  Select the daily manifest Excel file (`.xls` or `.xlsx`) from your computer.
    * **Ensure the file format is correct:** Contains sheet(s) with `"Pick"` in the name, headers in Row 2, data from Row 3, and includes necessary columns like `'Time'`, `'Res.'`, `'Vehicle'`, `'Pickup Date'`, etc.
5.  Click the **`Upload File`** button.
6.  The loading animation will appear, showing the upload progress. **Do not close the window.**
7.  Once complete, an alert message "File submitted successfully! (ﾉ◕ヮ◕)ﾉ\*:･ﾟ✧" will appear. Click `OK`. The page will reload.
8.  You can now click the **`Go to Sheet`** button to open the `'Pickup List'` Google Sheet in a new tab and verify the updated data.

## Important Notes ⚠️

* **File Format Dependency:** The tool *heavily relies* on the specific structure of the input Excel file (Sheet names containing `"Pick"`, headers in Row 2, data from Row 3, specific column names). Changes to the manifest format will require updates to the JavaScript (`manifestWrangler.js`) and potentially the Apps Script.
* **Data Clearing Logic:** Be aware that uploading a file with a `'Pickup Date'` different from the date currently in Row 3 of the sheet **will erase all data from Row 3 downwards** before adding the new data. Double-check the file before uploading.
* **Duplicate Handling:** Rows are identified as duplicates based *only* on the `'Res.'` number. If a reservation needs to be updated, it might need manual handling in the sheet (or modification of the script logic).
* **Upload Speed:** Because data is sent row-by-row with a delay (to avoid overwhelming the Apps Script), uploading very large manifests might take a noticeable amount of time.
* **Security:** If deployed with `Who has access: Anyone`, the Apps Script URL is technically public. While unguessable, consider security implications if the data is highly sensitive. Restricting access to your Google Workspace organization is recommended if possible.

## Technology Stack 💻

* **Frontend:** HTML5, CSS3, JavaScript (ES6+)
* **Backend:** Google Apps Script
* **Libraries:**
    * SheetJS (`xlsx.full.min.js`) - For client-side Excel parsing.
    * Bootstrap 5 - For frontend styling and components.
* **Platform:** Google Workspace / Google Sheets

---

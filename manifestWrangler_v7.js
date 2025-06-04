/**
 * @fileoverview Script to handle Excel file upload, process pickup data,
 * sort it, and send it row by row to a Google Apps Script endpoint.
 * @version 6.0.0
 * @author Ranuja Lakdiw
 */

// --- Configuration ---

/**
 * URL of the Google Apps Script web app endpoint for receiving data.
 * @const {string}
 */
const SCRIPT_URL_TODAY = 'https://script.google.com/macros/s/AKfycbzSxOtxn7jQHq8kk-rPtJvxdqFWR7X1Qf4Mj_X1MlohwwkOB0QTk7aHYwvuedua_9J9/exec';
const SCRIPT_URL_TODAY_DROPOFF = 'https://script.google.com/macros/s/AKfycbwvb1fMVmq61A-BqR9xRMw7N14aXWSn-1cfLEwF6a13padYMFcNZaL2em2dlmIa6Wic/exec';
const SCRIPT_URL_TOMORROW = SCRIPT_URL_TODAY;
const SCRIPT_URL_TOMORROW_DROPOFF = SCRIPT_URL_TODAY_DROPOFF;

/**
 * Keyword to identify sheets containing pickup data abd dropoff data.
 * @const {string}
 */
const PICKUP_SHEET_KEYWORD = 'Pick';
const DROPOFF_SHEET_KEYWORD = 'Drop';

/**
 * Column name used to validate the file format. Assumes this column must exist.
 * @const {string}
 */
const VALIDATION_COLUMN = 'Res.';

/**
 * Delay in milliseconds between sending each row to the Google Sheet.
 * Helps avoid overwhelming the Apps Script endpoint (rate limiting).
 * @const {number}
 */
const UPLOAD_DELAY_MS = 1500;

/**
 * Key used for the special "Sort" signal object sent at the end.
 * @const {number}
 */
const SORT_SIGNAL_KEY = 1000;

/**
 * Location codes used for cleaning the 'Vehicle' field.
 * @const {string[]}
 */
const LOCATION_CODES = ['MEL', 'ADL', 'SYD', 'MSR', 'BNE', 'CNS'];

// --- DOM Elements ---

const fileInput = document.getElementById('input');
const uploadButton = document.getElementById('upload');
const uploadButtonTomm = document.getElementById('upload-tomm');
const loaderElement = document.getElementById('loader');
const loaderBar = document.getElementById('loading-bar');
const loaderPercentElement = document.getElementById('loader-perct');

// --- State ---

/**
 * Holds the File object selected by the user.
 * @type {File | undefined}
 */
let selectedFile;

/**
 * Counter for generating unique keys before sorting. Reset implicitly on each upload.
 * @type {number}
 */
let pickupDataCounter = 0;
let dropoffDataCounter = 0;

//--- Alert Function ---
/**
 * Sends alert messages
 * Haults every tasks until closed
 * @param {Text} txt The text that will appear in the alert body
 * @param {Boolean} success If the alert is a success message or not, false on default
 */
const alert = async (txt, success = false) => {
    const alert_container = document.querySelector(".alert");
    const alert_box = document.querySelector(".alert-box");
    const alert_text = document.querySelector(".alert-msg");
    const alert_success = document.querySelector(".success");
    const alert_success_emoji = document.querySelector("#success-emoji");
    const alert_warning = document.querySelector(".warning");
    const alert_warning_emoji = document.querySelector("#warning-emoji");
    const alert_btn = document.querySelector(".alert-btn button");

    // Display alert message. Check if it is a success message or not and display the relevant 
    alert_text.innerHTML = txt;
    if (success) {
        alert_success.style.display = "block";
        alert_success_emoji.style.display = "block";
    } else {
        alert_warning.style.display = "block";
        alert_warning_emoji.style.display = "block";
        alert_box.style.animation = "shake .3s linear";
    }
    alert_container.style.display = "flex";
    
    const btn_click = (btn) => {
        return new Promise((resolve) => {
            btn.addEventListener('click', (e) => {
                // Remove alert on button click
                alert_container.style.display = "none";
                if (success) {
                    alert_success.style.display = "none";
                    alert_success_emoji.style.display = "none";
                } else {
                    alert_warning.style.display = "none";
                    alert_warning_emoji.style.display = "none";
                    alert_box.style.animation = "";
                }
                alert_text.innerHTML = '';
                resolve(e);

                // Remove promise and event listener
            }, { once: true });
        });
    }
    alert_btn.focus();
    await btn_click(alert_btn);


}

// --- Event Listeners ---

/**
 * Handles the file selection event.
 * Stores the last selected file.
 */
fileInput.addEventListener('change', (event) => {
    // Get the most recently selected file in case multiple were somehow selected
    if (event.target.files && event.target.files.length > 0) {
        selectedFile = event.target.files[event.target.files.length - 1];
        console.log('📃 File selected:', selectedFile.name);
    } else {
        selectedFile = undefined;
        console.log('File selection cleared.');
    }
});

/**
 * Handles the upload button's click event.
 * Initiates the file reading, processing, and uploading sequence.
 */
uploadButton.addEventListener('click', () => {
    if (!selectedFile) {
        alert('🤦‍♀️ Select the file first! ..... (or just go to sheet)');
        return;
    }

    console.log(`Processing file: ${selectedFile.name}`);
    processAndUploadFile(selectedFile, SCRIPT_URL_TODAY, SCRIPT_URL_TODAY_DROPOFF);
});

uploadButtonTomm.addEventListener('click', () => {
    if (!selectedFile) {
        alert('😤 Select the file first! ..... (or just go to sheet)');
        return;
    }

    console.log(`⚙️ Processing file: ${selectedFile.name}`);
    processAndUploadFile(selectedFile, SCRIPT_URL_TOMORROW, SCRIPT_URL_TOMORROW_DROPOFF, true);
});




// --- Core Logic ---

/**
 * Reads the selected Excel file, processes sheets containing pickups,
 * sorts the data, and sends it to the Google Sheet.
 * @param {File} file The Excel file to process.
 */
const processAndUploadFile = (file, pickup_url, dropoff_url, tomm = false) => {
    const fileReader = new FileReader();

    // Configure the FileReader to read the file as an ArrayBuffer
    fileReader.readAsArrayBuffer(file);

    // Define what happens once the file is loaded into memory
    fileReader.onload = (event) => {
        try {
            const arrayBuffer = event.target.result;
            if (!arrayBuffer) {
                throw new Error("FileReader did not return a result.");
            }

            // Convert ArrayBuffer to Uint8Array, then to a binary string
            const data = new Uint8Array(arrayBuffer);
            let binaryString = '';
            // Avoid creating a large intermediate array if possible
            for (let i = 0; i < data.length; i++) {
                binaryString += String.fromCharCode(data[i]);
            }

            // Parse the binary string into an Excel workbook object using SheetJS (XLSX)
            // Assuming 'XLSX' is globally available (e.g., via <script> tag)
            const workbook = XLSX.read(binaryString, { type: 'binary' });

            // --- Sheet Validation ---
            const hasPickupSheet = workbook.SheetNames.some(sheetName =>
                sheetName.includes(PICKUP_SHEET_KEYWORD)
            );
            const hasDropoffSheet = workbook.SheetNames.some(sheetName =>
                sheetName.includes(DROPOFF_SHEET_KEYWORD)
            );

            if (!hasPickupSheet || !hasDropoffSheet) {
                alert(`🧐 Are you sure you used the correct file? No "${PICKUP_SHEET_KEYWORD}" found.`);
                return; // Stop processing
            }

            // --- Data Extraction and Processing ---
            let allPickups = {};
            let allDropoffs = {};
            dropoffDataCounter = 0;
            pickupDataCounter = 0; // Reset counter for each file upload

            workbook.SheetNames.forEach(sheetName => {
                // Process only sheets identified as pickup sheets
                if (sheetName.includes(PICKUP_SHEET_KEYWORD)) {

                    // Convert sheet data to an array of row objects.
                    // `range: 2` means "start reading data from row 3" (0-indexed is topic, 1-indexed is unrelated data, 2-indexed is header, 3 is data start).
                    const rowsArray = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { range: 2, defval: "" }).slice(0, -1); // Using sheet_to_json

                    // Validate format based on the first data row (if any)
                    if (rowsArray.length > 0 && rowsArray[0][VALIDATION_COLUMN] === undefined) {
                        throw new Error(`Wrong file format in sheet "${sheetName}".`);
                    }

                    // Omit the last row which normally has daily total revenue information
                    // const rowObject_sliced = Object.fromEntries(Object.entries(rowObject).slice(0, Object.keys(rowObject).length - 1));

                    // Filter and clean the data from the current sheet
                    const cleanedData = filterData(rowsArray, PICKUP_SHEET_KEYWORD, tomm);

                    // Add unique keys to the cleaned data before merging
                    const keyedData = addSequentialKeys(cleanedData);

                    // Merge the processed data from this sheet into the main collection
                    allPickups = mergeObjects(allPickups, keyedData);
                }
                // Process only sheets identified as dropoff sheets
                if (sheetName.includes(DROPOFF_SHEET_KEYWORD)) {

                    // Convert sheet data to an array of row objects.
                    // `range: 2` means "start reading data from row 3" (0-indexed is topic, 1-indexed is unrelated data, 2-indexed is header, 3 is data start).
                    const rowsArray = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { range: 2, defval: "" }).slice(0, -1); // Using sheet_to_json

                    // Validate format based on the first data row (if any)
                    if (rowsArray.length > 0 && rowsArray[0][VALIDATION_COLUMN] === undefined) {
                        throw new Error(`Wrong file format in sheet "${sheetName}".`);
                    }

                    // Filter and clean the data from the current sheet
                    const cleanedData = filterData(rowsArray, DROPOFF_SHEET_KEYWORD, tomm);

                    // Add unique keys to the cleaned data before merging
                    const keyedData = addSequentialKeys(cleanedData);

                    // Merge the processed data from this sheet into the main collection
                    allDropoffs = mergeObjects(allDropoffs, keyedData);
                }

            });

            // --- Sorting ---
            const sortedPickups = sortData(allPickups); // Sorts and re-indexes with '#'
            const sortedDropoffs = sortData(allDropoffs); // Sorts and re-indexes with '#'

            // --- Data Upload ---
            // Add a special object to signal the end of data and trigger sorting on the server-side (if needed)
            const dataToSend_pickups = mergeObjects(sortedPickups, { [SORT_SIGNAL_KEY]: { Sort: true } });
            const dataToSend_dropoffs = mergeObjects(sortedDropoffs, { [SORT_SIGNAL_KEY]: { Sort: true } });
            uploadToGoogleSheet(dataToSend_pickups, dataToSend_dropoffs, pickup_url, dropoff_url);

        } catch (error) {
            console.error('Error processing file:', error);
            alert(`An error occurred while processing the file 😱: ${error.message}\nPlease check the console for details and ensure the file format is correct.`);

        }
    };

    // Define error handling for the FileReader itself
    fileReader.onerror = (error) => {
        console.error('Error reading file:', error);
        alert('Could not read the selected file 🥸. Please ensure it is not corrupted and try again.');
    };
};

// --- Data Processing Functions ---

/**
 * Cleans and transforms the raw data extracted from a pickup sheet.
 * Removes unnecessary columns and formats specific fields.
 * @param {Array<Object>} rowsArray Array of row objects from the sheet.
 * @returns {Array<Object>} Array of cleaned row objects.
 */
const filterData = (rowsArray, sheet_name, tomm = false) => {
    return rowsArray.map(row => {
        // Create a copy to avoid modifying the original object if rowsArray is reused
        const cleanedRow = { ...row };

        // --- Remove Unnecessary Columns ---
        // List columns to delete for clarity
        var columnsToDelete = [];
        var regoRowName = 'Rego (ready)';
        if (sheet_name == PICKUP_SHEET_KEYWORD) {
            columnsToDelete = [
                '#', '# Days', 'Balance', 'Booked', 'Daily Rate', 'Day',
                'Dropoff Date', 'Insurance', 'Rental Value', 'Checkin Completed',
                'Pickup', 'Ref', 'Agent', // Note: Agent is deleted *after* potentially being used below (if needed in future)
                'Vehicle', // Deleted after extracting Rego
                'Items'    // Deleted after extracting Notes
            ];
            // --- Process 'Arrival' Column ---
            if (typeof cleanedRow['Arrival'] === 'string') {
                if (cleanedRow['Arrival'].includes('No. Travelling')) {
                    // Extract text after "No. Travelling: " (16 characters)
                    cleanedRow['Arrival'] = cleanedRow['Arrival'].slice(16).trim();
                } else if (cleanedRow['Arrival'].includes('N/A') || cleanedRow['Arrival'].includes('TBA')) {
                    // Clear non-informative values
                    cleanedRow['Arrival'] = '';
                }
            } else if (cleanedRow['Arrival'] === undefined || cleanedRow['Arrival'] === null) {
                cleanedRow['Arrival'] = ''; // Ensure field is a string
            }
        } else {
            columnsToDelete = [
                '#', '# Days', 'Update', 'Notes', 'Daily Rate', 'Day',
                'Pickup Date', 'Insurance', 'Rental Value',
                'Dropoff', 'Departure', 'Next Rental', 'Ref',
                'Vehicle', 'Balance', 'color', // Deleted after extracting Rego
                'Items'    // Deleted after extracting Notes
            ];

            regoRowName = 'Rego';
        }

        if (tomm) {
            cleanedRow["Tomorrow"] = 'true';
        } else {
            cleanedRow["Tomorrow"] = 'false';
        }

        // --- Process 'Vehicle' Column -> regoRowName ---
        if (cleanedRow['Vehicle'] !== undefined) {
            let rego = String(cleanedRow['Vehicle']); // Ensure it's a string
            // Remove location codes from the end of the string
            LOCATION_CODES.forEach((loc) => {
                rego = snip(rego, loc);
            });

            cleanedRow[regoRowName] = rego;
        } else {
            if (sheet_name == PICKUP_SHEET_KEYWORD) {
                cleanedRow[regoRowName] = ''; // Ensure field exists even if Vehicle was missing
            } else {
                cleanedRow[regoRowName] = 'UNALLOCATED';
            }
        }


        // --- Process 'Items' Column -> 'Items / Notes' ---
        if (cleanedRow['Items'] !== undefined) {
            let notes = String(cleanedRow['Items']);
            // Remove specific repetitive text and clean up spacing around parentheses
            notes = snipSnap(notes, '- Universal '); // Remove "- Universal " globally
            notes = notes.replace(/\)/g, ') ');     // Add space after closing parenthesis
            cleanedRow['Items / Notes'] = notes.trim();
        } else {
            cleanedRow['Items / Notes'] = ''; // Ensure field exists
        }

        columnsToDelete.forEach(colName => {
            delete cleanedRow[colName];
        });

        return cleanedRow;
    });
};

/**
 * Adds sequential keys (based on a global counter) to an array of objects.
 * Used before merging data from different sheets to ensure unique keys temporarily.
* @param {Array<Object>} dataArray Array of data objects.
* @returns {Object} Object where keys are sequential numbers and values are the data objects.
*/
const addSequentialKeys = (dataArray) => {
    const keyedObject = {};
    dataArray.forEach(item => {
        keyedObject[pickupDataCounter] = item;
        pickupDataCounter++;
    });
    return keyedObject;
};

// --- Sorting Functions ---

/**
 * Sorts the pickup data object using QuickSort based on Time and then Res.
 * Re-indexes the sorted data starting from 0 and adds a sequential '#' property.
 * @param {Object} pickupObject Object containing pickup data keyed temporarily.
 * @returns {Object} Object containing sorted pickup data, keyed sequentially from 0, with '#' property added.
 */
const sortData = (pickupObject) => {
    const keys = Object.keys(pickupObject);
    if (keys.length <= 1) {
        // If 0 or 1 item, re-index and return directly
        const sorted = {};
        keys.forEach((key, index) => {
            sorted[index] = { ...pickupObject[key], '#': index + 1 };
        });
        return sorted;
    }

    // Perform the QuickSort based on Time and Res.
    const sortedKeys = quickSortRecursive(pickupObject, keys);

    // Rebuild the object with sequential keys (0, 1, 2...) and add the '#' property
    const finalSortedObject = {};
    sortedKeys.forEach((originalKey, index) => {
        finalSortedObject[index] = {
            ...pickupObject[originalKey], // Copy properties from original object
            '#': index + 1 // Add 1-based sequential '#' number
        };
    });

    return finalSortedObject;
};

/**
 * Recursive QuickSort implementation for sorting object keys based on object values.
 * @param {Object} obj The object containing the data to sort by.
 * @param {Array<string>} keyList The list of keys from obj to sort.
 * @returns {Array<string>} The sorted list of keys.
 */
const quickSortRecursive = (obj, keyList) => {
    const len = keyList.length;
    if (len <= 1) {
        return keyList; // Base case for recursion
    }

    // Choose a pivot (randomly for better average performance)
    const pivotIndex = Math.floor(Math.random() * len);
    const pivotKey = keyList[pivotIndex];

    const { left, center, right } = partitionKeys(obj, keyList, pivotKey);

    // Recursively sort the left and right partitions
    const sortedLeft = quickSortRecursive(obj, left);
    const sortedRight = quickSortRecursive(obj, right);

    // Combine the sorted parts
    return [...sortedLeft, ...center, ...sortedRight];
};

/**
 * Partitions the keys based on comparison with the pivot element's values.
 * Sorts primarily by "Time" (ascending).
 * Sorts secondarily by "Res." (ascending) for items with the same "Time".
 * @param {Object} obj The object containing the data.
 * @param {Array<string>} keyList The list of keys to partition.
 * @param {string} pivotKey The key of the pivot element.
 * @returns {{left: Array<string>, center: Array<string>, right: Array<string>}} Partitioned keys.
 */
const partitionKeys = (obj, keyList, pivotKey) => {
    const left = [];   // Keys for elements less than pivot
    const center = []; // Keys for elements equal to pivot (including pivot itself)
    const right = [];  // Keys for elements greater than pivot
    const pivotValue = obj[pivotKey];

    keyList.forEach((key) => {
        const currentValue = obj[key];
        // Ensure Time and Res are comparable, handle potential undefined/null
        const currentTime = currentValue['Time'] ?? -Infinity; // Treat missing time as very early
        const pivotTime = pivotValue['Time'] ?? -Infinity;
        const currentRes = currentValue['Res.'] ?? -Infinity; // Treat missing Res as very low
        const pivotRes = pivotValue['Res.'] ?? -Infinity;

        if (currentTime < pivotTime) {
            left.push(key);
        } else if (currentTime > pivotTime) {
            right.push(key);
        } else {
            // Times are equal, compare by Reservation number ('Res.')
            if (currentRes < pivotRes) {
                left.push(key);
            } else if (currentRes > pivotRes) {
                right.push(key);
            } else {
                // Times and Res are equal, keep them together (relative order maintained by center)
                center.push(key);
            }
        }
    });

    return { left, center, right };
};


// --- Google Sheet Upload Function ---

/**
 * Sends the processed data to the Google Apps Script endpoint, one row at a time.
 * Displays a progress loader during the upload.
 * Uses async/await and a delay to manage the uploads sequentially.
 * @param {Object} dataObject The final data object to upload, keyed sequentially.
 */
const uploadToGoogleSheet = async (pickups, dropoffs, pickup_url, dropoff_url) => {

    // Show loader
    if (loaderElement) loaderElement.style.display = 'flex';
    if (loaderPercentElement) loaderPercentElement.textContent = '000';
    if (loaderBar) loaderBar.style.width = '0%';

    const pickupKeys = Object.keys(pickups);
    const dropoffKeys = Object.keys(dropoffs);
    const totalRows = pickupKeys.length + dropoffKeys.length;
    var uploadedRows = 0;

    console.log(`Starting upload of ${totalRows} rows...`);

    // Helper function for introducing delay
    // const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const upload = async (dataObject, dataKeys, url) => {

        for (let i = 0; i < dataKeys.length; i++) {
            const key = dataKeys[i];
            const rowData = dataObject[key];
            const formData = new FormData();

            // Populate FormData with the data for the current row
            Object.keys(rowData).forEach((prop) => {
                formData.append(prop, rowData[prop]);
            });

            try {
                // Wait for the specified delay before sending the next request (except for the first one)
                // if (i > 0) {
                //     await delay(UPLOAD_DELAY_MS);
                // }

                console.log(`Uploading row ${uploadedRows + 1}/${totalRows} (Key: ${key})`);
                // fetch(url, { method: 'POST', body: formData });
                const response = await fetch(url, { method: 'POST', body: formData });
                // Basic check if the request was successful (status 200-299)
                // Google Apps Script redirects often result in opaque responses if not configured for CORS,
                if (!response.ok && response.type !== 'opaque') {
                    // Try to get error details if possible
                    const errorText = await response.text();
                    console.warn(`Warning: Fetch response not OK for row ${uploadedRows + 1}. Status: ${response.status}. Details: ${errorText}`);
                    // Decide if you want to stop the upload or continue
                    throw new Error(`Upload failed for row ${uploadedRows + 1}: Status ${response.status}`);
                }

                // Update progress percentage
                uploadedRows += 1;
                const percentComplete = Math.floor((uploadedRows / totalRows) * 100);
                let p = percentComplete;
                if (loaderBar) loaderBar.style.width = `${percentComplete}%`;
                if (percentComplete < 10) p = `00${percentComplete}` 
                else if (percentComplete < 100) p = `0${percentComplete}` 
                if (loaderPercentElement) loaderPercentElement.textContent = `${p}`;


            } catch (error) {
                console.error(`🥸 Error uploading row ${uploadedRows + 1} (Key: ${key}):`, error.message);
                if (loaderElement) loaderElement.style.display = 'none'; // Hide loader on error
                alert(`😱 Error during upload at row ${uploadedRows + 1}: ${error.message} \nCheck console. Upload stopped.`);
                window.alert(`Upload stopped due to an error. ${error.message} \nPlease check the console for details.`);
                return; // Stop the upload process
            }
        }
    }

    // Uploading the pickup rows
    await upload(pickups, pickupKeys, pickup_url);
    // Uploading the dropoff rows
    await upload(dropoffs, dropoffKeys, dropoff_url);

    // --- Upload Completion ---
    console.log('Upload complete.');
    await alert('File submitted successfully! 😎', true);
    if (loaderElement) loaderElement.style.display = 'none'; // Hide loader
    if (loaderPercentElement) loaderPercentElement.textContent = ''; // Clear percentage
    if (loaderBar) loaderBar.style.width = '0%';
    window.location.reload(); // Reload the page after successful submission
};


// --- Utility Functions ---


/**
 * Removes characters from a string starting from the first match of a regex.
 * @param {string} inputString The string to process.
 * @param {RegExp | string} regexp The pattern to search for.
 * @param {number} [from=0] The starting index for the search.
 * @returns {string} The snipped string, or the original string if the pattern isn't found.
 */
const snip = (inputString, regexp, from = 0) => {
    // Ensure input is a string
    const str = String(inputString);
    const index = str.slice(from).search(regexp);
    return (index === -1) ? str : str.slice(from, index); // Adjust index back relative to original string
};

/**
 * Removes all occurrences of a pattern (case-insensitive) from a string.
 * @param {string} inputString The string to process.
 * @param {RegExp | string} regexp The pattern to remove.
 * @returns {string} The string with the pattern removed.
 */
const snipSnap = (inputString, regexp) => {
    // Ensure input is a string
    const str = String(inputString);
    // Create a global, case-insensitive RegExp if a string pattern is provided
    const regex = (regexp instanceof RegExp) ? regexp : new RegExp(regexp, 'gi');
    return str.replace(regex, '');
};

/**
 * Merges multiple objects shallowly. Properties in later objects overwrite earlier ones.
 * Creates copies of the input objects to avoid modifying them directly.
 * @param {...Object} objects Objects to merge.
 * @returns {Object} A new object containing merged properties.
 */
const mergeObjects = (...objects) => {
    // Simple shallow merge using spread syntax
    return objects.reduce((merged, current) => ({ ...merged, ...(current || {}) }), {});
    // Using JSON.parse(JSON.stringify(object)) for deep copies can be slow and has limitations (e.g., with Dates, Functions).
    // A shallow merge is often sufficient if the objects don't have nested structures that need independent copies.
};

// --- Initial Console Message ---
console.log("Welcome: to proceed upload a file that contains relevant information, in the original format, and proceed to view the sheet");

// --- Old Functions (Kept for reference) ---

/*

// This seems replaced by addSequentialKeys. Keep if used independently, otherwise remove.
const keyRefresh = (obj) => {
     let temp = {};
     Object.keys(obj).forEach((key) => {
         temp[window.pickupCount] = obj[key]; // Problem: Uses global window.pickupCount
         window.pickupCount++;
     })
     return temp;
 }

 // Old partition logic - replaced by partitionKeys which handles pivot equality better
 const partition_old = (obj, key_list, pivot) => {
     var pivot_value = obj[pivot]["Time"];
     var left = [];
     var right = [];

     key_list.forEach((key) => {
         if (key != pivot) { // This skips the pivot, quickSort needs to handle it
             if (obj[key]["Time"] > pivot_value) {
                 right.push(key);
             } else if (obj[key]["Time"] < pivot_value) {
                 left.push(key);
             } else if (obj[key]["Res."] <= obj[pivot]["Res."]) { // Tie-breaking logic
                 left.push(key);
             } else if (obj[key]["Res."] > obj[pivot]["Res."]) {
                 right.push(key);
             }
         }
     });
     // This partition doesn't return the pivot itself, making the quickSort combine step slightly different
     return [left, right];
 }

 // Old sort logic - replaced by quickSortRecursive and sortPickups
 const sort_old = (obj, key_list) => {
     var len = key_list.length;
     if (len <= 1) { return key_list };
     var pivot = key_list[Math.floor(Math.random() * len)];
     var left = [];
     var right = [];
     // Using the old partition which doesn't return pivot
     [left, right] = partition_old(obj, key_list, pivot);
     let temp_left = sort_old(obj, left);
     let temp_right = sort_old(obj, right);
     // Combine requires adding the pivot back in
     let result = temp_left.concat([pivot], temp_right);
     return result;
 }

 // Old quickSort logic - replaced by sortPickups
 const quickSort_old = (obj) => {
     let key_list = sort_old(obj, Object.keys(obj)); // Calls the old sort
     let count = 0;
     let temp = {};
     key_list.forEach((key) => {
         temp[count] = obj[key];
         temp[count]["#"] = count + 1; // Adds '#' based on sorted order
         count++;
     });
     return temp; // Returns object keyed 0, 1, 2...
 }
 */
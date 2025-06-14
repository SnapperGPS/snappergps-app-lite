/****************************************************************************
 * uploadUI.js
 * March 2021
 *****************************************************************************/

/* global L, Blob, startUpload, addReferencePoint, uploadSnapshot, finishUpload, cancelUpload, device, getDeviceInformation, requestDevice, setDisconnectFunction, resetDeviceInfo, connectToDevice, isDeviceAvailable, updateCache, snapshotCountSpan, deviceIDSpan, deviceID, AM_USB_MSG_TYPE_GET_INFO */

const USE_MAX_VELOCITY = true;

const USE_ZIP = false;  // Offer .bin and .csv files as .zip download

// Status variable which locks out certain actions when upload is in process
var uploading = false;
var transferring = false;
var uploadingDevice = false;
var uploadingFile = false;
var transferringDevice = false;

// Object to manage push notification subscription
let subscriptionJson = '{}';

// Error display UI

const errorCard = document.getElementById('error-card');
const errorText = document.getElementById('error-text');

const aimsPink = window.getComputedStyle(errorCard).getPropertyValue('--aims-pink');

// Non-duplicated UI elements

const pairButton = document.getElementById('pair-button');

const transferButton = document.getElementById('transfer-button');
const transferSpinner = document.getElementById('transfer-spinner');

// Count snapshots found on device
const snapshotCountLabelTransfer = document.getElementById('snapshot-count-transfer');
const snapshotCountLabelUpload = document.getElementById('snapshot-count-upload');

// Length of one snapshot in bytes
const SNAPSHOT_BUFFER_SIZE = 0x1800; // On device (6 KB)
const SNAPSHOT_SIZE = 6138; // Desired 12 ms snapshot (12 ms * 4.092 MHz / 8 Bit)

// Number of bytes of one external flash page used for meta data
const METADATA_SIZE = 8;

// USB message to request start reading a new snapshot from flash memory
const AM_USB_MSG_TYPE_GET_SNAPSHOT = 0x81; // previously 0x03

// USB message to request a new page of the current snapshot
const AM_USB_MSG_TYPE_GET_SNAPSHOT_PAGE = 0x84; // previously 0x06

function displayError(errorDescription) {

    console.error(errorDescription);

    errorCard.style.display = '';
    errorText.innerHTML = errorDescription;

    window.scrollTo(0, 0);

}

/**
 * Enable all UI elements
 */
function enableUI() {

    if (navigator.usb && !transferring) {

        if (isDeviceAvailable()) {

            // Upload or transfer from device buttons disabled
            // if no device is connected
            // or no snapshots on device
            if (+snapshotCountSpan.innerHTML > 0) {

                transferButton.disabled = false;

            }

        } else {

            // Allow to pair device again
            pairButton.disabled = false;

        }

    }

}

/**
 * Disable all UI elements while transferring data from device.
 */
function disableDeviceUI() {

    // Disable all device-related buttons
    pairButton.disabled = true;
    // changedeviceButton.disabled = true;
    transferButton.disabled = true;

}

/**
 * Update transfer button and UI to display a spinner and "Transferring" text when snapshots are being transferred
 * @param {bool} isTransferring Is the app currently transferring snapshots
 */
function setTransferring(isTransferring) {

    transferSpinner.style.display = isTransferring ? '' : 'none';

    transferringDevice = isTransferring;
    transferring = transferringDevice;

    if (isTransferring) {

        disableDeviceUI();

    } else {

        enableUI();

    }

}

/**
 * Asynchronously read snapshot from USB buffer and upload it together with meta data.
 * Do not invoke this function too often in parallel, e.g., for all
 * (potentially 11,000) snapshots. Instead, cap the maximum number of
 * instances running at the same time with processDevice2ServerQueue().
 * @param {string}      uploadID Unique ID returned by startUpload().
 * @param {object}      meta Meta data object.
 * @param {ArrayBuffer} data Byte array returned from receiver after requesting meta data.
 * @return {Promise}
 */
async function getSnapshotDevice(uploadID, meta, data) {

    return new Promise((resolve) => {

        // Initialize the snapshot to upload with zeros.
        // If the incoming data is shorter than the desired length,
        // then this applies zero padding.
        const snapshotBuffer = new Uint8Array(SNAPSHOT_SIZE).fill(0);

        // Loop over buffer that has been transmitted via USB
        for (let snapshotBufferIdx = 0;
            snapshotBufferIdx < SNAPSHOT_BUFFER_SIZE - METADATA_SIZE;
            ++snapshotBufferIdx) {

            // Write received byte to buffer
            snapshotBuffer[snapshotBufferIdx] = data.getUint8(snapshotBufferIdx);

        }

        console.log('Uploading file');

        const snapshotBlob = new Blob([snapshotBuffer], { type: 'application/octet-stream' });

        resolve(uploadSnapshot(uploadID, snapshotBlob, meta.timestamp, meta.battery, 1, 1, meta.temperature));

    });

}

/**
 * Looping function which checks to see if WebUSB device has been connected
 */
function checkForDevice(repeat = true) {

    if (isDeviceAvailable()) {

        if (!transferring) {

            // Only talk to device if it is currently not read out.

            getDeviceInformation();

            // Upload/transfer button disabled if no device present
            if (+snapshotCountSpan.innerHTML > 0) {

                if (!uploading && latInputs[0].value !== '' && lngInputs[0].value !== '') {
                    // Can only upload if start point is provided

                    uploadDeviceButton.disabled = false;

                }

                transferButton.disabled = false;

            }

        }

        pairButton.disabled = true;

    } else {

        resetDeviceInfo();

        if (!transferring) {

            uploadDeviceButton.disabled = true;

            transferButton.disabled = true;

            pairButton.disabled = false;

        }

    }

    if (repeat) {

        setTimeout(checkForDevice, 500);

    }

}

/**
   * Meta data object.
   * @param  {ArrayBuffer}  data Byte array returned from receiver after requesting meta data.
   * @return {Object}       meta Meta data object
   *    @return {Date}      meta.timestamp Timestamp of snapshot
   *    @return {Number}    meta.temperature Temperature measurement in degrees Celsius
   *    @return {Number}    meta.battery Battery voltage measurement in volts
   */
function MetaData(data) {

    // Get timestamp of snapshot
    const seconds = data.getUint8(2) + 256 * (data.getUint8(3) + 256 * (data.getUint8(4) + 256 * data.getUint8(5)));
    const milliseconds = Math.round((data.getUint8(6) + 256 * data.getUint8(7)) / 1024 * 1000);
    this.timestamp = new Date(seconds * 1000 + milliseconds);

    // Convert tenths of degrees Celsius to degrees Celsius
    this.temperature = (data.getUint8(10) + 256 * (data.getUint8(11) + 256 * (data.getUint8(12) + 256 * data.getUint8(13))) - 1024) / 10.0;

    // Convert hundreds of volts to volts
    this.battery = (data.getUint8(14) + 256 * (data.getUint8(15) + 256 * (data.getUint8(16) + 256 * data.getUint8(17)))) / 100.0;

}

pairButton.addEventListener('click', () => {

    requestDevice((err) => {

        if (err) {

            displayError(err);

        } else {

            errorCard.style.display = 'none';

        }

    });

});

// Set function which is called when connection to a WebUSB device is lost

setDisconnectFunction(() => {

    resetDeviceInfo();
    uploadDeviceButton.disabled = true;
    transferButton.disabled = true;

});

transferButton.onclick = async () => {

    snapshotCountLabelTransfer.innerHTML = '0 snapshots transferred.';

    if (!isDeviceAvailable()) {

        return;

    }

    setTransferring(true);

    const data = new Uint8Array([AM_USB_MSG_TYPE_GET_INFO]);

    try {

        // Send request packet and wait for response
        let result = await device.transferOut(0x01, data);
        result = await device.transferIn(0x01, 128);

        // Read device ID
        deviceID = BigInt(0);
        for (let i = 20; i >= 13; --i) { // previously 21..14

            deviceID *= BigInt(256);
            deviceID += BigInt(result.data.getUint8(i));

        }

        // Read firmware
        firmwareDescription = '';
        for (let i = 21; i < 53; ++i) { // previously 22..54

            const char = result.data.getUint8(i);
            if (char > 0) {

                firmwareDescription += String.fromCharCode(char);

            }

        }
        var firmwareVersion = [];
        for (let i = 53; i < 56; ++i) { // previously: -> 54..57

            firmwareVersion.push(result.data.getUint8(i));

        }

    } catch (err) {

        console.error(err);

    }

    // ID to string
    deviceID = deviceID.toString(16).toUpperCase();

    // Crate object that holds data for JSON file
    let jsonData = {
        deviceID: deviceID,
        firmwareDescription: firmwareDescription,
        firmwareVersion: firmwareVersion[0] + '.' + firmwareVersion[1] + '.' + firmwareVersion[2],
        snapshots: []
    };

    if (USE_ZIP) {

        // Create zip file that will be returned
        let zip = new JSZip();
        let filenameArray = [];

    }

    // Messages to communicate to device via USB
    const requestMetaDataMessage = new Uint8Array([AM_USB_MSG_TYPE_GET_SNAPSHOT]);
    const requestSnapshotMessage = new Uint8Array([AM_USB_MSG_TYPE_GET_SNAPSHOT_PAGE]);

    // Arrays for meta data
    let timestampArray = [];
    let temperatureArray = [];
    let batteryArray = [];

    // Count the received snapshots
    let snapshotCount = 0;

    // Keep reading data from device until all snapshots are read
    let keepReading = true;

    while (keepReading) {

        const snapshotBuffer = new Uint8Array(SNAPSHOT_SIZE).fill(0);

        try {

            console.log('Request meta data.');
            // Request to start reading new record from flash memory, start with meta data
            let result = await device.transferOut(0x01, requestMetaDataMessage);

            console.log('Wait for meta data.');
            // Wait until meta data is returned
            result = await device.transferIn(0x01, 128);

            const data = result.data;

            // Check if device has sent data
            // Device uses 2nd byte of transmit buffer as valid flag
            if (data.getUint8(1) !== 0x00) {

                // Get metadata

                console.log('Extract time stamp.');

                const meta = new MetaData(data);

                console.log(meta);

                // Append current meta data to arrays
                timestampArray.push(meta.timestamp);
                temperatureArray.push(meta.temperature);
                batteryArray.push(meta.battery);

                console.log('Start reading snapshot.');

                // Index of next unwritten element in snapshotBuffer

                let snapshotBufferIdx = 0;

                console.log('Requesting snapshot');

                // Send message to device to request next piece of snapshot

                let result = await device.transferOut(0x01, requestSnapshotMessage);

                console.log('Waiting for snapshot');
                result = await device.transferIn(0x01, SNAPSHOT_BUFFER_SIZE - METADATA_SIZE);

                // Loop over buffer that has been transmitted via USB

                while (snapshotBufferIdx < SNAPSHOT_BUFFER_SIZE - METADATA_SIZE) {

                    // Write received byte to buffer and increment counter

                    snapshotBuffer[snapshotBufferIdx] = result.data.getUint8(snapshotBufferIdx);
                    ++snapshotBufferIdx;

                }

                // Construct filename from timestamp
                const dt = meta.timestamp;
                const filename = dt.getUTCFullYear() + ('0' + (dt.getUTCMonth() + 1)).slice(-2) +
                    ('0' + dt.getUTCDate()).slice(-2) + '_' + ('0' + dt.getUTCHours()).slice(-2) +
                    ('0' + dt.getUTCMinutes()).slice(-2) + ('0' + dt.getUTCSeconds()).slice(-2) +
                    '_' + ('00' + dt.getUTCMilliseconds()).slice(-3) +
                    '.bin';

                if (USE_ZIP) {

                    // Add file to zip folder
                    zip.file(filename, snapshotBuffer);

                    // Add filename to meta data
                    filenameArray.push(filename);

                }

                // Append meta data and raw snapshot to data object for JSON file
                jsonData.snapshots.push({
                    timestamp: meta.timestamp.toISOString(),
                    temperature: meta.temperature,
                    batteryVoltage: meta.battery,
                    data: btoa(String.fromCharCode.apply(null, snapshotBuffer))
                });

                snapshotCountLabelTransfer.innerHTML = `${++snapshotCount} snapshots transferred.`;

            } else {

                // All snapshot data has been read from flash

                keepReading = false;

            }

        } catch (err) {

            // Stop reading if USB communication failed

            console.error(err);

            // Stop reading if USB communication failed
            keepReading = false;

            displayError('We could not read all data from your SnapperGPS receiver. You might want to unplug and reconnect it and try again.');

            setTransferring(false);

            return;

        }

    }

    const snapshotCountLabelMemory = snapshotCountLabelTransfer.innerHTML;

    snapshotCountLabelTransfer.innerHTML = snapshotCountLabelMemory + ' Preparing JSON download.';

    // Generate filename from device ID and timestamp of first snapshot
    let timeString = '';
    if (jsonData.snapshots.length > 0) {
        timeString = '_' + jsonData.snapshots[0].timestamp.replaceAll('-', '').replaceAll(':', '').replace('T', '_').replace('.', '_').replace('Z', '');
    }

    // Return JSON file
    const jsonContent = 'data:text/json;charset=utf-8,' +
                        JSON.stringify(jsonData, null, 4);
    createDownloadLink(jsonContent, jsonData.deviceID + timeString + '.json');

    snapshotCountLabelTransfer.innerHTML = snapshotCountLabelMemory;

    if (USE_ZIP) {

        snapshotCountLabelTransfer.innerHTML = snapshotCountLabelMemory + ' Preparing ZIP download.';

        // Turn meta data into .csv file

        const rows = [['filename', 'timestamp', 'temperature', 'battery']];

        function fixPrecision(value, precision) {

            try {

                return value.toFixed(precision);

            } catch {

                return value;

            }

        }

        // Loop over all data and add rows to csv array.
        for (let i = 0; i < snapshotCount; ++i) {

            // UNIX time [s] to UTC.
            const datetime = timestampArray[i].toISOString();

            const temperature = fixPrecision(temperatureArray[i], 1);
            const battery = fixPrecision(batteryArray[i], 2);

            rows.push([filenameArray[i], datetime, temperature, battery]);

        }

        const csvContent = rows.map(e => e.join(',')).join('\n');

        // Add CSV file with meta data to zip folder
        zip.file('metadata.csv', csvContent);

        // Construct zip filename from current time
        const zipName = jsonData.deviceID + timeString + '.zip';

        console.log('Save zip file.');
        // Generate zip file asynchronously
        zip.generateAsync({ type: 'blob' }).then(function (content) {

            // Force down of the zip file
            saveAs(content, zipName);

            snapshotCountLabelTransfer.innerHTML = snapshotCountLabelMemory;

        });

    }

    console.log('Save operation done.');

    setTransferring(false);

}

/**
 * Create an encoded URI to download positions data
 * @param {string} content Text content to be downloaded
 */
function createDownloadLink(content, fileName) {

    const encodedUri = encodeURI(content);

    // Create hidden <a> tag to apply download to

    const link = document.createElement('a');

    link.setAttribute('href', encodedUri);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);

    // Click link

    link.click();

}

if (!navigator.usb) {

    pairButton.disabled = true;
    transferButton.disabled = true;
    uploadDeviceButton.disabled = true;

} else {

    // Check to see if a device is already connected

    checkForDevice(true);

    connectToDevice(true);

}

updateCache();

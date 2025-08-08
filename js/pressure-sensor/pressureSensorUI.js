/****************************************************************************
 * pressureSensorUI.js
 * August 2025
 *****************************************************************************/

/* global requestDevice, isDeviceAvailable, getDeviceInformation,
resetDeviceInfo, setDisconnectFunction, connectToDevice, updateFirmware,
updateCache, firmwareSize, firmwareChunkSize */

// Status variable which locks out certain actions when upload is in process
var transferring = false;
var transferringDevice = false;

// HTML elements

const pairButton = document.getElementById('pair-button');

const errorDisplay = document.getElementById('error-display');
const errorText = document.getElementById('error-text');

const downloadButton = document.getElementById('download-button');
const jsonText = document.getElementById('json-text');

const pressureSpan = document.getElementById('pressure-span');

const pressureSiSpan = document.getElementById('pressure-si-span');

const clearButton = document.getElementById('clear-button');

const transferButton = document.getElementById('download-log-button');
const transferSpinner = document.getElementById('transfer-spinner');

// Count snapshots found on device
const snapshotCountLabelTransfer = document.getElementById('snapshot-count-transfer');

// Code area
const codeTextArea = document.getElementById('code-textarea');
const output = document.getElementById('output');

// Chart

let measurements = {
    pressureArray: [],
    timeArray: []
}

let pressureChart;

let chartPointColors = [];

// Length of one snapshot in bytes
const SNAPSHOT_BUFFER_SIZE = 0x1800; // On device (6 KB)
const SNAPSHOT_SIZE = 6138; // Desired 12 ms snapshot (12 ms * 4.092 MHz / 8 Bit)

// Number of bytes of one external flash page used for meta data
const METADATA_SIZE = 8;

// USB message to request start reading a new snapshot from flash memory
const AM_USB_MSG_TYPE_GET_SNAPSHOT = 0x81; // previously 0x03

// USB message to request a new page of the current snapshot
const AM_USB_MSG_TYPE_GET_SNAPSHOT_PAGE = 0x84; // previously 0x06

/**
 * Enable configuration user interface objects
 */
function enableUI() {

    if (navigator.usb && !transferring) {

        if (isDeviceAvailable()) {

            // Transfer from device buttons disabled
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
 * Disable configuration user interface objects
 */
function disableUI() {

    pairButton.disabled = true;

}

// Live code

var state = {};

function log(text) {
    output.innerHTML = text;
}

/**
 * Change color of last data point in chart
 * @param {*} color 
 */
function colorChart(color) {
    chartPointColors[chartPointColors.length - 1] = color;
    pressureChart.update();
}

async function executeCode(pressure) {
    const codeToExecute = codeTextArea.value;
    try {
        eval(codeToExecute);
    } catch (e) {
        log(e);
    }
}

/**
 * Looping function which checks for presence of WebUSB device
 */
function checkForDevice(repeat = true) {

    if (isDeviceAvailable()) {

        if (!transferring) {

            // Only talk to device if it is currently not read out.

            getDeviceInformation();

            getDeviceInformationPressure();

            // Upload/transfer button disabled if no device present
            if (+snapshotCountSpan.innerHTML > 0) {

                transferButton.disabled = false;

            }

            const pressure = Math.trunc(parseFloat(pressureSpan.innerHTML));
            if (pressure) {

                const time = timeSpan.innerHTML;
                const datetime = Date.UTC(time.substr(0, 4),
                                        time.substr(5, 2),
                                        time.substr(8, 2),
                                        time.substr(11, 2),
                                        time.substr(14, 2),
                                        time.substr(17, 2),
                                        time.substr(20, 3));
                measurements.timeArray.push(datetime / 1000.0);

                measurements.pressureArray.push(pressure);

                jsonText.innerHTML = JSON.stringify(measurements, null, 4);

                pressureChart.data.labels.push((datetime / 1000.0 - measurements.timeArray[0]).toFixed(1));
                pressureChart.data.datasets[0].data.push(pressure);
                chartPointColors.push('rgb(255, 99, 132)');

                pressureChart.update();

                // Execute user code
                executeCode(pressure);

            }

        }

        pairButton.disabled = true;

    } else {

        resetDeviceInfo();

        if (!transferring) {

            transferButton.disabled = true;

            pairButton.disabled = false;

        }

    }

    if (repeat) {

        setTimeout(checkForDevice, 500);

    }

}

/**
 * Report an error to the user
 * @param {string} err Error text to be shown to the user
 */
function displayError(err) {

    console.error(err);

    errorDisplay.style.display = '';
    errorText.innerHTML = err;

    window.scrollTo(0, 0);

}

// Connect to a WebUSB device

pairButton.addEventListener('click', () => {

    requestDevice((err) => {

        if (err) {

            displayError(err);

        } else {

            errorDisplay.style.display = 'none';

        }

    });

});
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

downloadButton.addEventListener('click', () => {
    // Return JSON file
    const jsonContent = 'data:text/json;charset=utf-8,' +
                        JSON.stringify(measurements, null, 4);
    createDownloadLink(jsonContent, 'pressures.json');
});
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

/**
 * 
 * @param {*} data 
 * @returns Dictionary with one array
 */
function pressures(data) {

    // Conversion factor for pressure values
    const TO_MBAR = 10;

    // Number of pressure readings in data
    const pressuresCount = data.getUint8(0);

    // console.log('Pressures count: ' + pressuresCount + '.');

    const pressuresDict = {
        pressure: [],
    };

    // console.log(data);

    for (let i = 0; i < pressuresCount; ++i) {

        let pressure = data.getUint8(1 + 4 * i) + (data.getUint8(2 + 4 * i) << 8) + (data.getUint8(3 + 4 * i) << 16) + (data.getUint8(4 + 4 * i) << 24);
        // Convert to signed 32-bit integer
        if (pressure & 0x80000000) {
            pressure = pressure - 0x100000000;
        }

        // Convert to mbar
        pressure = pressure / TO_MBAR;
        pressuresDict.pressure.push(pressure);

    }

    // Return all arrays
    return pressuresDict;

}

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

    // Messages to communicate to device via USB
    const requestMetaDataMessage = new Uint8Array([AM_USB_MSG_TYPE_GET_SNAPSHOT]);
    const requestSnapshotMessage = new Uint8Array([AM_USB_MSG_TYPE_GET_SNAPSHOT_PAGE]);

    // Count the received snapshots
    let snapshotCount = 0;

    // Guess interval between pressure measurements (since they don't have timestamps)
    let pressureMeasurementInterval = 0;
    let previousTimestamp = 0;

    // Keep reading data from device until all snapshots are read
    let keepReading = true;

    while (keepReading) {

        try {

            // Request to start reading new record from flash memory, start with meta data
            let result = await device.transferOut(0x01, requestMetaDataMessage);

            // Wait until meta data is returned
            result = await device.transferIn(0x01, 128);

            const data = result.data;

            // Check if device has sent data
            // Device uses 2nd byte of transmit buffer as valid flag
            if (data.getUint8(1) !== 0x00) {

                // Get metadata

                const meta = new MetaData(data);

                // console.log(meta);

                // Send message to device to request next piece of snapshot

                let result = await device.transferOut(0x01, requestSnapshotMessage);

                // Waiting for snapshot
                result = await device.transferIn(0x01, SNAPSHOT_BUFFER_SIZE - METADATA_SIZE);

                const pressuresDict = pressures(result.data);

                // Check if size of jsonData.snapshots is greater than zero
                // If so, this is the second snapshot and we can calculate the interval between pressure measurements
                if (jsonData.snapshots.length === 0) {

                    // Append snapshot to data object for JSON file
                    jsonData.snapshots.push({
                        timestamp: meta.timestamp.toISOString(),
                        pressure: pressuresDict.pressure[pressuresDict.pressure.length - 1]
                    });

                } else {

                    const snapshotInterval = (meta.timestamp.getTime() - previousTimestamp.getTime());

                    pressureMeasurementInterval = snapshotInterval / pressuresDict.pressure.length;

                    // Round to hundreds of seconds
                    // pressureMeasurementInterval = Math.round(pressureMeasurementInterval * 100) / 100;

                    // console.log('Pressure measurement interval: ' + pressureMeasurementInterval + ' ms.');

                    // Loop over pressures and append snapshot for each
                    for (let i = 0; i < pressuresDict.pressure.length; ++i) {

                        // Take meta.timestamp and subtract
                        const adjustedTimestamp = new Date(meta.timestamp.getTime() - pressureMeasurementInterval * (pressuresDict.pressure.length - i - 1));

                        // Append snapshot to data object for JSON file
                        jsonData.snapshots.push({
                            // Subtract i * 0.5 sec from timestamp
                            timestamp: adjustedTimestamp.toISOString(),
                            pressure: pressuresDict.pressure[i]

                        });

                    }

                }

                // Add two fields to the last datapoint, "temperature" and "batteryVoltage"
                jsonData.snapshots[jsonData.snapshots.length - 1].temperature = meta.temperature;
                jsonData.snapshots[jsonData.snapshots.length - 1].batteryVoltage = meta.battery;

                previousTimestamp = meta.timestamp;

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

    // Return as CSV file
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'timestamp,pressure_mbar,temperature,batteryVoltage\n';
    for (let i = 0; i < jsonData.snapshots.length; ++i) {

        csvContent += jsonData.snapshots[i].timestamp + ',' +

                        jsonData.snapshots[i].pressure + ',';
        
        // Check first if fields temperature and batteryVoltage exist

        if (jsonData.snapshots[i].temperature) {

            csvContent += jsonData.snapshots[i].temperature;

        }

        csvContent += ',';

        if (jsonData.snapshots[i].batteryVoltage) {

            csvContent += jsonData.snapshots[i].batteryVoltage;

        }

        csvContent += '\n';

    }

    createDownloadLink(csvContent, jsonData.deviceID + timeString + '.csv');

    snapshotCountLabelTransfer.innerHTML = snapshotCountLabelMemory;

    console.log('Save operation done.');

    setTransferring(false);

}

// Set the function which will be called when a WebUSB device is disconnected

setDisconnectFunction(() => {

    // Wipe the device information panel

    resetDeviceInfo();
    transferButton.disabled = true;

});


/**
 * Request information from a connected Snapper device
 */
async function getDeviceInformationPressure() {

    if (device) {

        const data = new Uint8Array([AM_USB_MSG_TYPE_GET_INFO]);

        try {

            // Send request packet and wait for response

            let result = await device.transferOut(0x01, data);

            result = await device.transferIn(0x01, 128);

            // Read device time
            time = result.data.getUint8(1) + 256 * (result.data.getUint8(2) + 256 * (result.data.getUint8(3) + 256 * result.data.getUint8(4)));
            milliseconds = Math.round((result.data.getUint8(5) + 256 * result.data.getUint8(6)) / 1024 * 1000);

            // Temperature in tenths of degrees kelvin
            // Convert to degrees celsius
            // const tempK = result.data.getUint8(5) + 256 * (result.data.getUint8(6) + 256 * (result.data.getUint8(7) + 256 * result.data.getUint8(8)));
            // temp = ((tempK - 2731.5) / 10);

            // Read battery voltage
            batteryVoltage = (result.data.getUint8(9) + 256 * (result.data.getUint8(10) + 256 * (result.data.getUint8(11) + 256 * result.data.getUint8(12)))) / 100;
            // previously 10, 11, 12, 13

            // Read device ID
            deviceID = BigInt(0);
            for (let i = 20; i >= 13; --i) { // previously 21..14

                deviceID *= BigInt(256);
                deviceID += BigInt(result.data.getUint8(i));

            }

            // Read firmware
            firmwareDescription = '';
            for (let i = 21; i < 53; ++i) { // previously 22..54

                firmwareDescription += String.fromCharCode(result.data.getUint8(i));

            }

            firmwareVersion = [];
            for (let i = 53; i < 56; ++i) { // previously 54..57

                firmwareVersion.push(result.data.getUint8(i));

            }

            firmwareSize = result.data.getUint8(56) + 256 * (result.data.getUint8(57) + 256 * (result.data.getUint8(58) + 256 * result.data.getUint8(59)));
            firmwareChunkSize = result.data.getUint8(60) + 256 * result.data.getUint8(61);

            // // Read the following only if firmware description contains SnapperGPS
            // if (firmwareDescription.includes('SnapperGPS')) {

            // Read device state
            switch (result.data.getUint8(62)) { // previously 9

                case 0:
                    statusString = 'Will shutdown';
                    break;
                case 1:
                    statusString = 'Will record';
                    break;
                case 2:
                    statusString = 'Erasing';
                    break;
                default:
                    statusString = 'Undefined';

            }

            // Read number of snapshots on device
            snapshotCount = result.data.getUint8(63) + 256 * (result.data.getUint8(64)); // previously ?

            // Read pressure (int32_t), consider signed integer
            let pressureIn = result.data.getUint8(65) + 
                             (result.data.getUint8(66) << 8) + 
                             (result.data.getUint8(67) << 16) + 
                             (result.data.getUint8(68) << 24);
            // Convert to signed 32-bit integer
            if (pressureIn & 0x80000000) {
                pressureIn = pressureIn - 0x100000000;
            }
            // const rawPressureIn = result.data.getUint8(65) + 256 * (result.data.getUint8(66) + 256 * (result.data.getUint8(67) + 256 * result.data.getUint8(68)));
            // console.log('Raw pressure value: ' + rawPressureIn);
            // const rawTemperatureIn = result.data.getUint8(69) + 256 * (result.data.getUint8(70) + 256 * (result.data.getUint8(71) + 256 * result.data.getUint8(72)));
            // console.log('Raw temperature value: ' + rawTemperatureIn);

            // console.log(result.data);
            // console.log(pressureIn);

            updateDeviceInfo();

            // /** A structure to represent scales **/
            // typedef enum {
            //     LIS3DH_RANGE_16_G = 0b11, // +/- 16g
            //     LIS3DH_RANGE_8_G = 0b10,  // +/- 8g
            //     LIS3DH_RANGE_4_G = 0b01,  // +/- 4g
            //     LIS3DH_RANGE_2_G = 0b00   // +/- 2g (default value)
            // } lis3dh_range_t;

            const TO_MBAR = 10; // Conversion factor for pressure values
            const pressureSi = pressureIn / TO_MBAR; // Convert to SI units (mbar)

            if (pressureIn !== null) {

                pressureSpan.innerHTML = pressureIn;

                pressureSiSpan.innerHTML = (pressureSi).toFixed(1) + ' mbar';

            } else {

                pressureSpan.innerHTML = '-';

                pressureSiSpan.innerHTML = '-';

            }

        transferButton.disabled = false;

        } catch (err) {

            console.error(err);

            resetDeviceInfo();

            transferButton.disabled = true;

        }

    }

}

clearButton.addEventListener('click', () => {

    measurements.pressureArray = [];
    measurements.timeArray = [];
    jsonText.innerHTML = JSON.stringify(measurements, null, 4);
    pressureChart.data.labels = [];
    pressureChart.data.datasets.forEach((dataset) => {
        dataset.data = [];
    });
    pressureChart.update();

});

if (!navigator.usb) {

    pairButton.disabled = true;
    transferButton.disabled = true;

} else {
    // \definecolor{AIMSpurple}{RGB}{94,37,144}  % 5E2590
    // \definecolor{AIMSpink}{RGB}{179,144,207}  % B390CF
    // \definecolor{AIMSgrey}{RGB}{153,153,153}  % 999999
    // \definecolor{AIMSdarkGrey}{RGB}{92,92,92}  % 5C5C5C
    let data = {
        labels: [],
        datasets: [{
            label: 'pressure',
            backgroundColor: 'rgb(94, 37, 144)',
            borderColor: 'rgb(94, 37, 144)',
            data: [],
        }]
    };

    const config = {
        type: 'line',
        data: data,
        options: {
            scales: {
                x: {
                    display: true,
                    title: {
                        display: true,
                        text: 'time [s]'
                    }
                }
            }
        }
    };

    pressureChart = new Chart(
        document.getElementById('pressureChart'),
        config
    );

    // Check to see if a device is already connected

    checkForDevice(true);

    connectToDevice(true);

}

// Update website cache
updateCache();
